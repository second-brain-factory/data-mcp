/**
 * Tests for LLM chat-export ingestion (issue #18): ChatGPT mapping-walk
 * (canonical path, branch exclusion, tool collapsing), Claude flat walk
 * (both message shapes), shape sniffing, message-boundary chunking, title
 * dedupe, the conversations.json size carve-out, idempotency, and the
 * 1000-conversation performance AC.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataAdapter, Filter, ListResult } from '../src/adapter/types.js';
import { parseChatGpt } from '../src/ingest/parsers/chatgpt.js';
import { parseClaude } from '../src/ingest/parsers/claude.js';
import { chunkConversation, conversationItems, toIsoDate, MAX_CONVERSATION_CHARS } from '../src/ingest/parsers/conversation.js';
import { refineJsonFormat } from '../src/ingest/detect.js';
import { runIngest, CHAT_EXPORT_MAX_BYTES } from '../src/ingest/runner.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ingest-llm');
const ctx = { filePath: '/tmp/conversations.json', baseName: 'conversations' };

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
        async upsert() { throw new Error('not used'); },
        async count() { return records.length; },
        async collectionExists() { return true; },
        async listCollections() { return ['knowledge']; },
        ownerScopeEnabled: false,
    } as unknown as DataAdapter;
    return { adapter, records };
}

describe('refineJsonFormat', () => {
    it('sniffs chatgpt, claude, and generic json', async () => {
        const gpt = await readFile(join(FIXTURES, 'chatgpt.json'), 'utf8');
        const claude = await readFile(join(FIXTURES, 'claude.json'), 'utf8');
        expect(refineJsonFormat(gpt)).toBe('chatgpt');
        expect(refineJsonFormat(claude)).toBe('claude');
        expect(refineJsonFormat('{"mapping": 1, "current_node": "x"}')).toBe('json'); // object, not array
        expect(refineJsonFormat('[{"name": "plain"}]')).toBe('json');
        expect(refineJsonFormat('[1, 2, 3]')).toBe('json');
    });
});

describe('parseClaude (AC1)', () => {
    it('one record per conversation with tags and conversation_date', async () => {
        const content = await readFile(join(FIXTURES, 'claude.json'), 'utf8');
        const items = parseClaude(content, ctx);
        expect(items).toHaveLength(2); // empty-draft conversation skipped
        const sourdough = items.find((i) => i.title === 'Sourdough starter troubleshooting')!;
        expect(sourdough.tags).toEqual(['claude', 'conversation']);
        expect(sourdough.type).toBe('reference');
        expect(sourdough.source_meta?.conversation_date).toBe('2026-03-02T09:15:00.000Z');
        expect(sourdough.content).toContain('User: My sourdough starter smells like acetone');
        expect(sourdough.content).toContain('Assistant: Not dead');
    });

    it('handles the newer content[] block message shape', async () => {
        const content = await readFile(join(FIXTURES, 'claude.json'), 'utf8');
        const items = parseClaude(content, ctx);
        const k8s = items.find((i) => i.title === 'Kubernetes ingress debugging')!;
        expect(k8s.content).toContain('websocket upgrades');
        expect(k8s.content).toContain('Assistant: Your nginx ingress is missing the upgrade headers');
    });

    it('skips conversations with no messages', async () => {
        const content = await readFile(join(FIXTURES, 'claude.json'), 'utf8');
        const items = parseClaude(content, ctx);
        expect(items.find((i) => i.title === 'Empty draft')).toBeUndefined();
    });

    it('non-array JSON yields no items', () => {
        expect(parseClaude('{"chat_messages": []}', ctx)).toHaveLength(0);
    });
});

describe('parseChatGpt (AC1, AC2)', () => {
    it('walks the canonical path only — regenerated branch excluded (AC2)', async () => {
        const content = await readFile(join(FIXTURES, 'chatgpt.json'), 'utf8');
        const items = parseChatGpt(content, ctx);
        const pasta = items.find((i) => i.title === 'Pasta dough hydration')!;
        expect(pasta.content).toContain('55 percent hydration');
        expect(pasta.content).not.toContain('REGENERATED-AWAY');
        expect(pasta.content).toContain('Thanks, that matches my flour.');
    });

    it('collapses consecutive tool/code messages into one [tool use] marker', async () => {
        const content = await readFile(join(FIXTURES, 'chatgpt.json'), 'utf8');
        const items = parseChatGpt(content, ctx);
        const csv = items.find((i) => i.title === 'CSV dedupe script')!;
        expect(csv.content.match(/\[tool use\]/g)).toHaveLength(1);
        expect(csv.content).toContain('csv.DictReader');
        expect(csv.content).not.toContain('seen=set()'); // raw code not stored
    });

    it('skips system-only conversations', async () => {
        const content = await readFile(join(FIXTURES, 'chatgpt.json'), 'utf8');
        const items = parseChatGpt(content, ctx);
        expect(items.find((i) => i.title === 'Empty system-only chat')).toBeUndefined();
        expect(items).toHaveLength(3);
    });

    it('duplicate titles get deterministic suffixes ordered by create_time', async () => {
        const content = await readFile(join(FIXTURES, 'chatgpt.json'), 'utf8');
        const items = parseChatGpt(content, ctx);
        const first = items.find((i) => i.title === 'Pasta dough hydration')!;
        const second = items.find((i) => i.title === 'Pasta dough hydration (2)')!;
        expect(first.content).toContain('55 percent'); // March convo (earlier)
        expect(second.content).toContain('Semolina-only'); // June convo (later)
    });

    it('preserves create_time as ISO conversation_date', async () => {
        const content = await readFile(join(FIXTURES, 'chatgpt.json'), 'utf8');
        const items = parseChatGpt(content, ctx);
        const csv = items.find((i) => i.title === 'CSV dedupe script')!;
        expect(csv.source_meta?.conversation_date).toBe(new Date(1714468500 * 1000).toISOString());
    });

    it('dangling current_node skips the conversation, others survive', async () => {
        const broken = JSON.stringify([
            { title: 'Broken', create_time: 1, current_node: 'nope', mapping: { a: { id: 'a', message: null, parent: null } } },
            {
                title: 'Fine', create_time: 2, current_node: 'n1',
                mapping: {
                    n0: { id: 'n0', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['hello'] } }, parent: null, children: ['n1'] },
                    n1: { id: 'n1', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['hi there'] } }, parent: 'n0', children: [] },
                },
            },
        ]);
        const items = parseChatGpt(broken, ctx);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('Fine');
    });

    it('untitled conversations get a fallback title', () => {
        const data = JSON.stringify([{
            title: '', create_time: 1, current_node: 'n0',
            mapping: { n0: { id: 'n0', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['solo question'] } }, parent: null, children: [] } },
        }]);
        const items = parseChatGpt(data, ctx);
        expect(items[0].title).toBe('Untitled conversation');
    });
});

describe('chunkConversation (AC3)', () => {
    it('splits at message boundaries, never mid-message', () => {
        const messages = Array.from({ length: 10 }, (_, i) => ({
            role: i % 2 === 0 ? 'User' : 'Assistant',
            text: `MSG${i} ${'x'.repeat(1500)}`,
        }));
        const chunks = chunkConversation(messages);
        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(MAX_CONVERSATION_CHARS);
            // every message marker present in a chunk must be complete (1500 x's)
            for (const m of chunk.match(/MSG\d+ x+/g) ?? []) {
                expect(m.length).toBeGreaterThanOrEqual(1500);
            }
        }
        // all 10 messages survive across chunks
        const joined = chunks.join('\n');
        for (let i = 0; i < 10; i++) expect(joined).toContain(`MSG${i}`);
    });

    it('a single oversized message falls back to chunkText', () => {
        const chunks = chunkConversation([{ role: 'User', text: 'word '.repeat(3000) }]);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it('long conversations produce (part n/m) titles', () => {
        const messages = Array.from({ length: 6 }, (_, i) => ({ role: 'User', text: 'y'.repeat(3000) + i }));
        const items = conversationItems([{ title: 'Long talk', messages }], ['claude', 'conversation']);
        expect(items.length).toBeGreaterThan(1);
        expect(items[0].title).toBe(`Long talk (part 1/${items.length})`);
    });
});

describe('toIsoDate', () => {
    it('handles epoch seconds, ISO strings, and garbage', () => {
        expect(toIsoDate(1714468500)).toBe(new Date(1714468500 * 1000).toISOString());
        expect(toIsoDate('2026-03-02T09:15:00.000000Z')).toBe('2026-03-02T09:15:00.000Z');
        expect(toIsoDate('not a date')).toBeUndefined();
        expect(toIsoDate(null)).toBeUndefined();
        expect(toIsoDate(0)).toBeUndefined();
    });
});

describe('runIngest with chat exports', () => {
    async function withDir(fn: (dir: string) => Promise<void>) {
        const dir = await mkdtemp(join(tmpdir(), 'ingest-llm-'));
        try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
    }

    it('ingests both vendor exports with vendor-specific source + format', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: FIXTURES, dryRun: false });
        expect(summary.files_errored).toBe(0);
        expect(records.some((r) => r.source === 'ingest:chatgpt')).toBe(true);
        expect(records.some((r) => r.source === 'ingest:claude')).toBe(true);
        const gptRecord = records.find((r) => r.source === 'ingest:chatgpt')!;
        const meta = gptRecord.metadata as Record<string, unknown>;
        expect(meta.format).toBe('chatgpt');
        expect(meta.conversation_date).toBeTruthy();
        const gptReport = summary.reports.find((r) => r.path.endsWith('chatgpt.json'));
        expect(gptReport?.format).toBe('chatgpt');
    });

    it('re-ingest of a grown export adds only NEW conversations (AC4)', async () => {
        await withDir(async (dir) => {
            const original = JSON.parse(await readFile(join(FIXTURES, 'claude.json'), 'utf8'));
            const file = join(dir, 'conversations.json');
            await writeFile(file, JSON.stringify(original));
            const { adapter, records } = makeMemoryAdapter();
            const first = await runIngest(adapter, { path: file, dryRun: false });
            const countAfterFirst = records.length;
            // simulate a newer export download: same conversations + one new
            original.push({
                uuid: 'new-1', name: 'Brand new chat', created_at: '2026-06-01T00:00:00.000000Z',
                chat_messages: [
                    { sender: 'human', text: 'A question asked after the first export.', created_at: '2026-06-01T00:00:01.000000Z' },
                    { sender: 'assistant', text: 'And its answer.', created_at: '2026-06-01T00:00:02.000000Z' },
                ],
            });
            await writeFile(file, JSON.stringify(original));
            const second = await runIngest(adapter, { path: file, dryRun: false });
            expect(second.records_created).toBe(1);
            expect(second.records_deduplicated).toBe(first.records_created);
            expect(records.length).toBe(countAfterFirst + 1);
            expect(records.some((r) => r.title === 'Brand new chat')).toBe(true);
        });
    });

    it('malformed JSON is a per-file error; batch continues (AC5)', async () => {
        await withDir(async (dir) => {
            const truncated = (await readFile(join(FIXTURES, 'chatgpt.json'), 'utf8')).slice(0, 500);
            await writeFile(join(dir, 'conversations.json'), truncated);
            await writeFile(join(dir, 'note.md'), '# Fine\n\nstill works');
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: false });
            expect(summary.files_errored).toBe(1);
            const bad = summary.reports.find((r) => r.path.endsWith('conversations.json'));
            expect(bad?.status).toBe('error');
            expect(records.some((r) => r.title === 'note')).toBe(true);
        });
    });

    it('conversations.json gets the 200MB cap; other json keeps 10MB', async () => {
        await withDir(async (dir) => {
            // 11MB file: over the default cap, under the chat-export cap
            const big = `[{"uuid":"u1","name":"Big","created_at":"2026-01-01T00:00:00Z","chat_messages":[{"sender":"human","text":"${'a'.repeat(11 * 1024 * 1024)}"}]}]`;
            await writeFile(join(dir, 'conversations.json'), big);
            await writeFile(join(dir, 'other.json'), big);
            const { adapter } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: true });
            const chat = summary.reports.find((r) => r.path.endsWith('conversations.json'));
            const other = summary.reports.find((r) => r.path.endsWith('other.json'));
            expect(chat?.status).not.toBe('skipped_too_large');
            expect(other?.status).toBe('skipped_too_large');
            expect(CHAT_EXPORT_MAX_BYTES).toBe(200 * 1024 * 1024);
        });
    });

    it('generic JSON files keep the old pretty-print behavior (regression)', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'config.json'), '{"setting": "value", "n": 1}');
            const { adapter, records } = makeMemoryAdapter();
            await runIngest(adapter, { path: dir, dryRun: false });
            expect(records).toHaveLength(1);
            expect(records[0].source).toBe('ingest:json');
            expect(records[0].content).toContain('"setting": "value"');
        });
    });

    it('1000-conversation export completes well under 60s (AC6)', async () => {
        await withDir(async (dir) => {
            const conversations = Array.from({ length: 1000 }, (_, i) => ({
                uuid: `u-${i}`,
                name: `Conversation ${i}`,
                created_at: new Date(1700000000000 + i * 60000).toISOString(),
                chat_messages: [
                    { sender: 'human', text: `Question ${i}: ${'lorem ipsum '.repeat(40)}`, created_at: new Date().toISOString() },
                    { sender: 'assistant', text: `Answer ${i}: ${'dolor sit amet '.repeat(40)}`, created_at: new Date().toISOString() },
                ],
            }));
            const file = join(dir, 'conversations.json');
            await writeFile(file, JSON.stringify(conversations));
            const { adapter, records } = makeMemoryAdapter();
            const start = performance.now();
            const summary = await runIngest(adapter, { path: file, dryRun: false });
            const elapsedMs = performance.now() - start;
            expect(summary.files_errored).toBe(0);
            expect(records).toHaveLength(1000);
            expect(elapsedMs).toBeLessThan(60_000);
            // eslint-disable-next-line no-console
            console.log(`[perf AC6] 1000 conversations ingested in ${Math.round(elapsedMs)}ms`);
        });
    }, 70_000);
});
