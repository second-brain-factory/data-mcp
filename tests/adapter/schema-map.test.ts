import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaMap, SchemaMapProxy } from '../../src/adapter/schema-map.js';
import { MockAdapter } from '../helpers/mock-adapter.js';

describe('SchemaMap', () => {
  it('resolves mapped names', () => {
    const map = new SchemaMap({ knowledge: 'sb_knowledge', sessions: 'sb_sessions' });
    expect(map.resolve('knowledge')).toBe('sb_knowledge');
    expect(map.resolve('sessions')).toBe('sb_sessions');
  });

  it('passes through unmapped names', () => {
    const map = new SchemaMap({ knowledge: 'sb_knowledge' });
    expect(map.resolve('contacts')).toBe('contacts');
  });

  it('unresolves actual names back to logical names', () => {
    const map = new SchemaMap({ knowledge: 'sb_knowledge' });
    expect(map.unresolve('sb_knowledge')).toBe('knowledge');
    expect(map.unresolve('contacts')).toBe('contacts');
  });

  it('reports isEmpty correctly', () => {
    expect(new SchemaMap({}).isEmpty).toBe(true);
    expect(new SchemaMap({ a: 'b' }).isEmpty).toBe(false);
  });
});

describe('SchemaMapProxy', () => {
  let adapter: MockAdapter;
  let proxy: SchemaMapProxy;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    adapter.addCollection('sb_knowledge');
    proxy = new SchemaMapProxy(adapter, new SchemaMap({ knowledge: 'sb_knowledge' }));
  });

  it('remaps collection name on create', async () => {
    const record = await proxy.create('knowledge', { title: 'test', content: 'hello' });
    expect(record.title).toBe('test');

    // Verify it went to sb_knowledge in the underlying adapter
    const data = adapter.getCollectionData('sb_knowledge');
    expect(data?.size).toBe(1);
  });

  it('remaps collection name on list', async () => {
    await proxy.create('knowledge', { title: 'item1' });
    await proxy.create('knowledge', { title: 'item2' });

    const result = await proxy.list('knowledge');
    expect(result.items.length).toBe(2);
  });

  it('remaps collection name on collectionExists', async () => {
    expect(await proxy.collectionExists('knowledge')).toBe(true);
    expect(await proxy.collectionExists('nonexistent')).toBe(false);
  });

  it('unresolves collection names on listCollections', async () => {
    const collections = await proxy.listCollections();
    expect(collections).toContain('knowledge');
    expect(collections).not.toContain('sb_knowledge');
  });

  it('proxies backend property', () => {
    expect(proxy.backend).toBe('pocketbase');
  });
});
