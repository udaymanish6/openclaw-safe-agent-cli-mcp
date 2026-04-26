# mcporter examples

List tools after starting either stdio server through your MCP client or mcporter profile:

```bash
mcporter tools safe-codex
mcporter tools safe-claude
```

Validate without execution:

```bash
mcporter call safe-codex codex_validate '{"cwd":"/path/to/your/project","prompt":"Review this code","dryRun":true}'
mcporter call safe-claude claude_validate '{"cwd":"/path/to/your/project","prompt":"Review this code","dryRun":true}'
```

Run only after reviewing the returned command preview and local config.
