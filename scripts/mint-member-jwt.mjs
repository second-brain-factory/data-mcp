#!/usr/bin/env node
/**
 * Mint a long-lived member JWT for hardened Supabase team mode (issue #5).
 *
 * The admin runs this once per member with the project's JWT secret
 * (Supabase dashboard -> Project Settings -> API -> JWT Secret). The member
 * puts the token in SB_SUPABASE_MEMBER_JWT alongside SB_SUPABASE_ANON_KEY.
 * RLS policies from migrations/supabase/011_rls_owner_isolation.sql scope
 * every query to the embedded owner_id + shared_owner_id claims.
 *
 * Usage:
 *   node scripts/mint-member-jwt.mjs \
 *     --owner-id alice --shared-owner-id team \
 *     [--expires-days 365] [--secret <jwt-secret>]
 *
 * The secret can also come from SUPABASE_JWT_SECRET env (preferred — keeps
 * it out of shell history).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

export function mintMemberJwt({ ownerId, sharedOwnerId, secret, expiresDays = 365, now = Date.now(), jti = randomUUID() }) {
  if (!ownerId) throw new Error('ownerId is required');
  if (!sharedOwnerId) throw new Error('sharedOwnerId is required');
  if (!secret) throw new Error('JWT secret is required (SUPABASE_JWT_SECRET env or --secret)');
  const days = Number(expiresDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error('expiresDays must be a positive number');

  const iat = Math.floor(now / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    role: 'authenticated',          // PostgREST role switch — RLS applies
    owner_id: ownerId,              // matches RLS policy claim
    shared_owner_id: sharedOwnerId, // matches RLS policy claim
    // unique token id — per-member revocation (issue #10); jti: null omits
    // the claim (simulates pre-v0.10.0 legacy tokens in tests)
    ...(jti != null ? { jti } : {}),
    iss: 'data-mcp-member',
    iat,
    exp: iat + Math.floor(days * 86400),
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export function decodeJwt(token) {
  const [h, p] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
  };
}

export function verifyJwt(token, secret) {
  const [h, p, sig] = token.split('.');
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return sig === expected;
}

// CLI entrypoint (skipped when imported by tests)
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { values } = parseArgs({
    options: {
      'owner-id': { type: 'string' },
      'shared-owner-id': { type: 'string' },
      'expires-days': { type: 'string', default: '365' },
      secret: { type: 'string' },
    },
  });
  try {
    const token = mintMemberJwt({
      ownerId: values['owner-id'],
      sharedOwnerId: values['shared-owner-id'],
      secret: values.secret ?? process.env.SUPABASE_JWT_SECRET,
      expiresDays: values['expires-days'],
    });
    const { payload } = decodeJwt(token);
    console.error(`Minted member JWT for owner_id=${payload.owner_id} shared_owner_id=${payload.shared_owner_id} exp=${new Date(payload.exp * 1000).toISOString()}`);
    console.error(`Token id (jti): ${payload.jti} — record this; revoke later with scripts/revoke-member-jwt.mjs`);
    console.error('Member config: SB_SUPABASE_ANON_KEY=<project anon key> SB_SUPABASE_MEMBER_JWT=<token below>');
    console.log(token); // token on stdout for piping
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
