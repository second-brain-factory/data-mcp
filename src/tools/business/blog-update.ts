/**
 * Tool: blog_update
 *
 * Update a blog post by ID.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerBlogUpdate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'blog_update',
    'Update a blog post. Change title, content, status, or other fields.',
    {
      id: z.string().min(1).describe('ID of the blog post to update'),
      title: z.string().min(1).max(500).optional().describe('New title'),
      slug: z.string().max(200).optional().describe('New slug'),
      content: z.string().optional().describe('New content (markdown)'),
      excerpt: z.string().max(500).optional().describe('New excerpt'),
      status: z.enum(['draft', 'published', 'archived']).optional().describe('New status'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('New tags'),
      seo_title: z.string().max(200).optional().describe('New SEO title'),
      seo_description: z.string().max(300).optional().describe('New SEO description'),
      og_image_url: z.string().max(500).optional().describe('New OG image URL'),
    },
    withGracefulDegradation('blog_posts', adapter, async (params) => {
      try {
        const updates: Record<string, unknown> = {};
        if (params.title !== undefined) updates.title = params.title.trim();
        if (params.slug !== undefined) updates.slug = params.slug;
        if (params.content !== undefined) updates.content = params.content;
        if (params.excerpt !== undefined) updates.excerpt = params.excerpt;
        if (params.status !== undefined) {
          updates.status = params.status;
          if (params.status === 'published') {
            updates.published_at = new Date().toISOString();
          } else {
            updates.published_at = null;
          }
        }
        if (params.tags !== undefined) updates.tags = params.tags;
        if (params.seo_title !== undefined) updates.seo_title = params.seo_title;
        if (params.seo_description !== undefined) updates.seo_description = params.seo_description;
        if (params.og_image_url !== undefined) updates.og_image_url = params.og_image_url;

        if (Object.keys(updates).length === 0) {
          return makeToolResponse({
            updated: false,
            message: 'No fields to update. Provide at least one field to change.',
          });
        }

        const record = await adapter.update<Record<string, unknown>>('blog_posts', params.id, updates);

        return makeToolResponse({
          updated: true,
          item: { id: record.id, title: record.title, slug: record.slug, status: record.status, updated_at: record.updated_at },
          message: `Blog post updated: "${record.title}"`,
        });
      } catch (error) {
        return handleAdapterError(error, 'blog_update');
      }
    })
  );
}
