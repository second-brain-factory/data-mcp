/**
 * Unit tests for MarkdownAdapter.ensureWorkspaceProtections — the .gitignore
 * `_archive/` guard that keeps soft-deleted records (which may contain
 * private data) out of shared team repos. Issue: MVP user-test finding,
 * shipped in 0.7.4.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarkdownAdapter } from '../src/adapter/markdown.js';
import { OwnerScopeProxy } from '../src/adapter/owner-scope.js';

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'data-mcp-protections-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('MarkdownAdapter.ensureWorkspaceProtections', () => {
    it('creates .gitignore with _archive/ when none exists', async () => {
        const adapter = new MarkdownAdapter(root);
        const created = await adapter.ensureWorkspaceProtections();
        expect(created).toEqual(['.gitignore: _archive/']);
        const content = readFileSync(join(root, '.gitignore'), 'utf8');
        expect(content).toContain('_archive/');
        expect(content).toContain('never commit');
    });

    it('creates the root directory if missing', async () => {
        const nested = join(root, 'memory');
        const adapter = new MarkdownAdapter(nested);
        await adapter.ensureWorkspaceProtections();
        expect(existsSync(join(nested, '.gitignore'))).toBe(true);
    });

    it('is idempotent — second run creates nothing and does not duplicate the rule', async () => {
        const adapter = new MarkdownAdapter(root);
        await adapter.ensureWorkspaceProtections();
        const second = await adapter.ensureWorkspaceProtections();
        expect(second).toEqual([]);
        const content = readFileSync(join(root, '.gitignore'), 'utf8');
        const occurrences = content.split('\n').filter((l) => l.trim() === '_archive/').length;
        expect(occurrences).toBe(1);
    });

    it('appends to an existing .gitignore without clobbering user rules', async () => {
        writeFileSync(join(root, '.gitignore'), 'node_modules/\n.env\n', 'utf8');
        const adapter = new MarkdownAdapter(root);
        const created = await adapter.ensureWorkspaceProtections();
        expect(created).toEqual(['.gitignore: _archive/']);
        const content = readFileSync(join(root, '.gitignore'), 'utf8');
        expect(content).toContain('node_modules/');
        expect(content).toContain('.env');
        expect(content).toContain('_archive/');
    });

    it('appends correctly when existing .gitignore lacks trailing newline', async () => {
        writeFileSync(join(root, '.gitignore'), 'node_modules/', 'utf8');
        const adapter = new MarkdownAdapter(root);
        await adapter.ensureWorkspaceProtections();
        const lines = readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
        expect(lines).toContain('node_modules/');
        expect(lines).toContain('_archive/');
    });

    it.each(['_archive/', '_archive', '/_archive/', '/_archive'])(
        'recognizes existing coverage via "%s" and does not append',
        async (variant) => {
            writeFileSync(join(root, '.gitignore'), `${variant}\n`, 'utf8');
            const adapter = new MarkdownAdapter(root);
            const created = await adapter.ensureWorkspaceProtections();
            expect(created).toEqual([]);
            const content = readFileSync(join(root, '.gitignore'), 'utf8');
            expect(content).toBe(`${variant}\n`);
        },
    );

    it('soft-deleted record lands under _archive/ which the new .gitignore covers', async () => {
        const adapter = new MarkdownAdapter(root);
        await adapter.ensureWorkspaceProtections();
        const rec = await adapter.create('knowledge', { title: 'secret', content: 'private detail' });
        await adapter.delete('knowledge', rec.id as string);
        expect(existsSync(join(root, '_archive', 'knowledge', `${rec.id}.md`))).toBe(true);
        const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
        expect(gitignore.split('\n').map((l) => l.trim())).toContain('_archive/');
    });
});

describe('OwnerScopeProxy mirroring', () => {
    it('forwards ensureWorkspaceProtections to the inner adapter', async () => {
        const inner = new MarkdownAdapter(root);
        const proxy = new OwnerScopeProxy(inner, { ownerId: 'iwo', sharedOwnerId: 'firma' });
        expect(proxy.ensureWorkspaceProtections).toBeDefined();
        const created = await proxy.ensureWorkspaceProtections!();
        expect(created).toEqual(['.gitignore: _archive/']);
        expect(existsSync(join(root, '.gitignore'))).toBe(true);
    });

    it('leaves the capability undefined when inner adapter lacks it', () => {
        const inner = new MarkdownAdapter(root);
        const bare = Object.create(Object.getPrototypeOf(inner)) as MarkdownAdapter;
        Object.assign(bare, inner);
        // Simulate a backend without the capability (e.g. supabase/pocketbase).
        (bare as any).ensureWorkspaceProtections = undefined;
        const proxy = new OwnerScopeProxy(bare, { ownerId: 'iwo', sharedOwnerId: 'firma' });
        expect(proxy.ensureWorkspaceProtections).toBeUndefined();
    });
});
