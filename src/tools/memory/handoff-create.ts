/**
 * Tool: handoff_create
 *
 * Create an evidence-backed handoff packet for another team member.
 * Shared scope by default — a handoff the recipient cannot read is useless.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerHandoffCreate(server: McpServer, adapter: DataAdapter): void {
    server.tool('handoff_create', 'Hand off work to a team member with full investigation context: what changed, what was tried, assumptions, blockers, and what they must re-verify before trusting the inherited context. Shared with the team by default.', {
        title: z.string().min(1).max(500).describe('What is being handed off'),
        to_member: z.string().min(1).max(100).describe("Recipient's member id (their MEMORYOS_OWNER_ID)"),
        what_changed: z.string().max(5000).optional().describe('State of the work at handoff time'),
        tried: z.array(z.object({
            approach: z.string().max(500),
            outcome: z.string().max(1000),
        })).max(50).optional().describe('Approaches attempted and their outcomes (including failures)'),
        assumptions: z.array(z.string().max(500)).max(50).optional().describe('Unverified beliefs the work currently rests on'),
        blocked_on: z.string().max(2000).optional().describe('Current blocker, if any'),
        next_steps: z.array(z.string().max(500)).max(50).optional().describe('Suggested continuation steps'),
        needs_verification: z.array(z.string().max(500)).max(50).optional().describe('What the recipient must re-check before trusting this packet'),
        recheck_by: z.string().max(50).optional().describe('Date (ISO) after which this context should be treated as stale'),
        supersedes: z.string().max(100).optional().describe('ID of an earlier handoff this replaces'),
        task_id: z.string().max(100).optional().describe('Related task ID'),
        session_ids: z.array(z.string().max(100)).max(50).optional().describe('Related session log IDs'),
        owner_scope: z.enum(['private', 'shared']).optional().describe('Defaults to shared so the recipient can read it. Private is only valid for self-handoffs (to_member = you).'),
    }, withGracefulDegradation('handoffs', adapter, async (params) => {
        try {
            if (adapter.ownerScopeEnabled) {
                const scope = params.owner_scope ?? 'shared';
                if (scope === 'private' && adapter.currentOwnerId !== undefined && params.to_member !== adapter.currentOwnerId) {
                    return makeErrorResponse(`A private handoff to "${params.to_member}" would be invisible to them (your private records are not readable by other members). Use owner_scope "shared", or set to_member to your own id ("${adapter.currentOwnerId}") for a self-handoff note.`);
                }
            }
            const record = await adapter.create('handoffs', {
                title: params.title.trim(),
                to_member: params.to_member.trim(),
                status: 'open',
                what_changed: params.what_changed ?? null,
                tried: params.tried ?? [],
                assumptions: params.assumptions ?? [],
                blocked_on: params.blocked_on ?? null,
                next_steps: params.next_steps ?? [],
                needs_verification: params.needs_verification ?? [],
                recheck_by: params.recheck_by ?? null,
                supersedes: params.supersedes ?? null,
                task_id: params.task_id ?? null,
                session_ids: params.session_ids ?? [],
                accepted_at: null,
                completed_at: null,
                metadata: {},
                ...(adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope ?? 'shared' } : {}),
            });
            return makeToolResponse({
                created: true,
                item: { id: record.id, title: record.title, to_member: record.to_member, status: record.status, created_at: record.created_at },
                message: `Handoff created for "${params.to_member}": "${params.title}". They will see it via handoff_list.`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'handoff_create');
        }
    }));
}
