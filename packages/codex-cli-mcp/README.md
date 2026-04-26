# Codex CLI MCP server

Dry-run-first MCP wrapper for the local `codex` CLI.

Copy `codex-mcp.config.example.json` to `codex-mcp.config.json`, set `allowedRoots`, then run:

```bash
npm run build
node dist/index.js
```

Tools: `codex_status`, `codex_config`, `codex_validate`, `codex_review`, `codex_task`.
