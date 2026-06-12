/**
 * Tests for email-archive ingestion (issue #20), Slice 1: the pure MIME
 * message parser — header unfolding, RFC 2047 encoded-words (AC7),
 * multipart walk, base64/quoted-printable decoding, text/plain preference,
 * html-only fallback, attachment skipping, bulk detection.
 */
import { describe, it, expect } from 'vitest';
import { parseEmailMessage, decodeEncodedWords, splitMultipart, MAX_BODY_CHARS } from '../src/ingest/email/mime.js';

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
