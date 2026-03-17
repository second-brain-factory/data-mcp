/**
 * PocketBase Migration 006: Business collections (blog, email, content)
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // blog_posts collection
  const blogPosts = new Collection({
    name: 'blog_posts',
    type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'slug', type: 'text', required: true, options: { maxSize: 200 } },
      { name: 'content', type: 'editor', required: true },
      { name: 'excerpt', type: 'text', options: { maxSize: 500 } },
      { name: 'status', type: 'select', required: true, options: { values: ['draft', 'published', 'archived'] } },
      { name: 'published_at', type: 'date' },
      { name: 'tags', type: 'json' },
      { name: 'seo_title', type: 'text', options: { maxSize: 200 } },
      { name: 'seo_description', type: 'text', options: { maxSize: 300 } },
      { name: 'og_image_url', type: 'url', options: { maxSize: 500 } },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_blog_posts_slug ON blog_posts (slug)',
    ],
  });
  app.save(blogPosts);

  // email_queue collection
  const emailQueue = new Collection({
    name: 'email_queue',
    type: 'base',
    schema: [
      { name: 'to_email', type: 'email', required: true, options: { maxSize: 200 } },
      { name: 'to_name', type: 'text', options: { maxSize: 200 } },
      { name: 'subject', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'body_html', type: 'editor', required: true },
      { name: 'body_text', type: 'editor' },
      { name: 'status', type: 'select', required: true, options: { values: ['queued', 'sent', 'failed', 'bounced'] } },
      { name: 'sequence_id', type: 'text', options: { maxSize: 100 } },
      { name: 'sequence_step', type: 'number' },
      { name: 'prospect_id', type: 'text', options: { maxSize: 100 } },
      { name: 'scheduled_at', type: 'date' },
      { name: 'sent_at', type: 'date' },
      { name: 'error', type: 'editor' },
      { name: 'resend_id', type: 'text', options: { maxSize: 200 } },
    ],
  });
  app.save(emailQueue);

  // content_calendar collection
  const contentCalendar = new Collection({
    name: 'content_calendar',
    type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'content', type: 'editor' },
      { name: 'platform', type: 'select', required: true, options: { values: ['linkedin', 'newsletter', 'blog', 'twitter', 'other'] } },
      { name: 'pillar', type: 'text', options: { maxSize: 100 } },
      { name: 'status', type: 'select', required: true, options: { values: ['idea', 'drafting', 'ready', 'published'] } },
      { name: 'scheduled_date', type: 'date' },
      { name: 'published_url', type: 'url', options: { maxSize: 500 } },
      { name: 'persona', type: 'text', options: { maxSize: 100 } },
    ],
  });
  app.save(contentCalendar);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('content_calendar'));
  app.delete(app.findCollectionByNameOrId('email_queue'));
  app.delete(app.findCollectionByNameOrId('blog_posts'));
});
