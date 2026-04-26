# Security model

Safe Agent CLI MCP narrows how an MCP client can call local agent CLIs. It is not a sandbox, DLP product, or permission system for the whole computer.

## Guarantees this project aims to provide

- No generic shell tool is exposed.
- CLI processes are spawned with `spawn(command, args)`, not shell command strings.
- Tool calls default to `dryRun: true` and return the exact command preview.
- `cwd` must resolve inside configured `allowedRoots` using real paths, which blocks common symlink escapes.
- Write-capable task tools refuse real execution unless `allowWrites: true` is present.
- Dangerous Codex full access requires both config and per-call opt-in.
- Common token patterns are redacted from stdout and stderr on a best-effort basis.

## Non-goals and caveats

- The wrapper does not prove complete read confinement. Codex `read-only` is primarily a write-prevention control.
- Claude permission modes are delegated to the Claude CLI. `bypassPermissions` is intentionally not the default.
- Redaction is best effort. Do not send secrets in prompts or rely on output filtering as a DLP layer.
- The downstream CLIs can change behavior across versions. Pin and test versions for regulated environments.
- These servers are designed for local stdio use, not internet exposure.

## Recommended defaults

- Keep `allowedRoots` as narrow as practical.
- Keep `dryRun: true` in automated flows until a human or higher-level policy approves execution.
- Use read-only review tools for untrusted prompts.
- Use task tools only for trusted local projects.
- Keep `allowDangerFullAccess` false unless you have a very specific local reason.
