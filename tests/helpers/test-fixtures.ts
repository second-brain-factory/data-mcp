/**
 * Test fixtures — sample data for unit tests.
 */

export const sampleKnowledgeItems = [
  {
    type: 'fact',
    title: 'Stripe uses cents for amounts',
    content: 'When working with Stripe API, all monetary amounts are in cents. $10.00 = 1000 cents.',
    summary: 'Stripe uses cents for all monetary amounts.',
    tags: ['stripe', 'payments'],
    source: 'Stripe docs',
    confidence: 0.9,
    last_validated_at: new Date().toISOString(),
  },
  {
    type: 'pattern',
    title: 'Error handling in API routes',
    content: 'Always wrap API route handlers in try-catch. Return 500 with generic message, never leak error.message to clients.',
    summary: 'Wrap API handlers in try-catch, never leak error messages.',
    tags: ['api', 'error-handling'],
    source: 'Code review',
    confidence: 0.85,
    last_validated_at: new Date().toISOString(),
  },
  {
    type: 'insight',
    title: 'Voice onboarding converts better',
    content: 'Voice-first onboarding has 3x higher completion rate compared to form-based onboarding.',
    summary: 'Voice onboarding has 3x higher completion rate.',
    tags: ['ux', 'onboarding'],
    source: 'Internal analytics',
    confidence: 0.75,
    last_validated_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days ago (stale)
  },
];

export const sampleDecisions = [
  {
    title: 'Use PocketBase for local storage',
    context: 'Need a local database for customer Second Brains. Options: SQLite direct, PocketBase, or LevelDB.',
    options_considered: ['SQLite direct', 'PocketBase', 'LevelDB'],
    chosen_option: 'PocketBase',
    rationale: 'PocketBase provides admin UI, built-in auth, and REST API out of the box.',
    outcome: null,
    tags: ['architecture', 'database'],
  },
];

export const sampleGoals = [
  {
    title: 'Ship data-mcp v0.1',
    description: 'Complete the initial version of the unified data MCP server.',
    timeframe: 'monthly',
    status: 'active',
    key_results: [
      { description: 'All 35 tools implemented', target: 35, current: 0 },
      { description: 'Unit tests passing', target: 1, current: 0 },
    ],
    tags: ['product'],
  },
];

export const sampleContacts = [
  {
    name: 'Alice Johnson',
    company: 'TechCorp',
    role: 'CTO',
    email: 'alice@techcorp.com',
    phone: '+1-555-0100',
    relationship: 'client',
    notes: 'Met at conference. Interested in enterprise plan.',
    tags: ['enterprise', 'high-value'],
    last_contact_date: null,
  },
  {
    name: 'Bob Smith',
    company: 'StartupXYZ',
    role: 'Founder',
    email: 'bob@startupxyz.com',
    phone: null,
    relationship: 'prospect',
    notes: 'Reached out via LinkedIn.',
    tags: ['startup'],
    last_contact_date: null,
  },
];

export const sampleEntityAliases = [
  { canonical: 'stripe', alias: 'payment' },
  { canonical: 'stripe', alias: 'checkout' },
  { canonical: 'stripe', alias: 'billing' },
  { canonical: 'supabase', alias: 'database' },
  { canonical: 'supabase', alias: 'db' },
];
