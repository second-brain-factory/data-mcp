/**
 * Unit tests for the pure ingest layer: format detection, chunking, and
 * the five v1 parsers. No I/O, no adapter — parsers are pure functions.
 */
import { describe, it, expect } from 'vitest';
import { detectFormat, looksBinary, stripBom } from '../src/ingest/detect.js';
import { chunkText, titleChunks, MAX_CHUNK_CHARS } from '../src/ingest/chunk.js';
import { parseMarkdown } from '../src/ingest/parsers/markdown.js';
import { parseText } from '../src/ingest/parsers/text.js';
import { parseCsv, parseCsvRows } from '../src/ingest/parsers/csv.js';
import { parseJson } from '../src/ingest/parsers/json.js';
import { parseHtml, htmlToText } from '../src/ingest/parsers/html.js';
import { PARSER_REGISTRY, SUPPORTED_FORMATS } from '../src/ingest/registry.js';

const ctx = (baseName = 'doc') => ({ filePath: `/tmp/${baseName}`, baseName });

describe('detectFormat', () => {
    it.each([
        ['notes.md', 'markdown'],
        ['notes.markdown', 'markdown'],
        ['notes.txt', 'text'],
        ['notes.TEXT', 'text'],
        ['data.csv', 'csv'],
        ['export.json', 'json'],
        ['page.html', 'html'],
        ['page.htm', 'html'],
        ['image.png', null],
        ['archive.zip', null],
        ['noext', null],
    ])('%s -> %s', (path, expected) => {
        expect(detectFormat(path)).toBe(expected);
    });

    it('every supported format has a registered parser', () => {
        for (const format of SUPPORTED_FORMATS) {
            expect(typeof PARSER_REGISTRY[format]).toBe('function');
        }
    });
});

describe('looksBinary', () => {
    it('rejects NUL bytes (incl. UTF-16)', () => {
        expect(looksBinary(Buffer.from('he\0llo'))).toBe(true);
        expect(looksBinary(Buffer.from('hello', 'utf16le'))).toBe(true);
    });
    it('accepts normal text with tabs and newlines', () => {
        expect(looksBinary(Buffer.from('hello\tworld\r\nbye\n'))).toBe(false);
    });
    it('rejects high control-character ratio', () => {
        expect(looksBinary(Buffer.from([1, 2, 3, 4, 5, 65, 66, 67]))).toBe(true);
    });
    it('accepts empty content', () => {
        expect(looksBinary(Buffer.alloc(0))).toBe(false);
    });
});

describe('stripBom', () => {
    it('strips a UTF-8 BOM', () => {
        expect(stripBom('\ufefftitle')).toBe('title');
    });
    it('leaves clean content alone', () => {
        expect(stripBom('title')).toBe('title');
    });
});

describe('chunkText', () => {
    it('returns single chunk when content fits', () => {
        expect(chunkText('short')).toEqual(['short']);
    });
    it('returns empty for whitespace-only content', () => {
        expect(chunkText('  \n\n ')).toEqual([]);
    });
    it('splits at paragraph boundaries and respects the cap', () => {
        const para = 'x'.repeat(1500);
        const chunks = chunkText([para, para, para, para].join('\n\n'));
        expect(chunks.length).toBeGreaterThan(1);
        for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
        expect(chunks.join('').replace(/\n/g, '').length).toBe(6000);
    });
    it('hard-splits a single oversized paragraph without losing content', () => {
        const blob = 'word '.repeat(2000).trim(); // ~10k chars, no newlines
        const chunks = chunkText(blob);
        for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
        expect(chunks.join(' ')).toBe(blob);
    });
});

describe('titleChunks', () => {
    it('keeps base title for single chunk', () => {
        expect(titleChunks('T', ['a'])).toEqual([{ title: 'T', content: 'a' }]);
    });
    it('adds (part n/m) suffix for multiple chunks', () => {
        expect(titleChunks('T', ['a', 'b']).map((c) => c.title)).toEqual(['T (part 1/2)', 'T (part 2/2)']);
    });
});

