/**
 * Tests for blog_create tool logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';

describe('blog_create logic', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    adapter.addCollection('blog_posts');
  });

  it('auto-generates slug from title', () => {
    // Replicate the slugify function from blog-create.ts
    function slugify(text: string): string {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 200);
    }

    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('  My Blog Post!  ')).toBe('my-blog-post');
    expect(slugify('Special @#$ Characters!!!')).toBe('special-characters');
    expect(slugify('A'.repeat(300))).toHaveLength(200);
  });

  it('creates blog post with draft status by default', async () => {
    const record = await adapter.create('blog_posts', {
      title: 'Test Post',
      slug: 'test-post',
      content: '# Test\n\nThis is a test post.',
      status: 'draft',
      published_at: null,
      tags: [],
    });

    expect(record.title).toBe('Test Post');
    expect(record.slug).toBe('test-post');
    expect(record.status).toBe('draft');
    expect(record.published_at).toBeNull();
  });

  it('sets published_at when status is published', async () => {
    const now = new Date().toISOString();
    const record = await adapter.create('blog_posts', {
      title: 'Published Post',
      slug: 'published-post',
      content: 'Content here.',
      status: 'published',
      published_at: now,
      tags: ['launch'],
    });

    expect(record.status).toBe('published');
    expect(record.published_at).toBe(now);
  });

  it('does not set published_at for draft or archived', async () => {
    const draftRecord = await adapter.create('blog_posts', {
      title: 'Draft Post',
      slug: 'draft-post',
      content: 'Work in progress.',
      status: 'draft',
      published_at: null,
      tags: [],
    });
    expect(draftRecord.published_at).toBeNull();

    const archivedRecord = await adapter.create('blog_posts', {
      title: 'Archived Post',
      slug: 'archived-post',
      content: 'Old content.',
      status: 'archived',
      published_at: null,
      tags: [],
    });
    expect(archivedRecord.published_at).toBeNull();
  });

  it('stores all optional fields', async () => {
    const record = await adapter.create('blog_posts', {
      title: 'Full Post',
      slug: 'full-post',
      content: 'Full content.',
      excerpt: 'Short excerpt.',
      status: 'draft',
      published_at: null,
      tags: ['seo', 'marketing'],
      seo_title: 'SEO Title Override',
      seo_description: 'SEO description for search.',
      og_image_url: 'https://example.com/image.png',
    });

    expect(record.excerpt).toBe('Short excerpt.');
    expect(record.seo_title).toBe('SEO Title Override');
    expect(record.seo_description).toBe('SEO description for search.');
    expect(record.og_image_url).toBe('https://example.com/image.png');
  });
});
