/**
 * Tool: prospect_create
 *
 * Add a prospect to the CRM pipeline.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerProspectCreate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'prospect_create',
    'Add a prospect to the sales pipeline. Track leads through stages from new to closed.',
    {
      name: z.string().min(1).max(200).describe('Prospect name'),
      email: z.string().max(200).optional().describe('Email address'),
      company: z.string().max(200).optional().describe('Company name'),
      role: z.string().max(200).optional().describe('Role/title'),
      stage: z.enum(['new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing']).optional().describe('Pipeline stage (default: new)'),
      source: z.string().max(200).optional().describe('Where the prospect came from'),
      estimated_value: z.number().int().optional().describe('Estimated deal value in cents'),
      next_action_type: z.string().max(100).optional().describe('Next action type'),
      next_followup_date: z.string().max(50).optional().describe('Next followup date (ISO format)'),
      notes: z.string().max(10000).optional().describe('Notes about the prospect'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('Tags'),
      linkedin_url: z.string().max(500).optional().describe('LinkedIn profile URL'),
    },
    withGracefulDegradation('prospects', adapter, async (params) => {
      try {
        const record = await adapter.create<Record<string, unknown>>('prospects', {
          name: params.name.trim(),
          email: params.email ?? null,
          company: params.company ?? null,
          role: params.role ?? null,
          stage: params.stage ?? 'new',
          source: params.source ?? null,
          estimated_value: params.estimated_value ?? null,
          next_action_type: params.next_action_type ?? null,
          next_followup_date: params.next_followup_date ?? null,
          last_contact_date: null,
          notes: params.notes ?? null,
          tags: params.tags ?? [],
          linkedin_url: params.linkedin_url ?? null,
        });

        return makeToolResponse({
          created: true,
          item: { id: record.id, name: record.name, stage: record.stage, created_at: record.created_at },
          message: `Prospect created: "${params.name}" (stage: ${params.stage ?? 'new'})`,
        });
      } catch (error) {
        return handleAdapterError(error, 'prospect_create');
      }
    })
  );
}
