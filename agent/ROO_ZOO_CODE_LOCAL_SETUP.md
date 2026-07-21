# Local Setup Guide: Zoo Code Fresh Install (clone-based, from GitHub)

This recipient has never used Roo Code, so there's nothing to export from a Roo Code install and the official Roo→Zoo "Export from Roo Code / Import into Zoo Code" flow doesn't apply to them — that flow migrates an existing Roo Code user's settings, it isn't how you install Zoo Code from scratch.

Zoo Code reads the same settings file format Roo Code used (that's what makes the export/import migration path work). The config lives in two private GitHub repos:

- `agent/` in [`dschmidtadv/qdrant-memory-mcp`](https://github.com/dschmidtadv/qdrant-memory-mcp) — base config, custom modes, credential-resolution scripts
- [`dschmidtadv/roo-memory`](https://github.com/dschmidtadv/roo-memory) — optional memory-orchestrator layer

Since these are private repos, the recipient needs GitHub access granted first (repo collaborator invite, or org/team membership — whichever your GitHub setup uses), then clones the repo(s) themselves and resolves credentials with **their own** API keys/AWS creds, not yours. Nobody should be handing over a file containing live secrets — the whole point of the `.env` pattern below is that each person's secrets stay local to their own machine and are never committed or transmitted.

Two things are covered:

1. **Base config** — clone `qdrant-memory-mcp`, resolve `agent/`'s config with the recipient's own credentials, import into Zoo Code.
2. **Memory orchestrator layer** — clone `roo-memory`, run its onboarding scripts. Optional.

Skip step 2 if the recipient only wants Zoo Code with your custom modes and their own credentials; do it only if they also want the cross-project semantic memory / "second brain" system.

`manifests/mcp_settings.json` and `manifests/roo-code-settings.json` in `roo-memory` previously had live credentials committed in plaintext. They're now untracked and gitignored, with sanitized `.example.json` templates committed instead — see Step 2 for details. The old values are confirmed dead but still sit in git history prior to the cleanup commit; history hasn't been rewritten to purge them, so don't treat "no longer tracked" as equivalent to "erased."

---

## Prerequisites

- GitHub access to both repos (recipient needs to be added as a collaborator, or equivalent, before `git clone` will work — these are private repos, not public)
- Git installed locally
- VS Code
- Zoo Code installed (confirmed extension id: `zoocodeorganization.zoo-code`, verified via `code --list-extensions` and its global storage directory name on this machine)
- Node.js + npm (for `dotenv`, `config-loader.js`, `validate-env-vars.js` — only needed for step 1)
- Python 3 (only needed for step 2 sync scripts)
- Docker (only if you plan to use Drupal/Puppeteer/Atlassian MCP servers)

---

## Step 1: Base Config (`agent/`) — clone, then resolve with your own credentials

### Step 1.1 — Clone the repo

```bash
git clone https://github.com/dschmidtadv/qdrant-memory-mcp.git
cd qdrant-memory-mcp/agent
```

This requires GitHub collaborator access to the repo (it's private) — get that added before attempting the clone.

The relevant files under `agent/` are:

| File | Purpose |
|---|---|
| `roo-code-settings.json` | Custom modes, provider profiles, global instructions (contains `${VAR}` placeholders, not resolved credentials) |
| `.env.example` | Template listing every environment variable the config references |
| `config-loader.js` | Loads `.env` and substitutes `${VAR}` placeholders at read time |
| `validate-env-vars.js` | Confirms all placeholders resolved and required vars are set |
| `setup-env.sh` | Interactive script that copies `.env.example` → `.env` and checks `dotenv` is installed |
| `rules-*/` | Per-mode instruction files (architect, code, git-ops, sre, aws-engineer, devops-engineer, documentation-writer, drupal-builder, orchestrator, security-review) |
| `skills/` | Skill definitions (AWS, Jira, Drupal SSM, MCP builder, etc.) |
| `commands/` | Custom slash-command definitions |

### Step 1.2 — Create and fill in `.env` (recipient's own credentials)

Still inside `agent/`:

```bash
./setup-env.sh
```

Or manually:

```bash
cp .env.example .env
```

Then edit `.env` with the recipient's **own** real values, not yours — this is a fresh `.env`, never committed to the repo (confirmed gitignored: `agent/.env` is covered by both the top-level `.gitignore` and `agent/.gitignore`). Variables referenced in `.env.example` include AWS credentials for Bedrock (`AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `AWS_REGION`, `AWS_PROFILE`), `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, LiteLLM proxy settings (`LITELLM_BASE_URL`, `LITELLM_API_KEY`), a RIVA-hosted LiteLLM endpoint, local OpenAI-compatible endpoint vars, an Anthropic base URL override, and Bedrock custom inference-profile ARNs. Not every variable is required — only fill in what the modes/providers they actually plan to use need.

`setup-env.sh` will refuse to proceed if `.env`/`.env.local` aren't in `.gitignore` — they already are in this repo, so this should pass without intervention.

### Step 1.3 — Install `dotenv` and validate

```bash
npm install dotenv
node validate-env-vars.js
```

This should report zero unresolved variables. If you see `${VAR}` still in the output, `config-loader.js` isn't being invoked, or `.env` is missing/misnamed — see the Troubleshooting section below.

### Step 1.4 — Generate the resolved settings file and import into Zoo Code

The cloned `agent/roo-code-settings.json` still has `${VAR}` placeholders — it's a template, not a ready-to-import file. Resolve it and write the output somewhere outside version control:

```bash
node config-loader.js > /tmp/roo-code-settings-resolved.json
```

Then in Zoo Code:

1. Open Zoo Code.
2. Click **Import Settings** (the same button used in the official Roo→Zoo migration flow — no Roo Code install is required to use it).
3. Select `/tmp/roo-code-settings-resolved.json`.

Zoo Code imports the file and merges the settings into the recipient's setup. Delete the resolved file afterward since it now contains their credentials in plaintext (`agent/roo-code-settings-resolved.json` is also gitignored in this repo if they'd rather write it there than to `/tmp`).

Zoo Code's own settings file, once imported, lives at `~/Library/Application Support/Code/User/globalStorage/zoocodeorganization.zoo-code/settings/roo-code-settings.json` (confirmed extension id `zoocodeorganization.zoo-code`) — useful to know if you need to inspect or re-import it directly rather than through the UI.

### Step 1.5 — Custom modes and rules

The `rules-<mode>/` directories under `agent/` hold per-mode instructions (forbidden actions, required initialization steps, markdown conventions, etc.). These correspond to the `customModes` entries in `roo-code-settings.json`. The settings import in Step 1.4 carries the `customModes` definitions themselves, but it does **not** carry these `rules-*/` files — they're a separate convention, not part of Roo Code's/Zoo Code's own settings schema. Since the recipient already has the whole repo cloned, they already have these files locally at `agent/rules-*/` — this step is just pointing out they exist and correspond to the imported modes, not an extra transfer step.

---

## Step 2: Memory Orchestrator (`dschmidtadv/roo-memory`)

This layer adds a persistent, version-controlled "memory bank" on top of the base extension: a resident context file (`ROO_CODE_CONTEXT.md`), an external vector-search brain (AnythingLLM), and optional LiteLLM caching. Its own README documents the following onboarding steps — I'm reproducing them here as documented, with corrections where its instructions don't match the actual files (see notes below), not independently verified end-to-end.

**Update: the secret-exposure issue is fixed going forward.** `manifests/mcp_settings.json` and `manifests/roo-code-settings.json` are no longer tracked in this repo — both previously held live credentials (AWS keys, Gemini/OpenRouter/OpenAI/LiteLLM API keys, an AnythingLLM API key, a GitHub PAT, and a Basic Auth header) committed in plaintext. They're now gitignored, and sanitized `manifests/*.example.json` templates are committed in their place. The old, now-revoked/dead values are still present in this repo's git history prior to that cleanup commit — they were confirmed dead before this change, so this is hygiene, not an active leak, but history hasn't been rewritten to purge them. If you ever need to grant access to someone before rotating whatever secrets are live in your own local copies of these files, rotate first regardless of history status.

**Extension id — confirmed:** Zoo Code's extension id is `zoocodeorganization.zoo-code` (verified via `code --list-extensions | grep -i zoo` and matching global storage directory name). Every script in this layer still hardcodes the old Roo Code path (`.../globalStorage/rooveterinaryinc.roo-cline/settings/...`) — `consolidateStack.sh`'s `VSCODE_SETTINGS` variable and `harden.sh`'s `SETTINGS_LINK` variable both need updating to `.../globalStorage/zoocodeorganization.zoo-code/settings/...` before running them, otherwise they'll target the wrong (nonexistent, if Roo Code was never installed) location. See Step 2.3 and 2.4 below for exactly which lines to change.

### Step 2.1 — Clone

The repo's own README states its canonical home is `~/Documents/Roo_Memory` (its scripts also hardcode this path — see `harden.sh` below), so clone to that path rather than wherever's convenient:

```bash
git clone https://github.com/dschmidtadv/roo-memory.git ~/Documents/Roo_Memory
```

This is a separate private repo from `qdrant-memory-mcp` — the recipient needs GitHub collaborator access granted on this one too, independent of access to the base config repo.

### Step 2.2 — Create real settings files from the committed examples

The clone only contains `manifests/mcp_settings.example.json` and `manifests/roo-code-settings.example.json` — the real `manifests/mcp_settings.json` and `manifests/roo-code-settings.json` are gitignored and were never committed. Create them from the examples and fill in the recipient's own credentials:

```bash
cd ~/Documents/Roo_Memory
cp manifests/mcp_settings.example.json manifests/mcp_settings.json
cp manifests/roo-code-settings.example.json manifests/roo-code-settings.json
```

Then edit both files, replacing every `YOUR_*` placeholder (AWS keys, Gemini/OpenRouter/OpenAI/LiteLLM API keys, the AnythingLLM API key, a GitHub PAT, and a Basic Auth header for the `drupal-http` entry) with real values. `consolidateStack.sh` in the next step won't find anything to migrate if these files don't exist yet.

### Step 2.3 — Consolidate the stack

**Note on script names:** the repo's README refers to `consolidate_stack.sh` and `harden_paths.sh`, but the actual files in `scripts/` are named `consolidateStack.sh` and `harden.sh`. Use the real filenames:

```bash
cd ~/Documents/Roo_Memory
./scripts/consolidateStack.sh --dry-run   # preview first
./scripts/consolidateStack.sh             # then run for real
```

This script:
- Creates `manifests/`, `services/`, `templates/`, `secrets/` under the Roo_Memory root
- Looks for an existing `roo-code-settings.json` in `~/Downloads` or in VS Code's global storage and migrates it into `manifests/`
- Backs up any existing JSON configs in VS Code's global storage to a `pre_portable_backup/` folder
- Symlinks `manifests/roo-code-settings.json` and `manifests/mcp_settings.json` back into VS Code's global storage path so the extension reads from the version-controlled copy

Since Step 2.2 already created and filled in both files locally, this step should find them without needing anything in `~/Downloads`.

### Step 2.4 — Harden paths

```bash
bash scripts/harden.sh
source ~/.zshrc
```

This adds `ROO_MEMORY_ROOT` and `AI_ORCHESTRATOR_HOME` environment variables to `.zshrc`, re-links the VS Code settings symlink if it points anywhere other than the hardened path, and creates a placeholder `ROO_CODE_CONTEXT.md` in the current project directory if one doesn't already exist (this is explicitly meant to avoid OneDrive-synced paths interfering with the setup).

### Step 2.5 — Wire up AnythingLLM (external semantic brain)

`manifests/mcp_settings.json` defines an `anythingllm` MCP server entry pointing at `http://localhost:3001`, plus a `drupal` entry (via `docker exec` into a `drupal11` container) and a `chrome-devtools` entry — the recipient needs their own AnythingLLM instance running locally at that port (or an updated URL if theirs runs elsewhere), and their own Drupal/Docker setup if they use that entry, with the `ANYTHING_LLM_API_KEY` they filled in during Step 2.2.

They'll need a workspace created per project slug. The README describes a 4-step per-project onboarding flow: generate "golden files" (`GOLDEN_ARCHITECTURE.md`, `GOLDEN_TECH_STACK.md`, `GOLDEN_BACKEND.md`, `GOLDEN_IMPLEMENTATION_PLAN.md`) via a discovery prompt template, bundle them into `ROO_CODE_CONTEXT.md` via `scripts/generate_roo_code_context.py`, create a matching AnythingLLM workspace, and sync via `scripts/sync_direct_lancedb.py --workspace <project-slug>`.

### Step 2.6 — Optional: LiteLLM caching

If using Bedrock models through LiteLLM, `services/litellm_config.yaml` (referenced by the README, not confirmed present under that exact path in the current checkout) is where `cache_control_injection_points` gets set for the system role, to enable prompt caching on `ROO_CODE_CONTEXT.md`.

---

## Troubleshooting (Step 1)

| Symptom | Fix |
|---|---|
| Config still shows `${VAR}` literally | `config-loader.js` isn't being invoked — confirm your integration calls it rather than reading `roo-code-settings.json` directly |
| `Cannot find module 'dotenv'` | `npm install dotenv` inside `agent/` |
| Env var not resolving | Check `agent/.env` exists, the var isn't commented out, and matches the exact name in `.env.example` |
| Extension still shows stale config after edits | Fully restart VS Code — the settings file is not hot-reloaded |

## Terminal / clipboard hardening (optional but recommended)

The `roo-memory` README also documents a safety measure worth carrying over regardless of which step you adopt: stripping invisible Unicode (zero-width characters, U+200B/U+200C/U+200D/U+FEFF) from terminal input, since these can hide in text copied from AI output and break or obscure shell commands. It suggests an `accept-line` sanitizer in `.zshrc` plus a `cleanclip` helper for sanitizing clipboard content before pasting into a terminal. Neither script was found under those names in the local checkout this guide was written from — if you want this, you'd need to write it, not copy it from an existing file.