describe('parseMarkdown', () => {
    it('extracts frontmatter title and inline tags; small doc = one record', () => {
        const items = parseMarkdown('---\ntitle: My Doc\ntags: [a, b]\n---\n\n# Intro\n\nHello.', ctx('file'));
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('My Doc');
        expect(items[0].tags).toEqual(['a', 'b']);
        expect(items[0].type).toBe('reference');
        expect(items[0].content).toContain('Hello.');
    });
    it('parses block-style frontmatter tags', () => {
        const items = parseMarkdown('---\ntags:\n  - alpha\n  - beta\n---\n\nBody text.', ctx());
        expect(items[0].tags).toEqual(['alpha', 'beta']);
    });
    it('splits large docs into per-section records titled "doc — heading"', () => {
        const big = 'y'.repeat(3000);
        const md = `# One\n\n${big}\n\n# Two\n\n${big}`;
        const items = parseMarkdown(md, ctx('guide'));
        expect(items).toHaveLength(2);
        expect(items[0].title).toBe('guide — One');
        expect(items[1].title).toBe('guide — Two');
    });
    it('ignores # inside code fences', () => {
        const big = 'z'.repeat(5000);
        const md = `# Real\n\n\`\`\`\n# not a heading\n\`\`\`\n\n${big}\n\n# Second\n\n${big}`;
        const items = parseMarkdown(md, ctx());
        const titles = items.map((i) => i.title).join('|');
        expect(titles).not.toContain('not a heading');
    });
    it('uses basename when no frontmatter title', () => {
        const items = parseMarkdown('Just text.', ctx('readme'));
        expect(items[0].title).toBe('readme');
    });
    it('returns no items for empty body', () => {
        expect(parseMarkdown('---\ntitle: X\n---\n', ctx())).toEqual([]);
    });
});

describe('parseText', () => {
    it('produces one record titled by basename', () => {
        const items = parseText('Plain content.', ctx('notes'));
        expect(items).toEqual([{ title: 'notes', content: 'Plain content.', type: 'reference', tags: [] }]);
    });
});

describe('parseCsvRows', () => {
    it('handles quoted commas, escaped quotes, and embedded newlines', () => {
        const rows = parseCsvRows('a,b\n"x, y","he said ""hi"""\n"line1\nline2",z\n');
        expect(rows).toEqual([
            ['a', 'b'],
            ['x, y', 'he said "hi"'],
            ['line1\nline2', 'z'],
        ]);
    });
    it('skips blank lines', () => {
        expect(parseCsvRows('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    });
});

describe('parseCsv', () => {
    it('small file -> one labeled record with column metadata', () => {
        const items = parseCsv('name,city\nAda,London\nGrace,Arlington\n', ctx('people'));
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('people');
        expect(items[0].content).toContain('name: Ada');
        expect(items[0].content).toContain('city: Arlington');
        expect(items[0].source_meta).toEqual({ rows: 2, columns: ['name', 'city'] });
    });
    it('large file -> batched (rows n-m) records', () => {
        const data = Array.from({ length: 120 }, (_, i) => `r${i},v${i}`).join('\n');
        const items = parseCsv(`a,b\n${data}\n`, ctx('big'));
        expect(items).toHaveLength(3);
        expect(items[0].title).toBe('big (rows 1-50)');
        expect(items[2].title).toBe('big (rows 101-120)');
    });
    it('header-only file -> no items', () => {
        expect(parseCsv('a,b\n', ctx())).toEqual([]);
    });
});

describe('parseJson', () => {
    it('pretty-prints valid JSON', () => {
        const items = parseJson('{"k":1}', ctx('cfg'));
        expect(items).toHaveLength(1);
        expect(items[0].content).toBe('{\n  "k": 1\n}');
    });
    it('throws on invalid JSON (runner reports per-file error)', () => {
        expect(() => parseJson('{nope', ctx())).toThrow();
    });
});

describe('htmlToText / parseHtml', () => {
    it('strips script/style/comments, decodes entities, extracts title', () => {
        const html = '<html><head><title>Hi &amp; Bye</title><style>x{}</style><script>bad()</script></head>'
            + '<body><h1>Head</h1><p>A &#39;quoted&#x27; word</p><!-- gone --></body></html>';
        const { title, text } = htmlToText(html);
        expect(title).toBe('Hi & Bye');
        expect(text).toContain('Head');
        expect(text).toContain("A 'quoted' word");
        expect(text).not.toContain('bad()');
        expect(text).not.toContain('gone');
    });
    it('uses <title> as record title, basename as fallback', () => {
        expect(parseHtml('<title>Page</title><p>x</p>', ctx('f'))[0].title).toBe('Page');
        expect(parseHtml('<p>x</p>', ctx('fallback'))[0].title).toBe('fallback');
    });
    it('returns no items when no text remains', () => {
        expect(parseHtml('<style>a{}</style>', ctx())).toEqual([]);
    });
});
