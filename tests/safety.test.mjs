import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateClaudeInvocation, SAFE_DEFAULTS as CLAUDE_DEFAULTS } from "../packages/claude-cli-mcp/dist/index.js";
import { validateCodexInvocation, SAFE_DEFAULTS as CODEX_DEFAULTS } from "../packages/codex-cli-mcp/dist/index.js";
import { redactSecrets } from "../packages/shared/dist/index.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "safe-agent-root-"));
  const outside = await mkdtemp(path.join(tmpdir(), "safe-agent-outside-"));
  const link = path.join(root, "escape-link");
  await symlink(outside, link);
  return { root, outside, link };
}

test("Claude validation is dry-run by default", async () => {
  const { root } = await fixture();
  const result = await validateClaudeInvocation({
    cwd: root,
    prompt: "review this",
    kind: "review",
    dryRun: undefined,
    timeoutSeconds: undefined,
    model: undefined,
    fallbackModel: undefined,
    effort: undefined,
    systemPrompt: undefined,
    appendSystemPrompt: undefined,
    maxOutputChars: undefined,
    env: undefined,
    config: { ...CLAUDE_DEFAULTS, allowedRoots: [root], allowedModels: ["sonnet"] },
    claudeBin: "claude"
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.command, "claude");
  assert.match(result.args.join(" "), /--print/);
});

test("realpath allowlist rejects symlink escape", async () => {
  const { root, link } = await fixture();
  await assert.rejects(
    validateClaudeInvocation({
      cwd: link,
      prompt: "review this",
      kind: "review",
      dryRun: true,
      timeoutSeconds: undefined,
      model: undefined,
      fallbackModel: undefined,
      effort: undefined,
      systemPrompt: undefined,
      appendSystemPrompt: undefined,
      maxOutputChars: undefined,
      env: undefined,
      config: { ...CLAUDE_DEFAULTS, allowedRoots: [root] },
      claudeBin: "claude"
    }),
    /outside the configured allowlist/
  );
});

test("bad Claude model is rejected when allowedModels is set", async () => {
  const { root } = await fixture();
  await assert.rejects(
    validateClaudeInvocation({
      cwd: root,
      prompt: "review this",
      kind: "review",
      dryRun: true,
      timeoutSeconds: undefined,
      model: "not-a-model",
      fallbackModel: undefined,
      effort: undefined,
      systemPrompt: undefined,
      appendSystemPrompt: undefined,
      maxOutputChars: undefined,
      env: undefined,
      config: { ...CLAUDE_DEFAULTS, allowedRoots: [root], allowedModels: ["sonnet"] },
      claudeBin: "claude"
    }),
    /not in allowedModels/
  );
});

test("Codex task validation preserves write gate default", async () => {
  const { root } = await fixture();
  const result = await validateCodexInvocation({
    cwd: root,
    prompt: "make a change",
    kind: "task",
    model: undefined,
    sandbox: undefined,
    approvalPolicy: undefined,
    timeoutSeconds: undefined,
    maxOutputChars: undefined,
    subcommand: undefined,
    dryRun: false,
    allowWrites: undefined,
    allowDangerFullAccess: undefined,
    configOverrides: undefined,
    config: { ...CODEX_DEFAULTS, allowedRoots: [root] },
    codexBin: "codex"
  });
  assert.equal(result.dryRun, false);
  assert.equal(result.allowWrites, false);
  assert.equal(result.sandbox, "workspace-write");
});

test("Codex rejects unknown model", async () => {
  const { root } = await fixture();
  await assert.rejects(
    validateCodexInvocation({
      cwd: root,
      prompt: "review this",
      kind: "review",
      model: "bogus-model",
      sandbox: undefined,
      approvalPolicy: undefined,
      timeoutSeconds: undefined,
      maxOutputChars: undefined,
      subcommand: undefined,
      dryRun: true,
      allowWrites: undefined,
      allowDangerFullAccess: undefined,
      configOverrides: undefined,
      config: { ...CODEX_DEFAULTS, allowedRoots: [root], allowedModels: ["gpt-5.5"] },
      codexBin: "codex"
    }),
    /not in allowedModels/
  );
});

test("redaction masks common token patterns and optional emails", () => {
  const bearer = "Bearer " + "abcdefghijklmnop";
  const openAiKey = "sk-" + "123456789012345678901";
  const githubKey = "ghp_" + "123456789012345678901234";
  const email = "user" + "@" + "example.invalid";
  const input = `${bearer} ${openAiKey} ${githubKey} API_KEY=secret ${email}`;
  const redacted = redactSecrets(input, { redactTokens: true, redactEmails: true });
  assert.equal(redacted.includes("secret"), false);
  assert.match(redacted, /Bearer \[REDACTED\]/);
  assert.match(redacted, /\[EMAIL_REDACTED\]/);
});
