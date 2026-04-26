# Comparison

| Option | Strength | Weakness |
|---|---|---|
| Generic shell MCP | Maximum flexibility | Broad blast radius, command injection concerns, hard to review intent |
| Direct CLI use | Simple for humans | Hard for MCP clients to validate and audit |
| Custom one-off scripts | Narrow and understandable | Often brittle, usually missing model/sandbox/config validation |
| Safe Agent CLI MCP | Dry-run first, no shell, allowlisted cwd, agent-specific flags | Still depends on downstream CLI behavior and local config discipline |

Use this project when you want controlled access to Claude or Codex CLI from an MCP client without exposing a general command executor.
