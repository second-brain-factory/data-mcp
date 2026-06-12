/**
 * Tool: handoff_update
 *
 * Accept, complete, cancel, or amend a handoff packet.
 * Status transitions stamp accepted_at / completed_at automatically.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import type { HandoffRecord } from '../../types/records.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerHandoffUpdate(server: McpServer, adapter: DataAdapter): void {
    server.tool('handoff_update', 'Update a handoff packet. Set status to accepted when you pick it up, completed when done, or cancelled. Packet fields (what_changed, tried, assumptions, blockers, next_steps, needs_verification) can be amended.', {
        id: z.string().min(1).describe('ID of the handoff to update'),
        status: z.enum(['open', 'accepted', 'completed', 'cancelled']).optional().describe('New status. accepted stamps accepted_at; completed stamps completed_at.'),
        what_changed: z.string().max(5000).optional().describe('Updated state of the work'),
        tried: z.array(z.object({
            approach: z.string().max(500),
            outcome: z.string().max(1000),
        })).max(50).optional().describe('Updated list of attempted approaches'),
        assumptions: z.array(z.string().max(500)).max(50).optional().describe('Updated assumptions'),
        blocked_on: z.string().max(2000).optional().describe('Updated blocker'),
        next_steps: z.array(z.string().max(500)).max(50).optional().describe('Updated next steps'),
        needs_verification: z.array(z.string().max(500)).max(50).optional().describe('Updated re-verification list'),
        recheck_by: z.string().max(50).optional().describe('Updated staleness date (ISO)'),
    }, withGracefulDegradation('handoffs', adapter, async (params) => {
        try {
            const updates: Record<string, unknown> = {};
            if (params.what_changed !== undefined)
                updates.what_changed = params.what_changed;
            if (params.tried !== undefined)
                updates.tried = params.tried;
            if (params.assumptions !== undefined)
                updates.assumptions = params.assumptions;
            if (params.blocked_on !== undefined)
                updates.blocked_on = params.blocked_on;
            if (params.next_steps !== undefined)
                updates.next_steps = params.next_steps;
            if (params.needs_verification !== undefined)
                updates.needs_verification = params.needs_verification;
            if (params.recheck_by !== undefined)
                updates.recheck_by = params.recheck_by;
            if (params.status !== undefined) {
                updates.status = params.status;
                // Stamp lifecycle timestamps once — re-transitions keep the original.
                const existing = await adapter.getOne<HandoffRecord>('handoffs', params.id);
                if (params.status === 'accepted' && !existing.accepted_at) {
                    updates.accepted_at = new Date().toISOString();
                }
                if (params.status === 'completed' && !existing.completed_at) {
                    updates.completed_at = new Date().toISOString();
                }
            }
            if (Object.keys(updates).length === 0) {
                return makeToolResponse({
                    updated: false,
                    message: 'No fields to update. Provide at least one field to change.',
                });
            }
            const record = await adapter.update<HandoffRecord>('handoffs', params.id, updates);
            return makeToolResponse({
                updated: true,
                item: { id: record.id, title: record.title, to_member: record.to_member, status: record.status, accepted_at: record.accepted_at, completed_at: record.completed_at, updated_at: record.updated_at },
                message: `Handoff updated: "${record.title}" (${record.status})`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'handoff_update');
        }
    }));
}
