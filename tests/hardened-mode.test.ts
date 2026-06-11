/**
 * Unit tests for hardened Supabase team mode (issue #5):
 *  - config resolution: service key vs anon+member-JWT precedence and the
 *    half-configured error
 *  - mint-member-jwt: claim contract, signature, expiry, validation
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseConfig } from '../src/config.js';
import { mintMemberJwt, decodeJwt, verifyJwt } from '../scripts/mint-member-jwt.mjs';

const ENV_KEYS = [
    'SB_BACKEND', 'SB_SUPABASE_URL', 'SB_SUPABASE_KEY',
    'SB_SUPABASE_ANON_KEY', 'SB_SUPABASE_MEMBER_JWT',
    'MEMORYOS_OWNER_ID', 'MEMORYOS_SHARED_OWNER_ID', 'SB_SCHEMA_MAP',
];
let saved;

beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.SB_BACKEND = 'supabase';
    process.env.SB_SUPABASE_URL = 'https://example.supabase.co';
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

describe('Supabase config — credential modes', () => {
    it('service mode: SB_SUPABASE_KEY alone works unchanged', () => {
        process.env.SB_SUPABASE_KEY = 'service-key';
        const cfg = parseConfig();
        expect(cfg.backend).toBe('supabase');
        expect((cfg as any).supabaseKey).toBe('service-key');
        expect((cfg as any).supabaseMemberJwt).toBeUndefined();
    });

    it('hardened mode: anon key + member JWT resolve, member JWT carried', () => {
        process.env.SB_SUPABASE_ANON_KEY = 'anon-key';
        process.env.SB_SUPABASE_MEMBER_JWT = 'member.jwt.token';
        const cfg = parseConfig();
        expect((cfg as any).supabaseKey).toBe('anon-key');
        expect((cfg as any).supabaseMemberJwt).toBe('member.jwt.token');
    });

    it('hardened mode takes precedence over service key when both present', () => {
        process.env.SB_SUPABASE_KEY = 'service-key';
        process.env.SB_SUPABASE_ANON_KEY = 'anon-key';
        process.env.SB_SUPABASE_MEMBER_JWT = 'member.jwt.token';
        const cfg = parseConfig();
        expect((cfg as any).supabaseKey).toBe('anon-key');
        expect((cfg as any).supabaseMemberJwt).toBe('member.jwt.token');
    });

    it('half-configured hardened mode throws (anon key only)', () => {
        process.env.SB_SUPABASE_ANON_KEY = 'anon-key';
        expect(() => parseConfig()).toThrow(/BOTH SB_SUPABASE_ANON_KEY and SB_SUPABASE_MEMBER_JWT/);
    });

    it('half-configured hardened mode throws (member JWT only)', () => {
        process.env.SB_SUPABASE_MEMBER_JWT = 'member.jwt.token';
        expect(() => parseConfig()).toThrow(/BOTH SB_SUPABASE_ANON_KEY and SB_SUPABASE_MEMBER_JWT/);
    });

    it('no credentials at all throws the original SB_SUPABASE_KEY error', () => {
        expect(() => parseConfig()).toThrow(/SB_SUPABASE_KEY/);
    });
});

describe('mint-member-jwt', () => {
    const SECRET = 'test-jwt-secret-which-is-long-enough';

    it('mints a JWT with the RLS claim contract', () => {
        const token = mintMemberJwt({ ownerId: 'alice', sharedOwnerId: 'team', secret: SECRET });
        const { header, payload } = decodeJwt(token);
        expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
        expect(payload.role).toBe('authenticated');
        expect(payload.owner_id).toBe('alice');
        expect(payload.shared_owner_id).toBe('team');
        expect(payload.iss).toBe('data-mcp-member');
    });

    it('signature verifies with the right secret and fails with the wrong one', () => {
        const token = mintMemberJwt({ ownerId: 'alice', sharedOwnerId: 'team', secret: SECRET });
        expect(verifyJwt(token, SECRET)).toBe(true);
        expect(verifyJwt(token, 'wrong-secret')).toBe(false);
    });

    it('default expiry is ~365 days from now', () => {
        const now = Date.now();
        const token = mintMemberJwt({ ownerId: 'a', sharedOwnerId: 't', secret: SECRET, now });
        const { payload } = decodeJwt(token);
        expect(payload.exp - payload.iat).toBe(365 * 86400);
        expect(payload.iat).toBe(Math.floor(now / 1000));
    });

    it('custom expiry respected', () => {
        const token = mintMemberJwt({ ownerId: 'a', sharedOwnerId: 't', secret: SECRET, expiresDays: 30 });
        const { payload } = decodeJwt(token);
        expect(payload.exp - payload.iat).toBe(30 * 86400);
    });

    it.each([
        [{ sharedOwnerId: 't', secret: 's' }, /ownerId/],
        [{ ownerId: 'a', secret: 's' }, /sharedOwnerId/],
        [{ ownerId: 'a', sharedOwnerId: 't' }, /secret/],
        [{ ownerId: 'a', sharedOwnerId: 't', secret: 's', expiresDays: -1 }, /positive/],
        [{ ownerId: 'a', sharedOwnerId: 't', secret: 's', expiresDays: 'nope' }, /positive/],
    ])('rejects invalid input %#', (input, msg) => {
        expect(() => mintMemberJwt(input)).toThrow(msg);
    });
});
