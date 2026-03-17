/**
 * Tests for configuration parsing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all SB_ env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SB_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SB_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('parses valid pocketbase config', () => {
    process.env.SB_BACKEND = 'pocketbase';
    process.env.SB_POCKETBASE_URL = 'http://localhost:8090';
    process.env.SB_POCKETBASE_ADMIN_EMAIL = 'admin@test.com';
    process.env.SB_POCKETBASE_ADMIN_PASSWORD = 'password123';

    const config = parseConfig();
    expect(config.backend).toBe('pocketbase');
    if (config.backend === 'pocketbase') {
      expect(config.pocketbaseUrl).toBe('http://localhost:8090');
      expect(config.pocketbaseAdminEmail).toBe('admin@test.com');
      expect(config.pocketbaseAdminPassword).toBe('password123');
      expect(config.schemaMap).toEqual({});
    }
  });

  it('parses valid supabase config', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SB_SUPABASE_KEY = 'eyJ0eXAiOiJKV1Q...';

    const config = parseConfig();
    expect(config.backend).toBe('supabase');
    if (config.backend === 'supabase') {
      expect(config.supabaseUrl).toBe('https://abc.supabase.co');
      expect(config.supabaseKey).toBe('eyJ0eXAiOiJKV1Q...');
    }
  });

  it('throws on missing SB_BACKEND', () => {
    expect(() => parseConfig()).toThrow('SB_BACKEND');
  });

  it('throws on invalid SB_BACKEND value', () => {
    process.env.SB_BACKEND = 'mysql';
    expect(() => parseConfig()).toThrow("must be 'pocketbase' or 'supabase'");
  });

  it('throws on missing pocketbase URL', () => {
    process.env.SB_BACKEND = 'pocketbase';
    process.env.SB_POCKETBASE_ADMIN_EMAIL = 'admin@test.com';
    process.env.SB_POCKETBASE_ADMIN_PASSWORD = 'password123';
    expect(() => parseConfig()).toThrow('SB_POCKETBASE_URL');
  });

  it('throws on missing supabase URL', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_KEY = 'key';
    expect(() => parseConfig()).toThrow('SB_SUPABASE_URL');
  });

  it('throws on missing supabase key', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://abc.supabase.co';
    expect(() => parseConfig()).toThrow('SB_SUPABASE_KEY');
  });

  it('parses schema map from JSON', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SB_SUPABASE_KEY = 'key';
    process.env.SB_SCHEMA_MAP = '{"knowledge":"kb_items","contacts":"people"}';

    const config = parseConfig();
    expect(config.schemaMap).toEqual({ knowledge: 'kb_items', contacts: 'people' });
  });

  it('throws on invalid schema map JSON', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SB_SUPABASE_KEY = 'key';
    process.env.SB_SCHEMA_MAP = 'not valid json';

    expect(() => parseConfig()).toThrow('not valid JSON');
  });

  it('throws on non-object schema map', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SB_SUPABASE_KEY = 'key';
    process.env.SB_SCHEMA_MAP = '["array"]';

    expect(() => parseConfig()).toThrow('must be a JSON object');
  });

  it('includes optional resend API key when present', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SB_SUPABASE_KEY = 'key';
    process.env.SB_RESEND_API_KEY = 're_test_12345';

    const config = parseConfig();
    expect(config.resendApiKey).toBe('re_test_12345');
  });

  it('omits resend API key when not present', () => {
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SB_SUPABASE_KEY = 'key';

    const config = parseConfig();
    expect(config.resendApiKey).toBeUndefined();
  });
});
