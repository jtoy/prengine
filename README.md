# Prengine

## Embeddable Widget

Add the widget to any app so authenticated users can submit bug reports to Prengine.

### Installation

Add to your HTML `<head>`:

```html
<script
  src="https://prengine.distark.com/widget.js"
  data-project="your_app_name"
  async
></script>
```

### Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `data-project` | Yes | `""` | Source app name (stored as `source_project` on the job) |
| `data-token-key` | No | `"prengine_token"` | localStorage key for the user's orca auth token |
| `data-show` | No | `"always"` | `always`, `on-error`, or `never` |

### Visibility Modes

**`always`** — Floating button appears whenever the auth token exists in localStorage.

**`on-error`** — Hidden until a JS error or unhandled promise rejection occurs. Captures error details (message, stack, source file, page URL) and pre-fills the bug form. Shows a red badge on the button.

**`never`** — Completely disabled.

### Examples

```html
<!-- Always visible (default) -->
<script
  src="https://prengine.distark.com/widget.js"
  data-project="cartoon_maker"
  async
></script>

<!-- Show on JS errors only -->
<script
  src="https://prengine.distark.com/widget.js"
  data-project="orchestrator"
  data-show="on-error"
  async
></script>

<!-- Custom token key (only if your app uses a different localStorage key) -->
<script
  src="https://prengine.distark.com/widget.js"
  data-project="my_app"
  data-token-key="my_custom_token_key"
  async
></script>

<!-- Disabled -->
<script
  src="https://prengine.distark.com/widget.js"
  data-show="never"
  async
></script>
```

---

## Repository Configuration

Repositories are managed in the `repositories` database table — a single source of truth for both the frontend and worker. No need to keep env vars in sync across services.

```sql
-- migrations/007_create_repositories.sql
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  base_branch TEXT NOT NULL DEFAULT 'main',
  description TEXT DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Adding / updating repos

```sql
-- Add a new repo (branches off dev)
INSERT INTO repositories (name, base_branch) VALUES ('jtoy/cartoon_maker', 'dev');

-- Add a repo with default branch (main)
INSERT INTO repositories (name) VALUES ('distark/app');

-- Disable a repo without deleting it
UPDATE repositories SET enabled = false WHERE name = 'old/repo';

-- Change a repo's base branch
UPDATE repositories SET base_branch = 'staging' WHERE name = 'owner/repo';
```

| Column | Description |
|--------|-------------|
| `name` | GitHub `owner/repo` format |
| `base_branch` | Branch that bugfix branches are created from and PRs target (default: `main`) |
| `description` | Optional — used by LLM repo router for intelligent triage |
| `enabled` | Set to `false` to hide without deleting |

---

### Auth Requirement

The host app must store a valid orca auth token in localStorage under the key specified by `data-token-key`:

```js
localStorage.setItem("prengine_token", userToken);
```

### Database Migration

```sql
-- migrations/005_add_source_project.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_project VARCHAR(255);
```

---

## QA Agent Integration

Prengine now includes an intelligent QA agent that automatically analyzes every code change and generates tailored manual testing checklists for each PR.

### Features

- **Risk Assessment**: Automatically classifies changes as LOW/MEDIUM/HIGH/CRITICAL risk
- **Component Analysis**: Maps changes to affected system components (Frontend, Worker, AI Agent, Database, Redis)
- **Context-Aware**: Uses repository-specific technical context for better analysis
- **Tailored Testing**: Generates specific test steps based on actual code changes
- **Configurable**: Can be enabled/disabled via `QA_ENABLED=true/false`

### How It Works

The QA agent runs automatically during the job processing workflow:

1. Bug report → AI processes and fixes code
2. **🤖 QA Agent analyzes changes** ← *NEW STEP*
3. PR created with QA checklist included

### Example Output

```markdown
## 🤖 QA Analysis

**Risk Level:** MEDIUM  
**Components:** AI Agent Logic, Job Processing

### ✅ Manual QA Checklist
**Functional Testing:**
- [ ] AI agent properly processes bug reports without getting stuck
- [ ] Repetition guard prevents infinite loops after 3 identical commands
- [ ] Different commands are attempted to avoid repetition

