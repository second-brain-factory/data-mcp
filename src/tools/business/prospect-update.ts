/**
 * Tool: prospect_update
 *
 * Update a prospect's stage, notes, next action, or other fields.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import type { ProspectRecord } from '../../types/records.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerProspectUpdate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'prospect_update',
    'Update a prospect. Change stage, notes, next action, or any other field.',
    {
      id: z.string().min(1).describe('ID of the prospect to update'),
      name: z.string().min(1).max(200).optional().describe('New name'),
      email: z.string().max(200).optional().describe('New email'),
      company: z.string().max(200).optional().describe('New company'),
      role: z.string().max(200).optional().describe('New role'),
      stage: z.enum(['new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing']).optional().describe('New stage'),
      estimated_value: z.number().int().optional().describe('New estimated value (cents)'),
      next_action_type: z.string().max(100).optional().describe('New next action type'),
      next_followup_date: z.string().max(50).optional().describe('New followup date'),
      last_contact_date: z.string().max(50).optional().describe('Last contact date'),
      notes: z.string().max(10000).optional().describe('New notes'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('New tags'),
      linkedin_url: z.string().max(500).optional().describe('New LinkedIn URL'),
    },
    withGracefulDegradation('prospects', adapter, async (params) => {
      try {
        const updates: Record<string, unknown> = {};
        if (params.name !== undefined) updates.name = params.name.trim();
        if (params.email !== undefined) updates.email = params.email;
        if (params.company !== undefined) updates.company = params.company;
        if (params.role !== undefined) updates.role = params.role;
        if (params.stage !== undefined) updates.stage = params.stage;
        if (params.estimated_value !== undefined) updates.estimated_value = params.estimated_value;
        if (params.next_action_type !== undefined) updates.next_action_type = params.next_action_type;
        if (params.next_followup_date !== undefined) updates.next_followup_date = params.next_followup_date;
        if (params.last_contact_date !== undefined) updates.last_contact_date = params.last_contact_date;
        if (params.notes !== undefined) updates.notes = params.notes;
        if (params.tags !== undefined) updates.tags = params.tags;
        if (params.linkedin_url !== undefined) updates.linkedin_url = params.linkedin_url;

        if (Object.keys(updates).length === 0) {
          return makeToolResponse({
            updated: false,
            message: 'No fields to update. Provide at least one field to change.',
          });
        }

        const record = await adapter.update<ProspectRecord>('prospects', params.id, updates);

        return makeToolResponse({
          updated: true,
          item: { id: record.id, name: record.name, stage: record.stage, updated_at: record.updated_at },
          message: `Prospect updated: "${record.name}"`,
        });
      } catch (error) {
        return handleAdapterError(error, 'prospect_update');
      }
    })
  );
}
