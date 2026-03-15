# Prengine

Prengine is an automated bug-fixing platform. Users submit bug reports (with text, images, and video), and an AI coding agent analyzes the issue, fixes the code, runs tests, and creates GitHub pull requests.

## Authentication

Set the `PRENGINE_TOKEN` environment variable to your Bearer token. This token is required for write operations (creating jobs, follow-ups, uploads). Read-only endpoints work without a token.

All authenticated requests must include the header:
```
Authorization: Bearer <PRENGINE_TOKEN>
```

The token is validated against the Orca auth service. If missing or invalid, write endpoints return HTTP 401.

**Endpoints requiring auth:** POST /api/jobs, POST /api/jobs/:id/followup, POST /api/upload
**Public endpoints (no auth):** GET /api/jobs, GET /api/jobs/:id, GET /api/jobs/:id/runs, GET /api/repos

## API Reference

Base URL: `https://prengine.distark.com`

All endpoints accept and return JSON. Use the built-in HTTP tools or curl to interact. For write operations, include the `Authorization: Bearer <PRENGINE_TOKEN>` header.

### Create a Job

**POST /api/jobs** (requires `Authorization: Bearer <PRENGINE_TOKEN>`)

Submit a new bug report for automated fixing.

```json
{
  "title": "Button click does nothing on settings page",
  "summary": "When clicking the Save button on /settings, nothing happens. Expected: form submits and shows success message.",
  "attachments": [],
  "selected_repos": ["org/repo-name"],
  "enrich": true,
  "source_project": "zeroclaw"
}
```

Fields:
- `title` (required): Short description of the bug
- `summary` (required): Detailed bug report with steps to reproduce, expected vs actual behavior
- `attachments` (optional): Array of attachment objects `{url, filename, mime_type}` from the upload endpoint
- `selected_repos` (optional): Array of repo names to target. If omitted, Prengine auto-routes using LLM
- `enrich` (optional): If `true`, Prengine uses an LLM to restructure the bug report into a standardized format
- `source_project` (optional): Name of the source application

Response: Job object with `id`, `status: "queued"`, and other fields.

### List Jobs

**GET /api/jobs**

Returns all jobs ordered by creation date (newest first).

### Get Job Details

**GET /api/jobs/:id**

Returns full job details including `status`, `pr_url`, `pr_urls`, `diff_summary`, `failure_reason`, `enriched_summary`.

### Update a Job

**PATCH /api/jobs/:id**

```json
{
  "status": "processing",
  "pr_url": "https://github.com/org/repo/pull/42",
  "diff_summary": "Fixed null check in handler",
  "failure_reason": null
}
```

### Submit Follow-up

**POST /api/jobs/:id/followup** (requires `Authorization: Bearer <PRENGINE_TOKEN>`)

Send additional instructions after the initial fix attempt. Creates a new run on the same branch.

```json
{
  "prompt": "The fix looks close but you missed the edge case when the input is empty. Please also add a unit test."
}
```

### Get Job Runs

**GET /api/jobs/:id/runs**

Returns all runs for a job. Each run has:
- `run_number`: Sequential (1 = initial, 2+ = follow-ups)
- `status`: pending, running_agent, testing, creating_pr, completed, failed
- `logs`: Agent output (last 50K chars)
- `test_status`: passed, failed, skipped, command_not_found
- `test_output`: Test runner output
- `pr_url`, `pr_urls`: Pull request links
- `diff_summary`: Summary of changes
- `branch_name`, `commit_sha`: Git reference
- `duration_seconds`: Time taken

### Stream Job Events (SSE)

**GET /api/jobs/:id/events**

Server-sent events stream for real-time status updates. Events are JSON with:
```json
{
  "job_id": 123,
  "job_status": "processing",
  "run_id": 456,
  "run_status": "running_agent",
  "run_number": 1,
  "pr_url": null,
  "updated_at": "2026-03-15T10:30:00Z"
}
```

### Upload File

**POST /api/upload** (requires `Authorization: Bearer <PRENGINE_TOKEN>`)

Multipart form upload. Field name: `file`. Returns:
```json
{
  "url": "https://tmpfiles.org/dl/...",
  "filename": "screenshot.png",
  "mime_type": "image/png",
  "size": 12345
}
```

### List Repos

**GET /api/repos**

Returns configured repositories available for targeting.

## Job Lifecycle

1. **queued** - Job created, waiting for worker pickup
2. **processing** - Agent is analyzing the bug and writing a fix
3. **testing** - Running automated tests on the fix
4. **pr_submitted** - Pull request(s) created successfully
5. **failed** - Something went wrong (check `failure_reason`)

## Workflows

### Submit a Bug Report

1. Identify the bug clearly: what happens vs what should happen
2. Create a job with a descriptive title and detailed summary
3. Optionally set `enrich: true` for LLM-powered report structuring
4. Optionally specify `selected_repos` if you know which repos are affected
5. Monitor via events endpoint or poll job status

### Follow Up on a Fix

1. Get the job details and review the PR
2. If changes are needed, submit a follow-up with specific instructions
3. The agent will make additional changes on the same branch
4. A new run is created with incremented run_number

### Monitor Job Progress

1. Use the SSE events endpoint for real-time updates
2. Or poll GET /api/jobs/:id periodically
3. Check run logs for agent output details
4. Review test_status and test_output for test results

### Attach Screenshots or Videos

1. Upload file via POST /api/upload
2. Include the returned URL in the job's attachments array
3. Video attachments are automatically analyzed using Gemini vision

## Tips

- Write clear, specific bug reports with reproduction steps for best results
- Enable `enrich: true` for vague or informal bug descriptions
- Video attachments of screen recordings dramatically improve fix accuracy
- Follow-up prompts should reference specific issues with the current fix
- Multiple repos can be targeted in a single job for cross-repo bugs
