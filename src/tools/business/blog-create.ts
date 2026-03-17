/**
 * Tool: blog_create
 *
 * Create a blog post.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 200);
}

export function registerBlogCreate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'blog_create',
    'Create a blog post. Auto-generates slug from title if not provided.',
    {
      title: z.string().min(1).max(500).describe('Blog post title'),
      slug: z.string().max(200).optional().describe('URL slug (auto-generated from title if not provided)'),
      content: z.string().min(1).max(100000).describe('Blog post content (markdown, max 100KB)'),
      excerpt: z.string().max(500).optional().describe('Short excerpt'),
      status: z.enum(['draft', 'published', 'archived']).optional().describe('Post status (default: draft)'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('Tags'),
      seo_title: z.string().max(200).optional().describe('SEO title override'),
      seo_description: z.string().max(300).optional().describe('SEO meta description'),
      og_image_url: z.string().max(500).optional().describe('Open Graph image URL'),
    },
    withGracefulDegradation('blog_posts', adapter, async (params) => {
      try {
        const status = params.status ?? 'draft';
        const slug = params.slug ?? slugify(params.title);

        const record = await adapter.create<Record<string, unknown>>('blog_posts', {
          title: params.title.trim(),
          slug,
          content: params.content,
          excerpt: params.excerpt ?? null,
          status,
          published_at: status === 'published' ? new Date().toISOString() : null,
          tags: params.tags ?? [],
          seo_title: params.seo_title ?? null,
          seo_description: params.seo_description ?? null,
          og_image_url: params.og_image_url ?? null,
        });

        return makeToolResponse({
          created: true,
          item: { id: record.id, title: record.title, slug: record.slug, status: record.status, created_at: record.created_at },
          message: `Blog post created: "${params.title}" (${status})`,
        });
      } catch (error) {
        return handleAdapterError(error, 'blog_create');
      }
    })
  );
}
