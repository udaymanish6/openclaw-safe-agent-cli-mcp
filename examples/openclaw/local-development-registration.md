# Local development registration

Build first:

```bash
npm install
npm run build
npm run validate:plugin
```

Then, from the repository root, inspect the package files and register the local bundle with OpenClaw when you are ready:

```bash
openclaw plugins install --link .
openclaw plugins enable safe-agent-cli-mcp
openclaw plugins inspect safe-agent-cli-mcp --json
```

Notes:

- `--link` keeps OpenClaw pointed at your working tree during development.
- The bundle uses `.claude-plugin/plugin.json` and `.mcp.json`.
- Registration is a manual local action. This repo does not modify `~/.openclaw/openclaw.json` itself.
