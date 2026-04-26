# OpenClaw plugin packaging

This directory documents the OpenClaw packaging layer for Safe Agent CLI MCP.

## Status

OpenClaw has two relevant local formats:

- `openclaw.plugin.json` for native OpenClaw extension metadata.
- Claude-compatible bundle files, detected from `.claude-plugin/plugin.json`, with MCP servers loaded from `.mcp.json`.

For this repo, the supported integration path is the Claude-compatible bundle at the repository root. That format is the best fit because Safe Agent CLI MCP already exposes stdio MCP servers, and OpenClaw's bundle loader can register MCP servers from `.mcp.json` without writing to the live OpenClaw config.

`plugin/openclaw.plugin.json` is included as metadata only. Treat it as experimental until OpenClaw documents a native plugin manifest field for MCP server registration outside the bundle loader.

## What gets registered

The root `.mcp.json` registers two local stdio MCP servers:

- `safe-claude`, backed by `packages/claude-cli-mcp/dist/index.js`.
- `safe-codex`, backed by `packages/codex-cli-mcp/dist/index.js`.

The server configs keep safe defaults in code: dry-run is the default tool behavior, write tools require an explicit `allowWrites` gate, and `allowedRoots` defaults to an empty list unless the operator creates local config files.

## Safe setup notes

1. Build before registering, because the MCP bundle points at `dist/index.js` files.
2. Keep `allowedRoots` empty until you intentionally add project paths in ignored local config files.
3. Do not put secrets, personal paths, or workspace-specific IDs in committed plugin files.
4. Do not edit `~/.openclaw/openclaw.json` by hand. Use OpenClaw CLI commands when you choose to register locally.

This project is independent and is not affiliated with Anthropic, OpenAI, OpenClaw, or the Model Context Protocol project.
