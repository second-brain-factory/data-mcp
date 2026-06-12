/**
 * Tests for email-archive ingestion (issue #20), Slice 1: the pure MIME
 * message parser — header unfolding, RFC 2047 encoded-words (AC7),
 * multipart walk, base64/quoted-printable decoding, text/plain preference,
 * html-only fallback, attachment skipping, bulk detection.
 */
import { describe, it, expect } from 'vitest';
import { parseEmailMessage, decodeEncodedWords, splitMultipart, MAX_BODY_CHARS, MAX_HEADER_CHARS, MAX_REFERENCES } from '../src/ingest/email/mime.js';

const CRLF = (s: string) => s.replace(/\n/g, '\r\n');

describe('parseEmailMessage basics', () => {
    it('parses headers and a simple plain body, normalizing CRLF', () => {
        const raw = CRLF(`From: Ana Garcia <ana@example.com>
To: team@example.com
Subject: Q3 budget decision
Date: Wed, 12 Jun 2024 09:30:00 +0200
Message-ID: <m1@example.com>

We agreed to cap the Q3 budget at 40k.
Final.`);
        const mail = parseEmailMessage(raw);
        expect(mail.from).toBe('Ana Garcia <ana@example.com>');
        expect(mail.subject).toBe('Q3 budget decision');
        expect(mail.messageId).toBe('m1@example.com');
        expect(mail.date).toBe('2024-06-12T07:30:00.000Z');
        expect(mail.body).toContain('cap the Q3 budget at 40k');
        expect(mail.isBulk).toBe(false);
    });

    it('unfolds continuation lines in headers', () => {
        const raw = `Subject: a very long subject\n  that was folded\nFrom: x@example.com\n\nbody`;
        const mail = parseEmailMessage(raw);
        expect(mail.subject).toBe('a very long subject that was folded');
    });

    it('extracts References and In-Reply-To message IDs', () => {
        const raw = `Subject: Re: hi\nReferences: <a@x> <b@x>\nIn-Reply-To: <b@x>\n\nok`;
        const mail = parseEmailMessage(raw);
        expect(mail.references).toEqual(['a@x', 'b@x']);
        expect(mail.inReplyTo).toBe('b@x');
    });
});

describe('RFC 2047 encoded-words (AC7)', () => {
    it('decodes B-encoded utf-8 words', () => {
        // "Zażółć gęślą jaźń" in base64 utf-8
        const encoded = `=?UTF-8?B?${Buffer.from('Zażółć gęślą jaźń', 'utf8').toString('base64')}?=`;
        expect(decodeEncodedWords(encoded)).toBe('Zażółć gęślą jaźń');
    });

    it('decodes Q-encoded latin1 words with underscores as spaces', () => {
        expect(decodeEncodedWords('=?iso-8859-1?Q?Caf=E9_menu?=')).toBe('Café menu');
    });

    it('joins adjacent encoded-words without intervening whitespace', () => {
        const a = `=?UTF-8?B?${Buffer.from('Hej ', 'utf8').toString('base64')}?=`;
        const b = `=?UTF-8?B?${Buffer.from('świecie', 'utf8').toString('base64')}?=`;
        expect(decodeEncodedWords(`${a} ${b}`)).toBe('Hej świecie');
    });

    it('leaves undecodable words intact and decodes subject/from headers', () => {
        const raw = `Subject: =?UTF-8?Q?D=C3=A9cision_finale?=\nFrom: =?UTF-8?Q?Ren=C3=A9?= <rene@x.fr>\n\nok`;
        const mail = parseEmailMessage(raw);
        expect(mail.subject).toBe('Décision finale');
        expect(mail.from).toBe('René <rene@x.fr>');
    });
});

