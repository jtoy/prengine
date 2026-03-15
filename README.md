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

## TODO

* support for our context to be loaded
* where else can and should local llm like ollama be used to make the system work better, give ideas
* store total input/output tokens so we can figure out how to reduce costs
* zeroclaw skill support
* verify prs for multiple projects if needed
