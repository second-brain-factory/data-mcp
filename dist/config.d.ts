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
export declare function parseConfig(): Config;
//# sourceMappingURL=config.d.ts.map