**Integration Testing:**
- [ ] Full end-to-end workflow (bug report → PR creation)
- [ ] Cross-service communication works correctly
```

See [README_QA_AGENT.md](./README_QA_AGENT.md) for detailed setup and configuration.

---

## Job-Level Branch Selection

Prengine supports flexible Git workflows with job-level branch selection. Choose source and target branches when submitting bug reports.

### Features

- **🎯 Flexible Workflows** - Support for GitFlow, GitHub Flow, and custom strategies
- **🔍 Smart Discovery** - Automatically fetches available branches from repositories  
- **🤖 Intelligent Defaults** - Suggests appropriate strategies based on bug content
- **⚙️ UI Integration** - Simple branch selection in the job submission form

### Examples

```
Hotfix: main → main (fast production fixes)
Feature: develop → develop (new functionality)
Release: release/v2.0 → main (release preparation)
```

**How it works:**
1. Select repositories in job submission form
2. Choose source branch (where to create fix from)  
3. Choose target branch (where PR should merge)
4. Worker creates `bugfix/job-123` from source → PR targets target branch

See [README_BRANCH_SELECTION.md](./README_BRANCH_SELECTION.md) for complete documentation.

---

## Client Error Tracking

Automatically capture JS errors and backend exceptions from your apps. New unique errors can auto-create prengine fix jobs.

### How It Works

1. **Enable** error tracking on a repo via Admin → Repos (toggle "Enable error tracking")
2. **Add the JS snippet** to your app's HTML (shown in the repos table when tracking is on):

```html
<script src="https://prengine.distark.com/client-errors.js" data-p="<project_id>" async></script>
```

The `project_id` is the MD5 hash of the repo name (e.g. `jtoy/cartoon_maker` → `c78f192337dd0ed0b4bb686c51c18a4f`). It's shown in the admin repos UI with a copy button.

3. **Optionally enable auto-fix** — toggle "Auto-create fix jobs" on the repo. New error fingerprints will automatically create prengine jobs and push them to the worker queue.

### Backend Error Reporting

For Ruby/Python/Node backends, POST errors directly:

```bash
curl -X POST https://prengine.distark.com/api/client-errors \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<md5>","type":"backend_error","message":"Something broke","stack":"...","source":"backend"}'
```

See `orchestrator/config/initializers/prengine_errors.rb` for a full Ruby integration example.

### Admin UI

- **Admin → Errors**: Browse all captured errors with filters (repo, source, date)
- **Admin → Repos**: Toggle tracking/auto-fix per repo, copy JS snippet

### Maintenance — Cleanup Cron

Old errors (>90 days since last seen) are purged daily via orchestrator's `whenever` schedule:

```ruby
# orchestrator/config/schedule.rb
every 1.day, at: '3:00 am' do
  command "curl -s -X POST https://prengine.distark.com/api/client-errors/cleanup"
end
```

Or call manually:

```bash
curl -s -X POST https://prengine.distark.com/api/client-errors/cleanup
```

Existing `REDIS_URL` and `DATABASE_URL` are reused for rate limiting and storage.

### Currently Integrated Apps

| App | Repo | Project ID | Frontend | Backend |
|-----|------|-----------|----------|---------|
| Cartoon Maker | `jtoy/cartoon_maker` | `c78f192337dd0ed0b4bb686c51c18a4f` | ✅ | — |
| Orchestrator | `jtoy/distark` | `8cd0eaee3cc2f593962d636362aa0c64` | ✅ | ✅ |

---

## TODO

* support for our context to be loaded
* where else can and should local llm like ollama be used to make the system work better, give ideas
* store total input/output tokens so we can figure out how to reduce costs
* vercel prs appear in db
* verify prs for multiple projects if needed
* smart way to do screenshot or video of the issue
* only submit files that pi/llm actually touched
* video/screenshot works
* verified I can commmit via zeroclaw
* tests work on distark 
* tests work on cartoon_maker
* screenshot vs video proof
* cost/tokens measured
* concurrency testing and validation, all random ports, and tests use  containers or seperate DBs
Saas:
* generic authentication/RBAC endpoint included that can be used
