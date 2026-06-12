# Team Second Brain — User Test Manual (Claude Code, terminal)

Hands-on acceptance test for team mode, run entirely from your terminal as a
real user. You play both team members ("iwo" and "ola") in two Claude Code
sessions. No scripts — everything is typed conversationally, which also
tests whether Claude maps natural phrasing to the right MCP tools.

**Version under test:** `@iwo-szapar/data-mcp@0.8.0`
**Backend:** markdown (shared git repo). The Supabase-backend equivalent of
the isolation-critical steps is automated: `scripts/mvp-isolation-supabase.mjs`
(run with `SB_SUPABASE_URL`/`SB_SUPABASE_KEY` set) — it proves 3.2a/3.9 hold
on Supabase AND that no private cleartext exists on any member's disk there.
**Time:** ~20 minutes
**You need:** Claude Code CLI, git, a GitHub account (or use a local bare repo)

The automated contract behind this manual is enforced by
`scripts/team-e2e.mjs` (28 checks). A faithful scripted replay of THIS plan
against the published npm package is `scripts/mvp-test-plan.mjs` (25 checks:
two clones of a bare repo, real git sync ritual between steps, search
quality, concurrent-write friction probe; `MVP_PKG_VERSION=x.y.z` to test a
specific release). This manual covers the layer those scripts can't: the
human + Claude UX.

---

## Part 1 — Setup (5 min)

### 1.1 Create the shared memory repo

```bash
cd ~
gh repo create team-memory-test --private --clone
cd team-memory-test
git commit --allow-empty -m init && git push -u origin main
cd ~
```

(No GitHub? `git init --bare ~/team-memory-bare.git -b main` and use that
path as the clone URL below.)

### 1.2 Create two member workspaces

Each "member" gets their own directory containing their own clone:

```bash
mkdir -p ~/member-iwo ~/member-ola
git clone git@github.com:YOUR_USER/team-memory-test.git ~/member-iwo/memory
git clone git@github.com:YOUR_USER/team-memory-test.git ~/member-ola/memory
```

### 1.3 Configure each member's MCP server

Create `~/member-iwo/.mcp.json`:

```json
{
  "mcpServers": {
    "second-brain-data": {
      "command": "npx",
      "args": ["-y", "@iwo-szapar/data-mcp@0.8.0"],
      "env": {
        "SB_BACKEND": "markdown",
        "SB_MARKDOWN_ROOT": "/Users/YOU/member-iwo/memory",
        "MEMORYOS_OWNER_ID": "iwo",
        "MEMORYOS_SHARED_OWNER_ID": "team"
      }
    }
  }
}
```

Create `~/member-ola/.mcp.json` — identical except:

- `"SB_MARKDOWN_ROOT": "/Users/YOU/member-ola/memory"`
- `"MEMORYOS_OWNER_ID": "ola"`

Rules (these ARE part of the test — get them wrong and you should see it):

- Version pinned in `args` — never bare `@iwo-szapar/data-mcp`
- `SB_MARKDOWN_ROOT` absolute, pointing at that member's own clone
- `MEMORYOS_SHARED_OWNER_ID` identical for both members

### 1.4 Start both sessions

Open two terminal tabs:

```bash
# Tab 1 (you are IWO)          # Tab 2 (you are OLA)
cd ~/member-iwo && claude      cd ~/member-ola && claude
```

Approve the `second-brain-data` MCP server prompt in each tab.

**CHECK 1:** In each tab ask: *"What MCP tools do you have from
second-brain-data?"* — expect ~41 tools (knowledge, tasks, sessions,
goals, contacts, setup, brain_stats...).

> If the server fails to start or shows a wrong version: you are probably
> in a directory whose `node_modules` contains data-mcp, or the version
> isn't pinned. See "Config rules" in TEAM-SETUP.md.

---

## Part 2 — Bootstrap (2 min)

| Step | Tab | Say | Expect |
|---|---|---|---|
| 2.1 | 1 | "Run setup_migrate" | reports created collections, nothing needing migration |
| 2.2 | 1 | "Run setup_migrate again" | created: 0 (idempotent) |
| 2.3 | 1 | "Commit and push everything in the memory repo" | clean push |
| 2.4 | 2 | "Pull the memory repo" | collection dirs arrive |

**CHECK 2:** `ls ~/member-ola/memory` shows collection directories
(knowledge, tasks, decisions, ...).

---

## Part 3 — Core team contract (8 min)

