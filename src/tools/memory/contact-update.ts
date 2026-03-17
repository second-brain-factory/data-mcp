/**
 * Tool: contact_update
 *
 * Update a contact record by ID.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import type { ContactRecord } from '../../types/records.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerContactUpdate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'contact_update',
    'Update a contact record. Change any field by providing the new value.',
    {
      id: z.string().min(1).describe('ID of the contact to update'),
      name: z.string().min(1).max(200).optional().describe('New name'),
      company: z.string().max(200).optional().describe('New company'),
      role: z.string().max(200).optional().describe('New role'),
      email: z.string().max(200).optional().describe('New email'),
      phone: z.string().max(50).optional().describe('New phone'),
      relationship: z.enum(['colleague', 'client', 'prospect', 'partner', 'other']).optional().describe('New relationship type'),
      notes: z.string().max(5000).optional().describe('New notes'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('New tags'),
      last_contact_date: z.string().max(50).optional().describe('Last contact date (ISO format)'),
    },
    withGracefulDegradation('contacts', adapter, async (params) => {
      try {
        const updates: Record<string, unknown> = {};
        if (params.name !== undefined) updates.name = params.name.trim();
        if (params.company !== undefined) updates.company = params.company;
        if (params.role !== undefined) updates.role = params.role;
        if (params.email !== undefined) updates.email = params.email;
        if (params.phone !== undefined) updates.phone = params.phone;
        if (params.relationship !== undefined) updates.relationship = params.relationship;
        if (params.notes !== undefined) updates.notes = params.notes;
        if (params.tags !== undefined) updates.tags = params.tags;
        if (params.last_contact_date !== undefined) updates.last_contact_date = params.last_contact_date;

        if (Object.keys(updates).length === 0) {
          return makeToolResponse({
            updated: false,
            message: 'No fields to update. Provide at least one field to change.',
          });
        }

        const record = await adapter.update<ContactRecord>('contacts', params.id, updates);

        return makeToolResponse({
          updated: true,
          item: { id: record.id, name: record.name, company: record.company, updated_at: record.updated_at },
          message: `Contact updated: "${record.name}"`,
        });
      } catch (error) {
        return handleAdapterError(error, 'contact_update');
      }
    })
  );
}
