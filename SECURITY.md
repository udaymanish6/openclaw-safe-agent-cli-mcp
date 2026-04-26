# Security policy

## Supported versions

This project is pre-1.0. Security fixes will target the current `main` branch until formal releases exist.

## Reporting a vulnerability

Please open a private security advisory on the repository, or contact the maintainer through the repository's published security contact after the project is published.

Do not include live API keys, tokens, private prompts, or sensitive project files in public issues.

## Scope

In scope:

- Escaping configured `allowedRoots` during wrapper validation.
- Accidental shell execution in wrapper code.
- Write-gate bypasses in wrapper logic.
- Token redaction regressions for documented token patterns.

Out of scope:

- Behavior of the upstream Claude or Codex CLI outside this wrapper.
- Secrets included directly in user prompts.
- Running these stdio servers as publicly reachable network services.
