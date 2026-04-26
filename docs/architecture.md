# Architecture

Safe Agent CLI MCP is a small npm workspace with three packages:

- `packages/shared`: path safety, spawn helpers, output truncation, and redaction.
- `packages/claude-cli-mcp`: MCP stdio server for the local Claude CLI.
- `packages/codex-cli-mcp`: MCP stdio server for the local Codex CLI.

## Request lifecycle

1. MCP client calls a tool over stdio.
2. Server validates inputs and local config.
3. `cwd` and every configured root are resolved with `realpath`.
4. The wrapper builds an argv array for the target CLI.
5. If `dryRun` is true, the argv preview is returned.
6. If execution is allowed, the CLI is spawned without a shell.
7. stdout/stderr are capped and redacted before returning.

## Config lookup

Each server checks, relative to its package directory:

1. `claude-mcp.config.json` or `codex-mcp.config.json`
2. `config/default.json`

Example files are included, but live config files are intentionally ignored by git.
## OpenClaw packaging layer

The repository root is also shaped as an OpenClaw-compatible local bundle:

- `.claude-plugin/plugin.json` declares the bundle metadata and points OpenClaw at `.mcp.json`.
- `.mcp.json` registers the `safe-claude` and `safe-codex` stdio MCP servers using `${CLAUDE_PLUGIN_ROOT}` placeholders.
- `plugin/openclaw.plugin.json` provides best-effort native OpenClaw metadata for the tool surface, but MCP server registration currently relies on the bundle loader path.

The plugin layer does not write live OpenClaw config, does not include personal paths, and does not change runtime safety defaults. Operators still need to build the package and configure local `allowedRoots` before real execution can reach a project directory.
