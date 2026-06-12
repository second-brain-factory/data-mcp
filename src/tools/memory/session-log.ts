/**
 * Tool: session_log
 *
 * Log a completed work session with metadata.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerSessionLog(server: McpServer, adapter: DataAdapter): void {
    server.registerTool('session_log', {
        description: 'Log a completed work session. Records what was done, skills used, files changed, and decisions made.',
        inputSchema: {
        title: z.string().min(1).max(500).describe('Session title'),
        summary: z.string().min(1).max(10000).describe('Summary of what was accomplished'),
        skills_used: z.array(z.string().max(100)).optional().describe('Skills/tools used during the session'),
        files_changed: z.array(z.string().max(500)).optional().describe('Files that were created or modified'),
        decisions_made: z.array(z.object({
            title: z.string().max(500),
            chosen: z.string().max(500),
        })).optional().describe('Decisions made during the session'),
        duration_minutes: z.number().int().min(0).optional().describe('Duration of the session in minutes'),
        task_id: z.string().max(100).optional().describe('Related task ID'),
        branch: z.string().max(200).optional().describe('Git branch name'),
        patterns_learned: z.array(z.object({
            pattern: z.string().max(500),
            domain: z.string().max(200),
        })).optional().describe('Patterns learned during the session'),
        knowledge_created: z.number().int().min(0).optional().describe('Number of knowledge items created'),
        knowledge_updated: z.number().int().min(0).optional().describe('Number of knowledge items updated'),
        owner_scope: z.enum(['private', 'shared']).optional().describe('Store privately for this user or in shared team memory'),
        metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
        },
        // Hot-path tool: keep loaded under client-side tool search.
        _meta: { 'anthropic/alwaysLoad': true },
    }, withGracefulDegradation('sessions', adapter, async (params) => {
        try {
            const record = await adapter.create('sessions', {
                title: params.title.trim(),
                summary: params.summary,
                session_date: new Date().toISOString().split('T')[0],
                skills_used: params.skills_used ?? [],
                files_changed: params.files_changed ?? [],
                decisions_made: params.decisions_made ?? [],
                duration_minutes: params.duration_minutes ?? null,
                task_id: params.task_id ?? null,
                branch: params.branch ?? null,
                patterns_learned: params.patterns_learned ?? [],
                knowledge_created: params.knowledge_created ?? 0,
                knowledge_updated: params.knowledge_updated ?? 0,
                ...(adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope } : {}),
                metadata: params.metadata ?? null,
            });
            return makeToolResponse({
                logged: true,
                item: { id: record.id, title: record.title, session_date: record.session_date, created_at: record.created_at },
                message: `Session logged: "${params.title}"`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'session_log');
        }
    }));
}
