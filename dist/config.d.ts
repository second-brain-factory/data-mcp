/**
 * Configuration parsing from environment variables.
 *
 * SB_BACKEND: 'pocketbase' | 'supabase' | 'markdown' (required)
 * SB_POCKETBASE_URL: PocketBase server URL (required if backend=pocketbase)
 * SB_POCKETBASE_ADMIN_EMAIL: PocketBase admin email (required if backend=pocketbase)
 * SB_POCKETBASE_ADMIN_PASSWORD: PocketBase admin password (required if backend=pocketbase)
 * SB_SUPABASE_URL: Supabase project URL (required if backend=supabase)
 * SB_SUPABASE_KEY: Supabase service role key (required if backend=supabase
 *   unless hardened mode below is configured)
 * SB_SUPABASE_ANON_KEY + SB_SUPABASE_MEMBER_JWT: hardened team mode — anon
 *   key as apikey, member JWT (scripts/mint-member-jwt.mjs) as Authorization
 *   bearer. RLS (migration 011) scopes the member at the database level.
 *   When both are set they take precedence over SB_SUPABASE_KEY.
 * SB_MARKDOWN_ROOT: filesystem path to the memory/ folder (required if backend=markdown)
 * SB_SCHEMA_MAP: JSON string mapping logical names to actual table names (optional)
 * SB_RESEND_API_KEY: Resend API key for email sending (optional)
 * MEMORYOS_OWNER_ID: current memory owner id, enables owner routing when set (optional)
 * MEMORYOS_SHARED_OWNER_ID: shared/team memory owner id (optional, default: firma)
 */
export type Backend = 'pocketbase' | 'supabase' | 'markdown';
export interface PocketBaseConfig {
    backend: 'pocketbase';
    pocketbaseUrl: string;
    pocketbaseAdminEmail: string;
    pocketbaseAdminPassword: string;
    schemaMap: Record<string, string>;
    resendApiKey?: string;
    ownerRouting?: OwnerRoutingConfig;
}
export interface SupabaseConfig {
    backend: 'supabase';
    supabaseUrl: string;
    /** apikey header value: service role key, or anon key in hardened mode */
    supabaseKey: string;
    /** Hardened mode: member JWT sent as Authorization bearer (RLS-scoped) */
    supabaseMemberJwt?: string;
    schemaMap: Record<string, string>;
    resendApiKey?: string;
    ownerRouting?: OwnerRoutingConfig;
}
export interface MarkdownConfig {
    backend: 'markdown';
    markdownRoot: string;
    schemaMap: Record<string, string>;
    resendApiKey?: string;
    ownerRouting?: OwnerRoutingConfig;
}
export interface OwnerRoutingConfig {
    ownerId: string;
    sharedOwnerId: string;
}
export type Config = PocketBaseConfig | SupabaseConfig | MarkdownConfig;
export declare function parseConfig(): Config;
//# sourceMappingURL=config.d.ts.map