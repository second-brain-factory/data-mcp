# task-3112: Build @second-brain/data-mcp

## Problem
Customer knowledge data needs to move from Factory's hosted DB to customer-owned PocketBase (local) or Supabase (BYOD). A unified MCP server is needed that abstracts both backends behind semantic tools that skills call, regardless of which database the customer uses.

## Scope
37 tools total: 21 memory + 11 business + 3 setup + 2 deferred (newsletter_subscribe/unsubscribe → Phase 5).

## Architecture (from solution-architect + red-team)

### Adapter Pattern
- `DataAdapter` interface with semantic operations (not query translation)
- PocketBase adapter: REST API via `pocketbase` npm package
- Supabase adapter: `@supabase/supabase-js`
- Schema mapping via `SchemaMapProxy` (transparent to tools)
- Error taxonomy: COLLECTION_NOT_FOUND, RECORD_NOT_FOUND, VALIDATION_ERROR, UNIQUE_VIOLATION, CONNECTION_ERROR, AUTH_ERROR
- Graceful degradation: `withGracefulDegradation()` wrapper on every tool

### Key Decisions
- IDs: `z.string().min(1)` (not `.uuid()` — PocketBase uses 15-char alphanumeric)
- Search: LIKE/ILIKE for Phase 0 on PocketBase (FTS5 deferred to Phase 6)
- Decay: `1.0 - (days_since_validated / 180)` computed on-read
- email_send/newsletter_send REMOVED (side-effects don't belong in data layer)
- No runtime tier enforcement (gated at repo generation time)

## File Structure

```
data-mcp/
├── package.json, tsconfig.json, vitest.config.ts, .gitignore
├── src/
│   ├── index.ts                    # Entry: parse env, create adapter, create server, stdio
│   ├── server.ts                   # McpServer + tool registration
│   ├── config.ts                   # Env var parsing
│   ├── adapter/
│   │   ├── types.ts                # DataAdapter interface
│   │   ├── pocketbase.ts           # PocketBase implementation
│   │   ├── supabase.ts             # Supabase implementation
│   │   ├── factory.ts              # createAdapter()
│   │   └── schema-map.ts           # SB_SCHEMA_MAP proxy
│   ├── tools/
│   │   ├── shared.ts               # makeToolResponse, handleAdapterError, withGracefulDegradation
│   │   ├── register.ts             # registerAllTools()
│   │   ├── memory/                 # 21 tool files
│   │   ├── business/               # 11 tool files
│   │   └── setup/                  # 3 tool files
│   ├── search/
│   │   └── alias-expansion.ts      # Entity alias lookup + query expansion
│   └── errors/
│       └── adapter-error.ts        # Error classes + codes
├── migrations/
│   ├── pocketbase/                 # 7 JS migration files
│   └── supabase/                   # 8 SQL migration files
├── seed/
│   └── entity-aliases.json         # ~50 alias rows
└── tests/
    ├── adapter/                    # Adapter unit + integration tests
    ├── tools/                      # Tool tests against mock adapter
    ├── search/                     # Alias expansion tests
    └── helpers/
        ├── mock-adapter.ts         # In-memory DataAdapter for unit tests
        └── test-fixtures.ts        # Sample data
```

## Implementation Sequence

### Phase A: Scaffold + Adapters (~15 files)
1. package.json, tsconfig.json, vitest.config.ts, .gitignore
2. src/config.ts
3. src/errors/adapter-error.ts
4. src/adapter/types.ts (DataAdapter interface)
5. src/adapter/schema-map.ts
6. src/adapter/pocketbase.ts
7. src/adapter/supabase.ts
8. src/adapter/factory.ts
9. src/tools/shared.ts
10. tests/helpers/mock-adapter.ts + test-fixtures.ts
11. tests/adapter/schema-map.test.ts + factory.test.ts

### Phase B: Memory Tools + Setup (24 tools)
12. 21 memory tools in src/tools/memory/
13. 3 setup tools in src/tools/setup/
14. src/tools/register.ts
15. src/search/alias-expansion.ts
16. seed/entity-aliases.json
17. src/server.ts + src/index.ts

### Phase C: Business Tools (11 tools)
18. 11 business tools in src/tools/business/

### Phase D: Tests + CI
19. tests/tools/*.test.ts (per-tool unit tests)
20. tests/adapter/pocketbase.test.ts (integration)
21. tests/adapter/supabase.test.ts (integration)
22. tests/search/alias-expansion.test.ts
23. .github/workflows/ci.yml

### Phase E: Migrations
24. migrations/pocketbase/ (7 JS files)
25. migrations/supabase/ (8 SQL files)

## Acceptance Criteria
- [ ] `npx @second-brain/data-mcp` starts and connects to PocketBase
- [ ] knowledge_store + knowledge_recall round-trip on PocketBase
- [ ] knowledge_store + knowledge_recall round-trip on Supabase
- [ ] brain_stats returns correct counts
- [ ] setup_status reports backend type and schema version
- [ ] Missing collection returns helpful message (not crash)
- [ ] SB_SCHEMA_MAP remaps table names correctly
- [ ] All unit tests pass on mock adapter
- [ ] TypeScript compiles clean
- [ ] npm package publishable

## Risks
- PocketBase FTS5 deferred → search quality lower on PocketBase initially
- 37 tools is above the ~30 tool accuracy threshold (mitigated by Claude Code deferred loading)
- Package size with both PocketBase + Supabase SDKs (~280KB minified)
