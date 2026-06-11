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
const ALLOWED_BACKENDS: Backend[] = ['pocketbase', 'supabase', 'markdown'];
export function parseConfig(): Config {
    const backend = requireEnv('SB_BACKEND') as Backend;
    if (!ALLOWED_BACKENDS.includes(backend)) {
        throw new Error(`SB_BACKEND must be one of ${ALLOWED_BACKENDS.join('|')}, got '${backend}'`);
    }
    const schemaMap = parseSchemaMap(process.env.SB_SCHEMA_MAP);
    const resendApiKey = process.env.SB_RESEND_API_KEY || undefined;
    const ownerRouting = parseOwnerRouting();
    if (backend === 'pocketbase') {
        return {
            backend,
            pocketbaseUrl: requireEnv('SB_POCKETBASE_URL'),
            pocketbaseAdminEmail: requireEnv('SB_POCKETBASE_ADMIN_EMAIL'),
            pocketbaseAdminPassword: requireEnv('SB_POCKETBASE_ADMIN_PASSWORD'),
            schemaMap,
            resendApiKey,
            ownerRouting,
        };
    }
    if (backend === 'markdown') {
        return {
            backend,
            markdownRoot: requireEnv('SB_MARKDOWN_ROOT'),
            schemaMap,
            resendApiKey,
            ownerRouting,
        };
    }
    return parseSupabaseConfig(schemaMap, resendApiKey, ownerRouting);
}

/**
 * Supabase credential resolution. Two modes:
 *  - service:  SB_SUPABASE_KEY (service role — full access, bypasses RLS)
 *  - hardened: SB_SUPABASE_ANON_KEY + SB_SUPABASE_MEMBER_JWT (per-member,
 *              RLS-scoped via migration 011). Takes precedence when both
 *              env pairs are present. Setting only one of the hardened pair
 *              is a config error, not a silent fallback.
 */
function parseSupabaseConfig(schemaMap: Record<string, string>, resendApiKey: string | undefined, ownerRouting: OwnerRoutingConfig | undefined): SupabaseConfig {
    const supabaseUrl = requireEnv('SB_SUPABASE_URL');
    const anonKey = process.env.SB_SUPABASE_ANON_KEY?.trim();
    const memberJwt = process.env.SB_SUPABASE_MEMBER_JWT?.trim();
    if (anonKey && memberJwt) {
        return {
            backend: 'supabase',
            supabaseUrl,
            supabaseKey: anonKey,
            supabaseMemberJwt: memberJwt,
            schemaMap,
            resendApiKey,
            ownerRouting,
        };
    }
    if (anonKey || memberJwt) {
        throw new Error('Hardened Supabase mode requires BOTH SB_SUPABASE_ANON_KEY and SB_SUPABASE_MEMBER_JWT (got only one). Remove both to use SB_SUPABASE_KEY instead.');
    }
    return {
        backend: 'supabase',
        supabaseUrl,
        supabaseKey: requireEnv('SB_SUPABASE_KEY'),
        schemaMap,
        resendApiKey,
        ownerRouting,
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
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('SB_SCHEMA_MAP must be a JSON object');
        }
        return parsed as Record<string, string>;
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error(`SB_SCHEMA_MAP is not valid JSON: ${err.message}`);
        }
        throw err;
    }
}
function parseOwnerRouting(): OwnerRoutingConfig | undefined {
    const ownerId = process.env.MEMORYOS_OWNER_ID?.trim();
    if (!ownerId)
        return undefined;
    const sharedOwnerId = process.env.MEMORYOS_SHARED_OWNER_ID?.trim() || 'firma';
    return { ownerId, sharedOwnerId };
}
