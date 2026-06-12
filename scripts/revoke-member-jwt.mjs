#!/usr/bin/env node
/**
 * Revoke (or un-revoke) a member JWT in hardened Supabase team mode
 * (issue #10). Inserts the token's `jti` into the `revoked_tokens`
 * denylist; the RLS policies from migrations/supabase/013_token_revocation.sql
 * then make every query with that token return zero rows / fail writes,
 * effective on the member's next request.
 *
 * Requires the SERVICE key (admin only — the denylist is not writable or
 * readable by member tokens).
 *
 * Usage:
 *   # revoke by pasting the member's token (jti + owner_id extracted)
 *   node scripts/revoke-member-jwt.mjs --token <jwt> [--reason "left team"]
 *
 *   # or revoke by jti directly (as printed at mint time)
 *   node scripts/revoke-member-jwt.mjs --jti <uuid> [--owner-id alice] [--reason "..."]
 *
 *   # inspect / manage the denylist
 *   node scripts/revoke-member-jwt.mjs list
 *   node scripts/revoke-member-jwt.mjs unrevoke --jti <uuid>
 *
 * Env: SB_SUPABASE_URL, SB_SUPABASE_SERVICE_KEY (or pass --url / --service-key).
 *
 * Note: legacy tokens minted before v0.10.0 carry no `jti` and cannot be
 * revoked individually — re-mint the team or rotate the project JWT secret.
 */
import { parseArgs } from 'node:util';
import { decodeJwt } from './mint-member-jwt.mjs';

export function extractRevocation({ token, jti, ownerId }) {
  if (token) {
    let payload;
    try { ({ payload } = decodeJwt(token)); }
    catch { throw new Error('--token is not a decodable JWT'); }
    if (!payload.jti) {
      throw new Error('Token has no jti claim (minted before v0.10.0). Re-mint member tokens to make them revocable; rotating the project JWT secret is the only way to kill this one.');
    }
    return { jti: payload.jti, owner_id: ownerId ?? payload.owner_id ?? null };
  }
  if (!jti) throw new Error('Provide --token <jwt> or --jti <uuid>');
  return { jti, owner_id: ownerId ?? null };
}

async function rest(base, serviceKey, path, opts = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      token: { type: 'string' },
      jti: { type: 'string' },
      'owner-id': { type: 'string' },
      reason: { type: 'string' },
      url: { type: 'string' },
      'service-key': { type: 'string' },
    },
  });
  const cmd = positionals[0] ?? 'revoke';
  const URL = values.url ?? process.env.SB_SUPABASE_URL;
  const SERVICE = values['service-key'] ?? process.env.SB_SUPABASE_SERVICE_KEY;

  try {
    if (!URL || !SERVICE) throw new Error('Set SB_SUPABASE_URL and SB_SUPABASE_SERVICE_KEY (or --url / --service-key)');

    if (cmd === 'list') {
      const { status, body } = await rest(URL, SERVICE, 'revoked_tokens?select=*&order=revoked_at.desc');
      if (status !== 200) throw new Error(`list failed (${status}): ${JSON.stringify(body)}`);
      if (!body.length) console.error('Denylist is empty.');
      for (const r of body) console.log(`${r.revoked_at}  jti=${r.jti}  owner_id=${r.owner_id ?? '-'}  reason=${r.reason ?? '-'}`);
    } else if (cmd === 'unrevoke') {
      if (!values.jti) throw new Error('unrevoke requires --jti <uuid>');
      const { status, body } = await rest(URL, SERVICE, `revoked_tokens?jti=eq.${encodeURIComponent(values.jti)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      if (status >= 400) throw new Error(`unrevoke failed (${status}): ${JSON.stringify(body)}`);
      if (!body?.length) throw new Error(`jti not found in denylist: ${values.jti}`);
      console.error(`Un-revoked jti=${values.jti} — the token works again.`);
    } else if (cmd === 'revoke') {
      const row = extractRevocation({ token: values.token, jti: values.jti, ownerId: values['owner-id'] });
      row.reason = values.reason ?? null;
      const { status, body } = await rest(URL, SERVICE, 'revoked_tokens', {
        method: 'POST',
        body: JSON.stringify(row),
        headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      });
      if (status >= 400) throw new Error(`revoke failed (${status}): ${JSON.stringify(body)}. Is migration 013_token_revocation.sql applied?`);
      const already = !body?.length;
      console.error(`${already ? 'Already revoked' : 'Revoked'} jti=${row.jti}${row.owner_id ? ` owner_id=${row.owner_id}` : ''} — takes effect on the member's next request.`);
    } else {
      throw new Error(`Unknown command: ${cmd} (expected: revoke | list | unrevoke)`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
