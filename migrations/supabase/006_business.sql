-- Migration 006: Business tables (blog_posts, email_queue, content_calendar)

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) <= 500),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) <= 200),
  content text NOT NULL,
  excerpt text CHECK (char_length(excerpt) <= 500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  tags text[] DEFAULT '{}',
  seo_title text CHECK (char_length(seo_title) <= 200),
  seo_description text CHECK (char_length(seo_description) <= 300),
  og_image_url text CHECK (char_length(og_image_url) <= 500),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts (status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_search ON blog_posts USING gin(search_vector);

CREATE TABLE IF NOT EXISTS email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL CHECK (char_length(to_email) <= 200),
  to_name text CHECK (char_length(to_name) <= 200),
  subject text NOT NULL CHECK (char_length(subject) <= 500),
  body_html text NOT NULL,
  body_text text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'bounced')),
  sequence_id text CHECK (char_length(sequence_id) <= 100),
  sequence_step int,
  prospect_id uuid,
  scheduled_at timestamptz,
  sent_at timestamptz,
  error text,
  resend_id text CHECK (char_length(resend_id) <= 200),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue (status);

CREATE TABLE IF NOT EXISTS content_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) <= 500),
  content text,
  platform text NOT NULL CHECK (platform IN ('linkedin', 'newsletter', 'blog', 'twitter', 'other')),
  pillar text CHECK (char_length(pillar) <= 100),
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'drafting', 'ready', 'published')),
  scheduled_date date,
  published_url text CHECK (char_length(published_url) <= 500),
  persona text CHECK (char_length(persona) <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_platform ON content_calendar (platform);
CREATE INDEX IF NOT EXISTS idx_content_calendar_status ON content_calendar (status);

CREATE TRIGGER blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER content_calendar_updated_at BEFORE UPDATE ON content_calendar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