describe('MIME multipart + encodings', () => {
    it('prefers text/plain in multipart/alternative', () => {
        const raw = `Subject: alt
Content-Type: multipart/alternative; boundary="B1"

--B1
Content-Type: text/plain; charset=utf-8

PLAIN BODY WINS
--B1
Content-Type: text/html; charset=utf-8

<html><body><p>HTML body loses</p></body></html>
--B1--`;
        const mail = parseEmailMessage(raw);
        expect(mail.body).toBe('PLAIN BODY WINS');
        expect(mail.body).not.toContain('HTML');
    });

    it('falls back to tag-stripped html when no plain part exists', () => {
        const raw = `Subject: html only
Content-Type: text/html; charset=utf-8

<html><body><p>Shipping <b>v3</b> on Friday.</p></body></html>`;
        const mail = parseEmailMessage(raw);
        expect(mail.body).toContain('Shipping v3 on Friday.');
        expect(mail.body).not.toContain('<p>');
    });

    it('decodes base64 bodies with the declared charset', () => {
        const b64 = Buffer.from('Umlaut test: äöü', 'utf8').toString('base64');
        const raw = `Subject: b64
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: base64

${b64}`;
        expect(parseEmailMessage(raw).body).toBe('Umlaut test: äöü');
    });

    it('decodes quoted-printable bodies including soft line breaks', () => {
        const raw = `Subject: qp
Content-Type: text/plain; charset=iso-8859-1
Content-Transfer-Encoding: quoted-printable

Caf=E9 deal agreed at 3=
0 percent.`;
        expect(parseEmailMessage(raw).body).toBe('Café deal agreed at 30 percent.');
    });

    it('skips attachments but records their filenames (nested multipart)', () => {
        const raw = `Subject: report attached
Content-Type: multipart/mixed; boundary="OUTER"

--OUTER
Content-Type: multipart/alternative; boundary="INNER"

--INNER
Content-Type: text/plain

See attached report.
--INNER--
--OUTER
Content-Type: application/pdf; name="q3-report.pdf"
Content-Disposition: attachment; filename="q3-report.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--OUTER--`;
        const mail = parseEmailMessage(raw);
        expect(mail.body).toBe('See attached report.');
        expect(mail.attachments).toEqual(['q3-report.pdf']);
        expect(mail.body).not.toContain('JVBERi');
    });

    it('caps decoded body length at MAX_BODY_CHARS', () => {
        const raw = `Subject: big\n\n${'x'.repeat(MAX_BODY_CHARS * 2)}`;
        expect(parseEmailMessage(raw).body.length).toBe(MAX_BODY_CHARS);
    });
});

describe('bulk-mail detection (AC5 groundwork)', () => {
    it('flags List-Unsubscribe', () => {
        const raw = `Subject: 50% off!\nList-Unsubscribe: <https://x.com/u>\n\nBuy now`;
        expect(parseEmailMessage(raw).isBulk).toBe(true);
    });

    it('flags Precedence: bulk and list', () => {
        expect(parseEmailMessage(`Subject: s\nPrecedence: bulk\n\nb`).isBulk).toBe(true);
        expect(parseEmailMessage(`Subject: s\nPrecedence: list\n\nb`).isBulk).toBe(true);
        expect(parseEmailMessage(`Subject: s\nPrecedence: first-class\n\nb`).isBulk).toBe(false);
    });
});

