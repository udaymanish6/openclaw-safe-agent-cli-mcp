# Dry-run verification

After building and registering the bundle locally, verify without executing Claude or Codex work:

1. Confirm OpenClaw sees the plugin:

```bash
openclaw plugins inspect safe-agent-cli-mcp --json
```

2. Confirm the MCP servers are discoverable through OpenClaw's plugin/bundle path. Tool names are expected to be namespaced by server, for example `safe-claude__claude_review` and `safe-codex__codex_review`.

3. Call a review tool with `dryRun: true` and a `cwd` under a configured local `allowedRoots` entry. The expected result is a command preview, not real execution.

Example tool payload shape:

```json
{
  "cwd": "/path/to/your/project",
  "prompt": "Review the current diff for obvious bugs.",
  "dryRun": true
}
```

If `allowedRoots` is still empty, the server should reject the request before it reaches the local CLI. That is the safe default.