The sync ritual between steps is part of the product: **push after writing,
pull before reading.** Say it explicitly each time ("...then commit and push
the memory repo" / "pull the memory repo first, then...").

| Step | Tab | Say | PASS if |
|---|---|---|---|
| 3.1 | 1 | "Remember privately: my negotiation floor for the pilot is 4k. Then push memory." | stored with private scope |
| 3.2a | 2 | "Pull memory. Then call the knowledge_recall MCP tool directly with query 'negotiation floor' and show me the raw JSON result." | **`total: 0`** — the MCP layer must not return iwo's private record. This is the real isolation check. |
| 3.2b | 2 | "What's my negotiation floor for the pilot?" | **Expected to "fail" on markdown — that is the point.** Claude has filesystem access to the shared repo and will likely read iwo's private cleartext file directly and answer "4k". This step demonstrates the trust model, not a bug: on markdown, private scope organizes memory, it does not keep secrets (see TEAM-SETUP.md security model). Record what happened; do not file it as a data-mcp issue. |
| 3.3 | 1 | "Store as shared team knowledge: we demo every Friday at 10. Push." | stored with shared scope |
| 3.4 | 2 | "Pull. When do we demo?" | Friday at 10 |
| 3.5 | 1 | "Create a shared high-priority task: Ola to review the onboarding doc. Push." | task created |
| 3.6 | 2 | "Pull. List my tasks." | sees the onboarding task |
| 3.7 | 2 | "Mark the onboarding review done. Push." | completes without error |
| 3.8 | 1 | "Pull. Is the onboarding review done?" | yes |
| 3.9 | 2 | Find a record id: `ls ~/member-ola/memory/knowledge/` won't show iwo's private file until pulled — after pull, copy the filename (uuid) of iwo's private item, then say: "Update knowledge record `<uuid>` to say the floor is 1k" | **"not found"** — not a permission error, no content leak |
| 3.10 | both | "Show my brain stats" | iwo's knowledge count > ola's |

**Steps 3.2a and 3.9 are the security-relevant ones.** Any MCP-layer leak
(3.2a returns iwo's record, or 3.9 leaks content/permission detail) = stop,
file an issue, do not ship. 3.2b "failing" on markdown is documented
behavior, not a blocker.

Also note 3.1 friction: Claude may initially refuse to store a private item
in a repo teammates can read — a correct instinct given the trust model.
Confirming "yes, store it privately" resolves it.

---

## Part 4 — Search quality (3 min)

Tests the 0.7.3 stemming + any-term fallback (issue #1297).

| Step | Tab | Say | PASS if |
|---|---|---|---|
| 4.1 | 1 | "Store shared insight: Pricing experiment results — the Q2 pricing experiment increased conversion by 12 percent. Push." | stored |
| 4.2 | 2 | "Pull. Recall: pricing experiments" (plural) | finds it |
| 4.3 | 2 | "Recall: what happened with conversion and pricing?" | finds it (response may mention any-term fallback) |
| 4.4 | 2 | "Recall: flibbertigibbet zzqx" | zero results — no made-up matches |

---

## Part 5 — Friction probe (2 min)

Deliberately break the sync ritual:

| Step | Tab | Say | Observe |
|---|---|---|---|
| 5.1 | 1 | "Store shared fact: concurrent note from iwo. Push." | ok |
| 5.2 | 2 | **Without pulling:** "Store shared fact: concurrent note from ola. Then push." | push is rejected (non-fast-forward); watch whether Claude recovers by pulling/merging then pushing — records are different files, so the merge must be clean |
| 5.3 | 1 | "Pull. Recall: concurrent note" | both items present |

**CHECK 5:** open any file in `~/member-iwo/memory/knowledge/` — YAML
frontmatter intact, `owner_id` present, content readable.

---

## Part 6 — Cleanup (1 min)

| Tab | Say |
|---|---|
| 1 | "Pull. Delete all knowledge items and the onboarding task — yes, confirm. Push." |

Expect Claude to set the delete confirmation itself.

> **`_archive/` warning:** `knowledge_delete` is a soft delete — records
> (including private ones) are *moved* to `_archive/` inside the memory
> root, not destroyed. Since 0.7.4, `setup_migrate` writes a `.gitignore`
> covering `_archive/`, so the push in this step must NOT commit archived
> files. **Verify:** `git -C ~/member-iwo/memory status` shows no
> `_archive/` paths staged, and the pushed commit contains only deletions.
> If archived records reach the remote, that is a release blocker. (Anything
> pushed before 0.7.4 stays in git history until `git filter-repo`.)

Then:

```bash
gh repo delete YOUR_USER/team-memory-test --yes   # if you used GitHub
rm -rf ~/member-iwo ~/member-ola
```

---

## Scorecard

| Part | Checks | Blocker if failed? |
|---|---|---|
| 1 Setup | server boots, 41 tools | yes |
| 2 Bootstrap | migrate works + idempotent | yes |
| 3 Core contract | 11 steps; 3.2a/3.9 are isolation | **3.2a, 3.9: release blockers.** 3.2b: expected trust-model demo on markdown. Others: investigate |
| 4 Search | 4 steps | file against data-mcp, not a blocker |
| 5 Friction | merge recovery | docs/UX problem, not code |
| 6 Cleanup | delete with confirm; `_archive/` must not be pushed | **archived records on remote: release blocker** |

**Ship-ready** = Parts 1–3 fully green (3.2b exempt) + no data corruption
in Part 5 + no `_archive/` files pushed in Part 6.

## What you're additionally observing throughout

This manual intentionally leaves tool selection to Claude. Watch for:

- Does Claude pick `knowledge_learn` vs `knowledge_store` sensibly?
  (learn accepts only pattern/insight/lesson; store takes all 5 types)
- Does it set `owner_scope: "shared"` when you say "shared team knowledge"
  and default to private otherwise?
- Does it handle `confirm: true` on deletes without you spelling it out?
- Does it remember the pull/push ritual after you've asked twice, or do
  you have to repeat it every time? (UX signal for the team product)