describe('splitMultipart edge cases', () => {
    it('handles missing closing boundary', () => {
        const parts = splitMultipart(`--B\nContent-Type: text/plain\n\nhello`, 'B');
        expect(parts).toHaveLength(1);
        expect(parts[0]).toContain('hello');
    });

    it('returns no parts when the boundary never appears', () => {
        expect(splitMultipart('no boundaries here', 'B')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Slice 2: thread grouping, quote trimming, .eml runner integration
// ---------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataAdapter, Filter, ListResult } from '../src/adapter/types.js';
import { groupEmailThreads, normalizeSubject, trimQuotedReplies } from '../src/ingest/email/threads.js';
import { runIngest } from '../src/ingest/runner.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ingest-email');

function makeMemoryAdapter() {
    const records: Array<Record<string, unknown>> = [];
    const adapter = {
        backend: 'markdown',
        async create(_collection: string, data: Record<string, unknown>) {
            const rec = { id: `r${records.length + 1}`, ...data };
            records.push(rec);
            return rec;
        },
        async getOne(_c: string, id: string) { return { id }; },
        async list(_collection: string, options?: { filter?: Filter }): Promise<ListResult<Record<string, unknown>>> {
            const groups = options?.filter ?? [];
            const items = records.filter((r) =>
                groups.length === 0 || groups.some((clauses) => clauses.every((c) => r[c.field] === c.value)));
            return { items, totalItems: items.length, page: 1, perPage: 20 };
        },
        async textSearch() { return []; },
        async update(_c: string, id: string, data: Record<string, unknown>) { return { id, ...data }; },
        async delete() { },
        ownerScopeEnabled: false,
    } as unknown as DataAdapter;
    return { adapter, records };
}

describe('normalizeSubject (AC3)', () => {
    it('strips stacked Re:/Fwd:/Fw: prefixes case-insensitively', () => {
        expect(normalizeSubject('Re: Fwd: RE: Budget plan')).toBe('budget plan');
        expect(normalizeSubject('FW: hello')).toBe('hello');
        expect(normalizeSubject('Re[2]: hello')).toBe('hello');
        expect(normalizeSubject('Plain subject')).toBe('plain subject');
    });
});

describe('trimQuotedReplies (AC4)', () => {
    it('drops multi-line quoted blocks and their attribution line', () => {
        const body = `Agreed, ship it.\n\nOn Mon, Jun 10, 2024 Ana wrote:\n> first quoted line\n> second quoted line\n> third quoted line`;
        const trimmed = trimQuotedReplies(body);
        expect(trimmed).toBe('Agreed, ship it.');
    });

    it('keeps single-line inline quotes', () => {
        const body = `> should we delay?\nNo, we ship Friday.`;
        expect(trimQuotedReplies(body)).toContain('> should we delay?');
        expect(trimQuotedReplies(body)).toContain('No, we ship Friday.');
    });
});

describe('groupEmailThreads (AC3, AC4, AC5)', () => {
    const mail = (over: Record<string, unknown>) => ({
        messageId: null, inReplyTo: null, references: [], subject: '', from: 'a@x', to: 'b@x',
        date: undefined, body: 'body', attachments: [], isBulk: false, ...over,
    });

    it('groups References chains into one thread record', () => {
        const { items } = groupEmailThreads([
            mail({ messageId: 'm1', subject: 'Plan', body: 'v1', date: '2024-01-01T00:00:00.000Z' }),
            mail({ messageId: 'm2', references: ['m1'], subject: 'Re: Plan', body: 'v2', date: '2024-01-02T00:00:00.000Z' }),
            mail({ messageId: 'm3', inReplyTo: 'm2', subject: 'Re: Plan', body: 'v3', date: '2024-01-03T00:00:00.000Z' }),
        ]);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('Plan');
        expect(items[0].content).toContain('v1');
        expect(items[0].content).toContain('v3');
        expect((items[0].source_meta as Record<string, unknown>).message_count).toBe(3);
    });

    it('falls back to normalized subject when References point outside the archive', () => {
        const { items } = groupEmailThreads([
            mail({ messageId: 'a1', subject: 'Quarterly numbers', body: 'q1', date: '2024-01-01T00:00:00.000Z' }),
            mail({ messageId: 'a2', inReplyTo: 'missing-id', subject: 'RE: Quarterly numbers', body: 'q2', date: '2024-01-02T00:00:00.000Z' }),
        ]);
        expect(items).toHaveLength(1);
    });

    it('skips bulk mail by default and reports indices; includeBulk keeps it', () => {
        const input = [
            mail({ subject: 'Newsletter', isBulk: true }),
            mail({ subject: 'Real mail' }),
        ];
        const skipped = groupEmailThreads(input);
        expect(skipped.items).toHaveLength(1);
        expect(skipped.items[0].title).toBe('Real mail');
        expect(skipped.bulkIndices).toEqual([0]);
        const kept = groupEmailThreads(input, { includeBulk: true });
        expect(kept.items).toHaveLength(2);
    });

    it('drops duplicate Message-IDs within a batch', () => {
        const { items } = groupEmailThreads([
            mail({ messageId: 'dup', subject: 'Once' }),
            mail({ messageId: 'dup', subject: 'Once' }),
        ]);
        expect(items).toHaveLength(1);
    });

    it('records participants and date_range in source_meta (AC8 groundwork)', () => {
        const { items } = groupEmailThreads([
            mail({ messageId: 'p1', subject: 'Sync', from: 'Ana <ana@x.com>', to: 'bo@y.org', date: '2024-01-01T00:00:00.000Z' }),
            mail({ messageId: 'p2', inReplyTo: 'p1', subject: 'Re: Sync', from: 'bo@y.org', to: 'ana@x.com', date: '2024-02-01T00:00:00.000Z' }),
        ]);
        const meta = items[0].source_meta as Record<string, unknown>;
        expect(meta.participants).toEqual(expect.arrayContaining(['ana@x.com', 'bo@y.org']));
        expect((meta.date_range as Record<string, string>).from).toBe('2024-01-01T00:00:00.000Z');
        expect((meta.date_range as Record<string, string>).to).toBe('2024-02-01T00:00:00.000Z');
    });

    it('never emits an empty record when trimming would erase a message', () => {
        const { items } = groupEmailThreads([
            mail({ messageId: 'q1', subject: 'T', body: 'original text here', date: '2024-01-01T00:00:00.000Z' }),
            mail({ messageId: 'q2', inReplyTo: 'q1', subject: 'Re: T', body: '> original text here\n> second line', date: '2024-01-02T00:00:00.000Z' }),
        ]);
        expect(items).toHaveLength(1);
        // the all-quote reply degrades to its untrimmed body rather than vanishing silently
        expect(items[0].content.length).toBeGreaterThan(0);
    });
});

describe('runIngest .eml directory mode (AC4, AC5, AC6)', () => {
    it('threads across files, trims quotes, skips bulk, records attachments', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'eml'), dryRun: false });

        expect(summary.files_scanned).toBe(5);
        expect(summary.files_errored).toBe(0);
        // contract thread (3 files -> 1 record) + offsite = 2 records
        expect(summary.records_created).toBe(2);

        const thread = records.find((r) => r.title === 'Vendor contract renewal');
        expect(thread).toBeDefined();
        const content = thread!.content as string;
        expect(content).toContain('Agreed at 16k for two years');
        // AC4: quoted duplicate appears at most once (original message only)
        expect(content.split('QUOTED-DUPLICATE-MARKER').length - 1).toBeLessThanOrEqual(1);
        expect(thread!.source).toBe('ingest:eml');

        // AC5: bulk newsletter not ingested by default
        expect(records.some((r) => (r.content as string).includes('BULK-MAIL-MARKER'))).toBe(false);
        const bulkReport = summary.reports.find((r) => r.path.endsWith('newsletter.eml'));
        expect(bulkReport?.status).toBe('skipped_unsupported');
        expect(bulkReport?.error).toContain('include_bulk');

        // encoded-word headers decoded into the offsite record
        const offsite = records.find((r) => (r.title as string).includes('Café team offsite'));
        expect(offsite).toBeDefined();
        expect((offsite!.content as string)).toContain('confirmé: Lyon');
        const meta = offsite!.metadata as Record<string, unknown>;
        expect(meta.attachments).toEqual(['venue-quote.pdf']);
    });

    it('include_bulk ingests the newsletter', async () => {
        const { adapter, records } = makeMemoryAdapter();
        await runIngest(adapter, { path: join(FIXTURES, 'eml'), dryRun: false, includeBulk: true });
        expect(records.some((r) => (r.content as string).includes('BULK-MAIL-MARKER'))).toBe(true);
    });

    it('single .eml file mode works (AC6)', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'eml', 'offsite.eml'), dryRun: false });
        expect(summary.records_created).toBe(1);
        expect(records[0].title).toContain('Café team offsite');
    });

    it('re-ingest is idempotent', async () => {
        const { adapter } = makeMemoryAdapter();
        await runIngest(adapter, { path: join(FIXTURES, 'eml'), dryRun: false });
        const again = await runIngest(adapter, { path: join(FIXTURES, 'eml'), dryRun: false });
        expect(again.records_created).toBe(0);
        expect(again.records_deduplicated).toBeGreaterThan(0);
    });

    it('dry-run previews without writing', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'eml'), dryRun: true });
        expect(summary.records_created).toBe(2);
        expect(records).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Slice 3: mbox streaming (AC1, AC2, AC4, AC5, AC7)
