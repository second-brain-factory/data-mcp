/**
 * PocketBase Migration 006: Business collections (blog, email, content)
 * PocketBase v0.23+ field format.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const blogPosts = new Collection({
    name: 'blog_posts',
    type: 'base',
    fields: [
      { name: 'title', type: 'text', required: true, max: 500 },
      { name: 'slug', type: 'text', required: true, max: 200 },
      { name: 'content', type: 'editor', required: true },
      { name: 'excerpt', type: 'text', max: 500 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['draft', 'published', 'archived'] },
      { name: 'published_at', type: 'date' },
      { name: 'tags', type: 'json' },
      { name: 'seo_title', type: 'text', max: 200 },
      { name: 'seo_description', type: 'text', max: 300 },
      { name: 'og_image_url', type: 'url' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_blog_posts_slug ON blog_posts (slug)',
      'CREATE INDEX idx_blog_posts_status ON blog_posts (status)',
    ],
  });
  app.save(blogPosts);

  const emailQueue = new Collection({
    name: 'email_queue',
    type: 'base',
    fields: [
      { name: 'to_email', type: 'email', required: true },
      { name: 'to_name', type: 'text', max: 200 },
      { name: 'subject', type: 'text', required: true, max: 500 },
      { name: 'body_html', type: 'editor', required: true },
      { name: 'body_text', type: 'editor' },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['queued', 'sent', 'failed', 'bounced'] },
      { name: 'sequence_id', type: 'text', max: 100 },
      { name: 'sequence_step', type: 'number' },
      { name: 'prospect_id', type: 'text', max: 100 },
      { name: 'scheduled_at', type: 'date' },
      { name: 'sent_at', type: 'date' },
      { name: 'error', type: 'editor' },
      { name: 'resend_id', type: 'text', max: 200 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_email_queue_status ON email_queue (status)',
    ],
  });
  app.save(emailQueue);

  const contentCalendar = new Collection({
    name: 'content_calendar',
    type: 'base',
    fields: [
      { name: 'title', type: 'text', required: true, max: 500 },
      { name: 'content', type: 'editor' },
      { name: 'platform', type: 'select', required: true, maxSelect: 1, values: ['linkedin', 'newsletter', 'blog', 'twitter', 'other'] },
      { name: 'pillar', type: 'text', max: 100 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['idea', 'drafting', 'ready', 'published'] },
      { name: 'scheduled_date', type: 'date' },
      { name: 'published_url', type: 'url' },
      { name: 'persona', type: 'text', max: 100 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_content_calendar_platform ON content_calendar (platform)',
      'CREATE INDEX idx_content_calendar_status ON content_calendar (status)',
    ],
  });
  app.save(contentCalendar);
}, (app) => {
  const cc = app.findCollectionByNameOrId('content_calendar'); if (cc) app.delete(cc);
  const eq = app.findCollectionByNameOrId('email_queue'); if (eq) app.delete(eq);
  const bp = app.findCollectionByNameOrId('blog_posts'); if (bp) app.delete(bp);
});
