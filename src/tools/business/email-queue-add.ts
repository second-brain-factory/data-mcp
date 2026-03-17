/**
 * Tool: email_queue_add
 *
 * Add an email to the queue. Does NOT send — just inserts into email_queue table.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerEmailQueueAdd(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'email_queue_add',
    'Add an email to the sending queue. Does NOT send the email — it only queues it for later processing.',
    {
      to_email: z.string().min(1).max(200).describe('Recipient email address'),
      to_name: z.string().max(200).optional().describe('Recipient name'),
      subject: z.string().min(1).max(500).describe('Email subject'),
      body_html: z.string().min(1).max(50000).describe('HTML body content (max 50KB)'),
      body_text: z.string().optional().describe('Plain text body (fallback)'),
      sequence_id: z.string().max(100).optional().describe('Email sequence ID'),
      sequence_step: z.number().int().optional().describe('Step number in sequence'),
      prospect_id: z.string().min(1).optional().describe('Related prospect ID'),
      scheduled_at: z.string().optional().describe('Scheduled send time (ISO format)'),
    },
    withGracefulDegradation('email_queue', adapter, async (params) => {
      try {
        const record = await adapter.create<Record<string, unknown>>('email_queue', {
          to_email: params.to_email,
          to_name: params.to_name ?? null,
          subject: params.subject,
          body_html: params.body_html,
          body_text: params.body_text ?? null,
          status: 'queued',
          sequence_id: params.sequence_id ?? null,
          sequence_step: params.sequence_step ?? null,
          prospect_id: params.prospect_id ?? null,
          scheduled_at: params.scheduled_at ?? null,
          sent_at: null,
          error: null,
          resend_id: null,
        });

        return makeToolResponse({
          queued: true,
          item: { id: record.id, to_email: record.to_email, subject: record.subject, status: 'queued', created_at: record.created_at },
          message: `Email queued to ${params.to_email}: "${params.subject}"`,
        });
      } catch (error) {
        return handleAdapterError(error, 'email_queue_add');
      }
    })
  );
}
