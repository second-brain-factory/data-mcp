import { describe, it, expect } from 'vitest';
import { createAdapter } from '../../src/adapter/factory.js';
import { SchemaMapProxy } from '../../src/adapter/schema-map.js';
import type { PocketBaseConfig, SupabaseConfig } from '../../src/config.js';

describe('createAdapter', () => {
  it('creates PocketBase adapter for pocketbase backend', () => {
    const config: PocketBaseConfig = {
      backend: 'pocketbase',
      pocketbaseUrl: 'http://localhost:8090',
      pocketbaseAdminEmail: 'admin@test.com',
      pocketbaseAdminPassword: 'password',
      schemaMap: {},
    };
    const adapter = createAdapter(config);
    expect(adapter.backend).toBe('pocketbase');
  });

  it('creates Supabase adapter for supabase backend', () => {
    const config: SupabaseConfig = {
      backend: 'supabase',
      supabaseUrl: 'https://test.supabase.co',
      supabaseKey: 'test-key',
      schemaMap: {},
    };
    const adapter = createAdapter(config);
    expect(adapter.backend).toBe('supabase');
  });

  it('wraps in SchemaMapProxy when schemaMap is provided', () => {
    const config: PocketBaseConfig = {
      backend: 'pocketbase',
      pocketbaseUrl: 'http://localhost:8090',
      pocketbaseAdminEmail: 'admin@test.com',
      pocketbaseAdminPassword: 'password',
      schemaMap: { knowledge: 'sb_knowledge' },
    };
    const adapter = createAdapter(config);
    expect(adapter).toBeInstanceOf(SchemaMapProxy);
  });

  it('does not wrap in SchemaMapProxy when schemaMap is empty', () => {
    const config: PocketBaseConfig = {
      backend: 'pocketbase',
      pocketbaseUrl: 'http://localhost:8090',
      pocketbaseAdminEmail: 'admin@test.com',
      pocketbaseAdminPassword: 'password',
      schemaMap: {},
    };
    const adapter = createAdapter(config);
    expect(adapter).not.toBeInstanceOf(SchemaMapProxy);
  });
});
