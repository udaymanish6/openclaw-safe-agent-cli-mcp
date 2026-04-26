# Publishing Safe Agent CLI MCP

This note is a publishing runbook for `safe-agent-cli-mcp`. It covers two separate public surfaces:

1. A public GitHub repository for the source code.
2. A ClawHub listing/package for OpenClaw users.

Do not run the publish commands until the repository owner has approved the final owner, repo URL, package metadata, and release version.

## Current project status

Observed local shape:

- Root npm workspace: `safe-agent-cli-mcp`, version `0.1.0`, `private: true`.
- Packages:
  - `@safe-agent-cli-mcp/claude-cli-mcp`, version `0.1.0`, `private: false`.
  - `@safe-agent-cli-mcp/codex-cli-mcp`, version `0.1.0`, `private: false`.
  - `@safe-agent-cli-mcp/shared`, version `0.1.0`, `private: true`.
- OpenClaw bundle files:
  - `.claude-plugin/plugin.json`
  - `.mcp.json`
- Extra native metadata file:
  - `plugin/openclaw.plugin.json`
- License: MIT.
- The directory currently has `node_modules/` and `packages/*/dist/` generated locally. They are ignored by `.gitignore` and should not be committed.
- The root package is intentionally `private: true`, which is good for avoiding accidental monorepo publication to npm.

Classification: this repo is a general source repo plus an OpenClaw bundle/plugin package. It is not a ClawHub skill folder because it does not contain a root `SKILL.md`.

## Prerequisites

### Ownership decisions

Pick the public owner before publishing anything:

- Personal account option: `udaymanish6/safe-agent-cli-mcp`.
- Organization option: create or use an org if this should look project-owned rather than person-owned.

Recommendation: use `safe-agent-cli-mcp` as the repo name. It matches the npm workspace, plugin id, README, and ClawHub package name.

### GitHub repository metadata

Suggested description:

> Dry-run-first MCP servers for local Claude and Codex CLIs with cwd allowlists and no shell spawning.

Suggested topics:

- `mcp`
- `model-context-protocol`
- `claude`
- `codex`
- `openclaw`
- `agent-tools`
- `typescript`
- `safety`
- `dry-run`

### License

The source repo already has an MIT license. Keep it.

If publishing as a ClawHub skill later, ClawHub docs say published skills are released under MIT-0 on ClawHub, regardless of the source repo license. That is one reason not to publish this repo as a skill unless a small `SKILL.md` wrapper is created intentionally.

### Authentication

GitHub:

```bash
gh auth status
```

ClawHub:

```bash
clawhub login
clawhub whoami
```

Observed local `clawhub whoami` returned `udaymanish6`, so local ClawHub auth exists as of this check.

npm:

Npm auth is only needed if the two npm packages are published to npm. GitHub and ClawHub package listing do not require npm publication by themselves.

```bash
npm whoami
```

## Public GitHub repo steps

These steps assume the repo is not already initialized. If `git status` reports an existing repository, skip `git init` and inspect remotes first.

```bash
cd /path/to/safe-agent-cli-mcp

git init
git branch -M main

git status --short

git add .
git commit -m "Initial public release"
```

Create the GitHub repo with `gh`:

```bash
gh repo create udaymanish6/safe-agent-cli-mcp \
  --public \
  --description "Dry-run-first MCP servers for local Claude and Codex CLIs with cwd allowlists and no shell spawning." \
  --source . \
  --remote origin \
  --push
```

Alternative website path:

1. Create a new public repo named `safe-agent-cli-mcp` on GitHub.
2. Do not initialize it with a README, license, or `.gitignore`, because this repo already has them.
3. Push locally:

```bash
git remote add origin <ssh-or-https-github-url>
git push -u origin main
```

HTTPS example:

```bash
git remote add origin https://github.com/udaymanish6/safe-agent-cli-mcp.git
git push -u origin main
```

After the first push, update README placeholders from `your-org` to the real owner:

- CI badge URL.
- Clone URL.

Then commit and push that cleanup.

## Release and tag steps

For the first public release:

```bash
git status --short
npm run typecheck
npm run build
npm test
npm run validate:plugin

git tag -a v0.1.0 -m "v0.1.0"
git push origin main --tags
```

Optional GitHub release:

