/**
 * Configuration parsing from environment variables.
 *
 * SB_BACKEND: 'pocketbase' | 'supabase' (required)
 * SB_POCKETBASE_URL: PocketBase server URL (required if backend=pocketbase)
 * SB_POCKETBASE_ADMIN_EMAIL: PocketBase admin email (required if backend=pocketbase)
 * SB_POCKETBASE_ADMIN_PASSWORD: PocketBase admin password (required if backend=pocketbase)
 * SB_SUPABASE_URL: Supabase project URL (required if backend=supabase)
 * SB_SUPABASE_KEY: Supabase service role key (required if backend=supabase)
 * SB_SCHEMA_MAP: JSON string mapping logical names to actual table names (optional)
 * SB_RESEND_API_KEY: Resend API key for email sending (optional)
 */

export type Backend = 'pocketbase' | 'supabase';

export interface PocketBaseConfig {
  backend: 'pocketbase';
  pocketbaseUrl: string;
  pocketbaseAdminEmail: string;
  pocketbaseAdminPassword: string;
  schemaMap: Record<string, string>;
  resendApiKey?: string;
}

export interface SupabaseConfig {
  backend: 'supabase';
  supabaseUrl: string;
  supabaseKey: string;
  schemaMap: Record<string, string>;
  resendApiKey?: string;
}

export type Config = PocketBaseConfig | SupabaseConfig;

export function parseConfig(): Config {
  const backend = requireEnv('SB_BACKEND') as Backend;

  if (backend !== 'pocketbase' && backend !== 'supabase') {
    throw new Error(`SB_BACKEND must be 'pocketbase' or 'supabase', got '${backend}'`);
  }

  const schemaMap = parseSchemaMap(process.env.SB_SCHEMA_MAP);
  const resendApiKey = process.env.SB_RESEND_API_KEY || undefined;

  if (backend === 'pocketbase') {
    return {
      backend,
      pocketbaseUrl: requireEnv('SB_POCKETBASE_URL'),
      pocketbaseAdminEmail: requireEnv('SB_POCKETBASE_ADMIN_EMAIL'),
      pocketbaseAdminPassword: requireEnv('SB_POCKETBASE_ADMIN_PASSWORD'),
      schemaMap,
      resendApiKey,
    };
  }

  return {
    backend,
    supabaseUrl: requireEnv('SB_SUPABASE_URL'),
    supabaseKey: requireEnv('SB_SUPABASE_KEY'),
    schemaMap,
    resendApiKey,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseSchemaMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('SB_SCHEMA_MAP must be a JSON object');
    }
    return parsed as Record<string, string>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`SB_SCHEMA_MAP is not valid JSON: ${err.message}`);
    }
    throw err;
  }
}
