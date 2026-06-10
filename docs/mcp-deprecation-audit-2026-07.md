# MCP 2026-07-28 Deprecation Audit (issue-1219, Slice 4)

Audit of `@iwo-szapar/data-mcp` 0.7.0 against the MCP spec deprecations
taking effect 2026-07-28: removal of legacy `roots`/`sampling`/`logging`
capability quirks and the `-32002` (ResourceNotFound) → `-32602`
(InvalidParams) error-code migration.

**Verdict: NOT AFFECTED. No code changes required for 0.7.0.**

## Audit scope

- Installed SDK: `@modelcontextprotocol/sdk` 1.29.0 (semver range `^1.12.1`)
- SDK latest protocol version: `2025-11-25`; supports back to `2024-10-07`
- All of `src/` (26 memory + 4 setup + 11 business tools, server, adapters)

## Findings

### 1. Error codes (`-32002` → `-32602`)

- `grep -rn "32002" src/` — no matches. The server never raises a raw
  JSON-RPC `-32002`.
- All tool errors flow through `handleAdapterError()` in `src/tools/shared.ts`,
  which converts `AdapterError` domain codes (`COLLECTION_NOT_FOUND`,
  `RECORD_NOT_FOUND`, etc.) into **tool-result payloads**
  (`isError`-style content), not protocol-level JSON-RPC errors.
- Protocol-level errors are emitted only by the SDK itself (e.g.
  `-32602 InvalidParams` from Zod schema validation in `server.tool()`),
  which already uses the post-migration code.

### 2. `roots` capability

- Not used. The server never calls `listRoots` or registers a roots
  handler. `grep -rn "roots\|listRoots" src/` — no matches.

### 3. `sampling` capability

- Not used. No `createMessage`/sampling requests anywhere in `src/`.

### 4. `logging` capability

- Not used. The server never calls `sendLoggingMessage` and does not
  declare the `logging` capability. Operational logging goes to stderr via
  `console.error` (`src/index.ts`), which is transport-invisible and
  unaffected by the spec change.

### 5. Capability declaration surface

- `createServer()` (`src/server.ts`) passes only `instructions` as server
  options; capabilities are derived by the SDK from registered features
  (tools only). No hand-rolled capability object exists that could carry
  deprecated fields.

## Forward guidance

- When bumping `@modelcontextprotocol/sdk` past 1.x, re-run this audit:
  the tool registration signature (`server.tool(...)`) is the only SDK
  surface this package touches, plus `StdioServerTransport`.
- If resource support is ever added, use `-32602` for unknown-resource
  errors from day one; never introduce `-32002`.