```bash
gh release create v0.1.0 \
  --title "Safe Agent CLI MCP v0.1.0" \
  --notes-file CHANGELOG.md
```

## ClawHub publish options

ClawHub has two relevant publish paths:

### 1. Skill publishing

Local CLI help shows:

```bash
clawhub publish <path> --slug <slug> --name <name> --version <semver> --changelog <text> --tags <tags>
```

Equivalent documented command:

```bash
clawhub publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

ClawHub docs define a skill as a folder containing `SKILL.md` or `skill.md`, with optional text-based supporting files. Slugs must match `^[a-z0-9][a-z0-9-]*$`. Each publish creates a semver version and tags such as `latest` point to versions.

This repo is not currently a skill. Do not publish the whole repo with `clawhub publish .`, because it lacks `SKILL.md` and the skill license terms are MIT-0.

If a skill wrapper is desired later, create a small subfolder such as `clawhub-skill/safe-agent-cli-mcp/SKILL.md` that points users to the GitHub repo and documents local install steps. That wrapper would be a separate artifact from the code plugin package.

### 2. OpenClaw package publishing

ClawHub's current docs say the native package catalog supports code plugins and bundle plugins. The CLI namespace is `clawhub package`.

Local CLI help, version `0.9.0`, shows this exact command format:

```bash
clawhub package publish <path> \
  --family <code-plugin|bundle-plugin> \
  --name <name> \
  --display-name <name> \
  --version <version> \
  --changelog <text> \
  --tags <tags> \
  --bundle-format <format> \
  --host-targets <targets> \
  --source-repo <repo> \
  --source-commit <sha> \
  --source-ref <ref> \
  --source-path <path>
```

ClawHub docs say package publishing reads metadata from `package.json`, `openclaw.plugin.json`, and `openclaw.bundle.json`. For GitHub sources, source attribution can be auto-populated from the repo, commit, ref, and subpath. For local folders, source attribution can be detected from local git if the origin remote points at GitHub.

Important version mismatch: ClawHub docs mention `clawhub package publish` accepts GitHub repo sources and has `--dry-run` / `--json`; local `clawhub package publish --help` did not show those flags and says the argument is a folder path. Upgrade `clawhub` before relying on `--dry-run`, or use only the flags shown by local help.

Recommended ClawHub path for this repo: publish as a `bundle-plugin`, not as a skill. The bundle files are the root `.claude-plugin/plugin.json` plus `.mcp.json`.

Potential metadata gap: docs mention `openclaw.plugin.json` and `openclaw.bundle.json` at publish detection points. This repo has `plugin/openclaw.plugin.json`, not a root `openclaw.plugin.json` or `openclaw.bundle.json`. Before publishing, verify whether ClawHub can detect the `.claude-plugin` bundle directly. If not, add a documented root bundle manifest or move/copy metadata to the expected path in a separate approved change.

## Suggested ClawHub metadata

Package name / slug:

```text
safe-agent-cli-mcp
```

Display name:

```text
Safe Agent CLI MCP
```

Version:

```text
0.1.0
```

Changelog:

```text
Initial public release: dry-run-first Claude and Codex CLI MCP servers, OpenClaw bundle metadata, safety docs, tests, and CI.
```

Tags:

```text
latest,mcp,claude,codex,safety,openclaw
```

Family:

```text
bundle-plugin
```

Bundle format and host targets need confirmation against the ClawHub package schema or a dry-run from a newer CLI. Based on the local files, likely intent is a Claude-compatible bundle for OpenClaw, but do not guess these fields during a real publish.

## How the ClawHub website listing is created or updated

Based on ClawHub docs:

- `clawhub package publish` uploads package metadata and source attribution to the `/packages` API.
- The ClawHub website has a native OpenClaw package catalog for code plugins and bundle plugins.
- A successful publish should create or update the package listing on ClawHub.
- Each new publish should create a new package version and update the `latest` tag if `latest` is included.

Verify after publishing:

```bash
clawhub package inspect safe-agent-cli-mcp
clawhub package explore safe-agent-cli-mcp
```

Then check the ClawHub website package catalog manually and confirm:

- Name and display name.
- Version.
- Changelog.
- Source repo link.
- Family is `bundle-plugin`.
- README or rendered details are accurate.

## Update and new version flow

1. Change code or docs.
2. Update package versions and `CHANGELOG.md`.
3. Run validation.
4. Commit and push.
5. Tag a release.
6. Publish the new ClawHub package version with the new semver and changelog.
7. Verify with `clawhub package inspect` and website checks.

For skills, ClawHub supports soft delete and restore:

```bash
clawhub delete <slug>
clawhub undelete <slug>
```

For skills, owner rename keeps redirects:

```bash
clawhub skill rename <old-slug> <new-slug>
```

For packages, local docs reviewed here did not expose a package unpublish command. Treat package publish as sticky. If a package publish is wrong, publish a fixed version and ask ClawHub maintainers about moderation/removal if needed.

## Preflight checklist

Run before GitHub release and before ClawHub publish:

```bash
cd /path/to/safe-agent-cli-mcp
npm install
npm run typecheck
npm run build
npm test
npm run validate:plugin
```

Secret and private data scan:

```bash
PRIVATE_PATH_RE='/Users/'"miya"
rg -n --hidden --glob '!node_modules/**' --glob '!package-lock.json' "${PRIVATE_PATH_RE}|[0-9]{17,20}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(TOKEN|SECRET|API_KEY|PASSWORD)\s*=" .
```

Generated file check:

```bash
git status --short
git check-ignore node_modules packages/claude-cli-mcp/dist packages/codex-cli-mcp/dist packages/shared/dist
```

README link check:

- Replace `https://github.com/your-org/safe-agent-cli-mcp` with the real repo owner before public release.
- Confirm `assets/hero.svg`, `assets/terminal-demo.svg`, and `assets/architecture.svg` render on GitHub.
- Confirm all relative docs links resolve.