// ---------------------------------------------------------------------------
import { readMbox, unescapeFromLines } from '../src/ingest/email/mbox.js';

describe('unescapeFromLines', () => {
    it('reverses mbox From-escaping including stacked escapes', () => {
        expect(unescapeFromLines('>From the start')).toBe('From the start');
        expect(unescapeFromLines('>>From nested')).toBe('>From nested');
        expect(unescapeFromLines('normal line')).toBe('normal line');
        expect(unescapeFromLines('> quoted reply')).toBe('> quoted reply');
    });
});

describe('readMbox streaming (AC1)', () => {
    it('splits the fixture into 6 messages with correct headers and decodes >From escapes', async () => {
        const { emails, messagesParsed, messageErrors } = await readMbox(join(FIXTURES, 'archive.mbox'));
        expect(messagesParsed).toBe(6);
        expect(messageErrors).toBe(0);
        expect(emails[0].subject).toBe('API redesign kickoff');
        expect(emails[0].body).toContain('From a memory standpoint'); // >From unescaped
        expect(emails[1].inReplyTo).toBe('mbox-t1-m1@example.com');
        // RFC 2047 in mbox (AC7)
        expect(emails[2].from).toContain('René Dubois');
        expect(emails[2].subject).toBe('Réunion budget 2025');
        // QP latin1 body decoded; plain preferred over html
        expect(emails[2].body).toContain('Budget validé: 120k');
        expect(emails[2].body).not.toContain('HTML version');
        // html-only fallback
        expect(emails[3].body).toContain('HTML-ONLY-BODY');
        // bulk flag
        expect(emails[4].isBulk).toBe(true);
        // base64 body
        expect(emails[5].body).toBe('Base64 body: release 3.2 ships Tuesday.');
    });
});

