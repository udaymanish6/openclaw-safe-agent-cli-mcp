# Claude CLI MCP server

Dry-run-first MCP wrapper for the local `claude` CLI.

Copy `claude-mcp.config.example.json` to `claude-mcp.config.json`, set `allowedRoots`, then run:

```bash
npm run build
node dist/index.js
```

Tools: `claude_status`, `claude_config`, `claude_validate`, `claude_review`, `claude_task`.
