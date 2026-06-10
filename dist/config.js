/**
 * Configuration parsing from environment variables.
 *
 * SB_BACKEND: 'pocketbase' | 'supabase' | 'markdown' (required)
 * SB_POCKETBASE_URL: PocketBase server URL (required if backend=pocketbase)
 * SB_POCKETBASE_ADMIN_EMAIL: PocketBase admin email (required if backend=pocketbase)
 * SB_POCKETBASE_ADMIN_PASSWORD: PocketBase admin password (required if backend=pocketbase)
 * SB_SUPABASE_URL: Supabase project URL (required if backend=supabase)
 * SB_SUPABASE_KEY: Supabase service role key (required if backend=supabase)
 * SB_MARKDOWN_ROOT: filesystem path to the memory/ folder (required if backend=markdown)
 * SB_SCHEMA_MAP: JSON string mapping logical names to actual table names (optional)
 * SB_RESEND_API_KEY: Resend API key for email sending (optional)
 * MEMORYOS_OWNER_ID: current memory owner id, enables owner routing when set (optional)
 * MEMORYOS_SHARED_OWNER_ID: shared/team memory owner id (optional, default: firma)
 */
const ALLOWED_BACKENDS = ['pocketbase', 'supabase', 'markdown'];
export function parseConfig() {
    const backend = requireEnv('SB_BACKEND');
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
    return {
        backend,
        supabaseUrl: requireEnv('SB_SUPABASE_URL'),
        supabaseKey: requireEnv('SB_SUPABASE_KEY'),
        schemaMap,
        resendApiKey,
        ownerRouting,
    };
}
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function parseSchemaMap(raw) {
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('SB_SCHEMA_MAP must be a JSON object');
        }
        return parsed;
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error(`SB_SCHEMA_MAP is not valid JSON: ${err.message}`);
        }
        throw err;
    }
}
function parseOwnerRouting() {
    const ownerId = process.env.MEMORYOS_OWNER_ID?.trim();
    if (!ownerId)
        return undefined;
    const sharedOwnerId = process.env.MEMORYOS_SHARED_OWNER_ID?.trim() || 'firma';
    return { ownerId, sharedOwnerId };
}
//# sourceMappingURL=config.js.map