## Risk caveats to keep in public docs

- Keep the no-affiliation statement. This project is independent and not affiliated with Anthropic, OpenAI, OpenClaw, or the Model Context Protocol project.
- Use careful trademark wording: say it wraps local Claude CLI and Codex CLI installations, not that it is official Claude, Codex, Anthropic, or OpenAI software.
- Do not oversell the security model. This is a wrapper with dry-run defaults, cwd allowlists, no shell spawning, write gates, output caps, and best-effort redaction. It is not a sandbox or DLP system.
- Keep dry-run defaults visible in README and examples.
- Keep `allowedRoots` empty by default.
- Do not commit real local config files, personal paths, emails, Discord IDs, API keys, or tokens.

## Exact commands, DO NOT RUN until approved

These are intentionally grouped here for final approval. Review and adjust owner, repo URL, and package metadata first.

```bash
# DO NOT RUN until approved: initialize and publish GitHub repo
cd /path/to/safe-agent-cli-mcp
git init
git branch -M main
git add .
git commit -m "Initial public release"
gh repo create udaymanish6/safe-agent-cli-mcp \
  --public \
  --description "Dry-run-first MCP servers for local Claude and Codex CLIs with cwd allowlists and no shell spawning." \
  --source . \
  --remote origin \
  --push
```

```bash
# DO NOT RUN until approved: tag GitHub release
cd /path/to/safe-agent-cli-mcp
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --tags
gh release create v0.1.0 \
  --title "Safe Agent CLI MCP v0.1.0" \
  --notes-file CHANGELOG.md
```

```bash
# DO NOT RUN until approved: ClawHub package publish, local CLI 0.9.0 syntax
cd /path/to/safe-agent-cli-mcp
clawhub package publish . \
  --family bundle-plugin \
  --name safe-agent-cli-mcp \
  --display-name "Safe Agent CLI MCP" \
  --version 0.1.0 \
  --changelog "Initial public release: dry-run-first Claude and Codex CLI MCP servers, OpenClaw bundle metadata, safety docs, tests, and CI." \
  --tags latest,mcp,claude,codex,safety,openclaw \
  --source-repo udaymanish6/safe-agent-cli-mcp \
  --source-ref v0.1.0 \
  --source-path .
```

```bash
# DO NOT RUN until approved: ClawHub skill publish only if a SKILL.md wrapper folder is created later
clawhub publish ./clawhub-skill/safe-agent-cli-mcp \
  --slug safe-agent-cli-mcp \
  --name "Safe Agent CLI MCP" \
  --version 0.1.0 \
  --changelog "Initial skill wrapper for Safe Agent CLI MCP." \
  --tags latest,mcp,claude,codex,safety,openclaw
```
