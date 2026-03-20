/**
 * Per-collection record types.
 *
 * These provide type safety when using DataAdapter generic methods.
 * Usage: adapter.create<KnowledgeRecord>('knowledge', data)
 */

export interface BaseRecord extends Record<string, unknown> {
  id: string;
  owner_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface KnowledgeRecord extends BaseRecord {
  type: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  source?: string;
  source_file?: string;
  confidence?: number;
  last_validated_at?: string;
  decay_score?: number;
  triggers?: unknown;
  metadata?: Record<string, unknown>;
}

export interface DecisionRecord extends BaseRecord {
  title: string;
  context?: string;
  options_considered?: string[];
  chosen_option: string;
  rationale?: string;
  outcome?: string;
  outcome_rating?: string;
  session_id?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SessionRecord extends BaseRecord {
  title: string;
  summary: string;
  session_date?: string;
  skills_used?: string[];
  files_changed?: string[];
  decisions_made?: Array<{ title: string; chosen: string }>;
  duration_minutes?: number;
  task_id?: string;
  branch?: string;
  patterns_learned?: Array<{ pattern: string; domain: string }>;
  knowledge_created?: number;
  knowledge_updated?: number;
  metadata?: Record<string, unknown>;
}

export interface GoalRecord extends BaseRecord {
  title: string;
  description?: string;
  timeframe?: string;
  status: string;
  key_results?: Array<{ description: string; target?: number; current?: number }>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskRecord extends BaseRecord {
  title: string;
  description?: string;
  status: string;
  priority: string;
  due_date?: string;
  tags?: string[];
  goal_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ContactRecord extends BaseRecord {
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  relationship?: string;
  notes?: string;
  tags?: string[];
  last_contact_date?: string;
  last_interaction_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ProspectRecord extends BaseRecord {
  name: string;
  email?: string;
  company?: string;
  role?: string;
  stage: string;
  source?: string;
  estimated_value?: number;
  next_action_type?: string;
  next_followup_date?: string;
  last_contact_date?: string;
  notes?: string;
  tags?: string[];
  linkedin_url?: string;
}

export interface BlogPostRecord extends BaseRecord {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  status: string;
  published_at?: string;
  tags?: string[];
  seo_title?: string;
  seo_description?: string;
  og_image_url?: string;
}

export interface EmailQueueRecord extends BaseRecord {
  to_email: string;
  to_name?: string;
  subject: string;
  body_html: string;
  body_text?: string;
  status: string;
  sequence_id?: string;
  sequence_step?: number;
  prospect_id?: string;
  scheduled_at?: string;
  sent_at?: string;
  error?: string;
  resend_id?: string;
}

export interface ContentCalendarRecord extends BaseRecord {
  title: string;
  content?: string;
  platform: string;
  pillar?: string;
  status: string;
  scheduled_date?: string;
  published_url?: string;
  persona?: string;
}

export interface SettingsRecord extends BaseRecord {
  key: string;
  value?: string;
}

export interface EntityAliasRecord extends BaseRecord {
  canonical: string;
  alias: string;
}

export interface NewsletterSubscriberRecord extends BaseRecord {
  email: string;
  name?: string;
  status: string;
  source?: string;
  tags?: string[];
  subscribed_at?: string;
  unsubscribed_at?: string;
}

export interface AffiliateRecord extends BaseRecord {
  name: string;
  email: string;
  code: string;
  commission_rate: number;
  status: string;
  total_earned_cents: number;
  total_paid_cents: number;
  stripe_account_id?: string;
}