describe('runIngest mbox mode (AC1, AC2-counts, AC4, AC5)', () => {
    it('ingests the fixture into thread records with bulk skipped and quotes trimmed', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'archive.mbox'), dryRun: false });

        expect(summary.files_scanned).toBe(1);
        expect(summary.files_errored).toBe(0);
        // 4 threads: api-redesign(2 msgs), budget, holiday, release — bulk skipped
        expect(summary.records_created).toBe(4);

        const api = records.find((r) => r.title === 'API redesign kickoff');
        expect(api).toBeDefined();
        expect((api!.metadata as Record<string, unknown>).message_count).toBe(2);
        // AC4: quoted duplicate trimmed — marker appears exactly once
        expect(((api!.content as string).split('MBOX-TRIM-MARKER').length - 1)).toBe(1);
        expect(api!.source).toBe('ingest:mbox');

        // AC5: bulk skipped by default, reported on the file
        expect(records.some((r) => (r.content as string).includes('MBOX-BULK-MARKER'))).toBe(false);
        expect(summary.reports[0].error).toContain('bulk message(s) skipped');

        // D1: counts reported via the summary
        expect(summary.reports[0].records).toBe(4);
    });

    it('include_bulk ingests the spam thread too', async () => {
        const { adapter, records } = makeMemoryAdapter();
        await runIngest(adapter, { path: join(FIXTURES, 'archive.mbox'), dryRun: false, includeBulk: true });
        expect(records.some((r) => (r.content as string).includes('MBOX-BULK-MARKER'))).toBe(true);
    });

    it('re-ingest is idempotent', async () => {
        const { adapter } = makeMemoryAdapter();
        await runIngest(adapter, { path: join(FIXTURES, 'archive.mbox'), dryRun: false });
        const again = await runIngest(adapter, { path: join(FIXTURES, 'archive.mbox'), dryRun: false });
        expect(again.records_created).toBe(0);
        expect(again.records_deduplicated).toBe(4);
    });

    it('malformed messages are isolated, batch continues', async () => {
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const dir = await mkdtemp(join(tmpdir(), 'ingest-mbox-malformed-'));
        try {
            const mbox = [
                'From good@x.com Mon Jun 10 09:00:00 2024',
                'From: good@x.com', 'Subject: Valid one', 'Message-ID: <ok@x>', '',
                'Real content survives.', '',
                'From broken@x.com Mon Jun 10 10:00:00 2024',
                'no colon header line at all and no blank separator',
            ].join('\n');
            await writeFile(join(dir, 'mixed.mbox'), mbox);
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: join(dir, 'mixed.mbox'), dryRun: false });
            expect(summary.files_errored).toBe(0);
            expect(records.some((r) => (r.content as string).includes('Real content survives'))).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe('mbox bounded memory (AC2, deviation D2)', () => {
    it('streams a ~64MB synthetic mbox with RSS delta < 150MB', async () => {
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const dir = await mkdtemp(join(tmpdir(), 'ingest-mbox-large-'));
        try {
            // ~8KB per message x ~8200 messages ≈ 64MB, distinct subjects
            const filler = 'Lorem ipsum decision context line that pads the body out considerably. '.repeat(100);
            const parts: string[] = [];
            for (let i = 0; i < 8200; i++) {
                parts.push([
                    `From u${i}@x.com Mon Jun 10 09:00:00 2024`,
                    `From: u${i}@x.com`, `To: t@x.com`,
                    `Subject: Synthetic thread ${i}`,
                    `Message-ID: <syn-${i}@x.com>`,
                    `Date: Mon, 10 Jun 2024 09:00:00 +0000`, '',
                    `Message ${i}: ${filler}`, '',
                ].join('\n'));
            }
            const mboxPath = join(dir, 'big.mbox');
            await writeFile(mboxPath, parts.join('\n'));

            global.gc?.();
            const before = process.memoryUsage().rss;
            const { emails, messagesParsed } = await readMbox(mboxPath);
            const after = process.memoryUsage().rss;

            expect(messagesParsed).toBe(8200);
            expect(emails).toHaveLength(8200);
            const deltaMb = (after - before) / (1024 * 1024);
            expect(deltaMb).toBeLessThan(150);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 120000);
});

describe('adversarial-input hardening (issue-20 review findings)', () => {
    it('normalizeSubject is linear on space-padded subjects (no ReDoS)', () => {
        const subject = 're' + ' '.repeat(200_000) + 'payload';
        const start = performance.now();
        normalizeSubject(subject);
        expect(performance.now() - start).toBeLessThan(200);
    });

    it('thread grouping survives a pathological Re:-shaped subject quickly', () => {
        const emails = [
            parseEmailMessage(`From: a@x.com\nSubject: ${'re' + ' '.repeat(900) + 'x'}\nMessage-ID: <p1@x>\n\nbody`),
            parseEmailMessage(`From: b@x.com\nSubject: normal\nMessage-ID: <p2@x>\n\nbody`),
        ];
        const start = performance.now();
        const { items } = groupEmailThreads(emails);
        expect(performance.now() - start).toBeLessThan(500);
        expect(items.length).toBeGreaterThan(0);
    });

    it('displayName-rendered From with huge space padding is linear', () => {
        const padded = 'A' + ' '.repeat(100_000) + 'B <a@x.com>';
        const email = parseEmailMessage(`From: x@x.com\nSubject: t\nMessage-ID: <d1@x>\n\nbody`);
        // headers are capped at MAX_HEADER_CHARS, so build directly to hit displayName
        const start = performance.now();
        const { items } = groupEmailThreads([{ ...email, from: padded }]);
        expect(performance.now() - start).toBeLessThan(500);
        expect(items[0].content).toContain('A');
    });

    it('caps retained References IDs at MAX_REFERENCES (keeps the most recent)', () => {
        const refs = Array.from({ length: 500 }, (_, i) => `<r${i}@x>`).join(' ');
        const mail = parseEmailMessage(`Subject: t\nReferences: ${refs}\n\nbody`);
        expect(mail.references).toHaveLength(MAX_REFERENCES);
        expect(mail.references[mail.references.length - 1]).toBe('r499@x');
    });

    it('caps retained subject/from/to headers at MAX_HEADER_CHARS', () => {
        const huge = 'x'.repeat(100_000);
        const mail = parseEmailMessage(`Subject: ${huge}\nFrom: ${huge}\nTo: ${huge}\n\nbody`);
        expect(mail.subject.length).toBeLessThanOrEqual(MAX_HEADER_CHARS);
        expect(mail.from.length).toBeLessThanOrEqual(MAX_HEADER_CHARS);
        expect(mail.to.length).toBeLessThanOrEqual(MAX_HEADER_CHARS);
    });

    it('an oversized single text part is sliced to the body budget (no cap bypass)', () => {
        const big = 'a'.repeat(MAX_BODY_CHARS * 4);
        const raw = [
            'Subject: big part', 'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="b"', '',
            '--b', 'Content-Type: text/plain', '', big, '--b--', '',
        ].join('\n');
        const mail = parseEmailMessage(raw);
        expect(mail.body.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
    });

    it('html-only message with adversarial unclosed script tags stays fast and bounded', () => {
        const evil = '<script>'.repeat(60_000); // far beyond MAX_HTML_CHARS
        const raw = `Subject: evil html\nContent-Type: text/html\n\n${evil}`;
        const start = performance.now();
        const mail = parseEmailMessage(raw);
        expect(performance.now() - start).toBeLessThan(2000);
        expect(mail.body.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
    });

    it('a single newline-free line cannot defeat MAX_RAW_MESSAGE_CHARS (carry cap)', async () => {
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const dir = await mkdtemp(join(tmpdir(), 'ingest-mbox-carry-'));
        try {
            // one valid message, then a message whose body is a single
            // ~12MB line with no newline (unwrapped base64 shape)
            const oneLine = 'A'.repeat(12 * 1024 * 1024);
            const mbox = [
                'From a@x.com Mon Jun 10 09:00:00 2024',
                'From: a@x.com', 'Subject: ok', 'Message-ID: <c1@x>', '',
                'normal body', '',
                'From b@x.com Mon Jun 10 09:01:00 2024',
                'From: b@x.com', 'Subject: huge', 'Message-ID: <c2@x>', '',
                oneLine,
            ].join('\n');
            const p = join(dir, 'carry.mbox');
            await writeFile(p, mbox);
            global.gc?.();
            const before = process.memoryUsage().rss;
            const { emails, messagesParsed } = await readMbox(p);
            const after = process.memoryUsage().rss;
            expect(messagesParsed).toBe(2);
            expect(emails[0].subject).toBe('ok');
            expect(emails[1].subject).toBe('huge');
            // 12MB single line must not balloon RSS beyond the raw cap region
            expect((after - before) / (1024 * 1024)).toBeLessThan(100);
            expect(emails[1].body.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 60000);
});
