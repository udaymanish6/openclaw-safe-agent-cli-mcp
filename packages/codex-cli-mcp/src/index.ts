#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import packageJson from "../package.json" with { type: "json" };
import { baseToolProperties, booleanDefault, commandStatus, commandVersion, commonConfigFromRaw, configOverridesProperty, discoverBinary, jsonResponse, loadJsonConfig, normalizeMaxOutput, normalizedTimeout, objectOrEmpty, optionalNonEmptyStringProp, optionalString, redactSecrets, requiredPrompt, resolveAllowedCwd, runCommand, stringArray, stringProp, type ContentResponse } from "@safe-agent-cli-mcp/shared";

const SERVER_NAME = "codex-cli-mcp-server";
const SERVER_VERSION = packageJson.version;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SAFE_DEFAULTS = {
  allowedRoots: [] as string[],
  timeouts: { reviewDefaultSeconds: 300, taskDefaultSeconds: 900, maxSeconds: 1200 },
  output: { defaultMaxChars: 256 * 1024, maxChars: 512 * 1024 },
  defaultModel: "gpt-5.5",
  allowedModels: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2", "codex-auto-review", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5.5-codex", "o3", "o4-mini"],
  allowedSandboxModes: ["read-only", "workspace-write", "danger-full-access"],
  defaultReviewSandbox: "read-only",
  defaultTaskSandbox: "workspace-write",
  allowedApprovalPolicies: ["untrusted", "on-failure", "on-request", "never"],
  defaultApprovalPolicy: "never",
  codexBin: undefined as string | undefined,
  redactEmails: false,
  redactTokens: true,
  allowDangerFullAccess: false,
};
export type ServerConfig = typeof SAFE_DEFAULTS;
type Subcommand = "exec" | "review";
type ValidationOptions = { prompt?: string; cwd: unknown; model: unknown; sandbox: unknown; approvalPolicy: unknown; timeoutSeconds: unknown; maxOutputChars: unknown; subcommand: unknown; dryRun: unknown; allowWrites?: unknown; allowDangerFullAccess?: unknown; configOverrides?: unknown; kind: "review" | "task"; config?: ServerConfig; codexBin?: string };
let config: ServerConfig = SAFE_DEFAULTS;
let resolvedCodexBin = "codex";

async function loadConfig(): Promise<ServerConfig> {
  const raw = await loadJsonConfig(PROJECT_ROOT, ["codex-mcp.config.json", "config/default.json"]);
  const loaded: ServerConfig = {
    ...commonConfigFromRaw(raw, SAFE_DEFAULTS),
    defaultModel: stringProp(raw, "defaultModel", SAFE_DEFAULTS.defaultModel),
    allowedModels: stringArray(raw.allowedModels, SAFE_DEFAULTS.allowedModels),
    allowedSandboxModes: stringArray(raw.allowedSandboxModes, SAFE_DEFAULTS.allowedSandboxModes),
    defaultReviewSandbox: stringProp(raw, "defaultReviewSandbox", SAFE_DEFAULTS.defaultReviewSandbox),
    defaultTaskSandbox: stringProp(raw, "defaultTaskSandbox", SAFE_DEFAULTS.defaultTaskSandbox),
    allowedApprovalPolicies: stringArray(raw.allowedApprovalPolicies, SAFE_DEFAULTS.allowedApprovalPolicies),
    defaultApprovalPolicy: stringProp(raw, "defaultApprovalPolicy", SAFE_DEFAULTS.defaultApprovalPolicy),
    codexBin: optionalNonEmptyStringProp(raw, "codexBin"),
    allowDangerFullAccess: typeof raw.allowDangerFullAccess === "boolean" ? raw.allowDangerFullAccess : SAFE_DEFAULTS.allowDangerFullAccess,
  };
  if (!loaded.allowedSandboxModes.includes(loaded.defaultReviewSandbox)) loaded.defaultReviewSandbox = "read-only";
  if (!loaded.allowedSandboxModes.includes(loaded.defaultTaskSandbox)) loaded.defaultTaskSandbox = "workspace-write";
  if (!loaded.allowedApprovalPolicies.includes(loaded.defaultApprovalPolicy)) loaded.defaultApprovalPolicy = "never";
  return loaded;
}
function validateModel(value: unknown, activeConfig: ServerConfig): string | undefined { const model = optionalString(value, "model") ?? activeConfig.defaultModel; if (model && activeConfig.allowedModels.length > 0 && !activeConfig.allowedModels.includes(model)) throw new Error(`model is not in allowedModels: ${model}`); return model; }
function validateSandbox(value: unknown, fallback: string, activeConfig: ServerConfig): string { const sandbox = optionalString(value, "sandbox") ?? fallback; if (!activeConfig.allowedSandboxModes.includes(sandbox)) throw new Error(`sandbox is not allowed: ${sandbox}`); return sandbox; }
function validateApprovalPolicy(value: unknown, activeConfig: ServerConfig): string { const approval = optionalString(value, "approvalPolicy") ?? activeConfig.defaultApprovalPolicy; if (!activeConfig.allowedApprovalPolicies.includes(approval)) throw new Error(`approvalPolicy is not allowed: ${approval}`); return approval; }
function validateSubcommand(value: unknown, fallback: Subcommand): Subcommand { const subcommand = optionalString(value, "subcommand") ?? fallback; if (subcommand !== "exec" && subcommand !== "review") throw new Error("subcommand must be exec or review"); return subcommand; }
function validateConfigOverrides(value: unknown): Record<string, string | number | boolean> {
  if (value === undefined || value === null) return {};
  const raw = objectOrEmpty(value);
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(raw)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) throw new Error(`configOverrides key is not safe: ${key}`);
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") throw new Error(`configOverrides value must be a safe scalar: ${key}`);
    safe[key] = item;
  }
  return safe;
}
function tomlScalar(value: string | number | boolean): string { return typeof value === "string" ? JSON.stringify(value) : String(value); }
function readOnlyGuard(prompt: string): string { return ["You are running through a local MCP read-only Codex wrapper.", "Do not edit, create, delete, move, or write files. Do not run shell commands unless absolutely necessary for read-only inspection.", "If the task requires writes or unsafe commands, stop and explain what would be needed instead.", "User prompt:", prompt].join("\n\n"); }
function buildCodexArgs(subcommand: Subcommand, prompt: string, opts: { model?: string; sandbox: string; approvalPolicy: string; cwd: string; configOverrides: Record<string, string | number | boolean>; kind: "review" | "task" }): string[] {
  const args: string[] = [];
  if (opts.model) args.push("--model", opts.model);
  args.push("--sandbox", opts.sandbox, "--ask-for-approval", opts.approvalPolicy, "--cd", opts.cwd);
  for (const [key, value] of Object.entries(opts.configOverrides)) args.push("--config", `${key}=${tomlScalar(value)}`);
  if (subcommand === "exec") args.push("exec", "--skip-git-repo-check", "--color", "never", opts.kind === "review" ? readOnlyGuard(prompt) : prompt);
  else args.push("review", opts.kind === "review" ? readOnlyGuard(prompt) : prompt);
  return args;
}
export async function validateCodexInvocation(options: ValidationOptions) {
  const activeConfig = options.config ?? config;
  const { cwd, roots } = await resolveAllowedCwd(options.cwd, activeConfig.allowedRoots);
  const kind = options.kind;
  const timeoutSeconds = normalizedTimeout(options.timeoutSeconds, kind === "review" ? activeConfig.timeouts.reviewDefaultSeconds : activeConfig.timeouts.taskDefaultSeconds, activeConfig.timeouts.maxSeconds);
  const maxOutputChars = normalizeMaxOutput(options.maxOutputChars, activeConfig.output);
  const dryRun = booleanDefault(options.dryRun, true);
  const allowWrites = kind === "task" ? booleanDefault(options.allowWrites, false) : false;
  const allowDangerFullAccess = booleanDefault(options.allowDangerFullAccess, false);
  const model = validateModel(options.model, activeConfig);
  const sandbox = validateSandbox(options.sandbox, kind === "review" ? activeConfig.defaultReviewSandbox : activeConfig.defaultTaskSandbox, activeConfig);
  if (sandbox === "danger-full-access" && (!activeConfig.allowDangerFullAccess || !allowDangerFullAccess)) throw new Error("danger-full-access is refused unless config.allowDangerFullAccess and input allowDangerFullAccess are both true");
  if (kind === "review" && sandbox !== "read-only") throw new Error("codex_review only permits read-only sandbox");
  const approvalPolicy = validateApprovalPolicy(options.approvalPolicy, activeConfig);
  const subcommand = validateSubcommand(options.subcommand, "exec");
  const configOverrides = validateConfigOverrides(options.configOverrides);
  const prompt = options.prompt ?? (kind === "review" ? "Review this project without editing files." : "Perform the requested task.");
  const command = options.codexBin ?? resolvedCodexBin;
  const args = buildCodexArgs(subcommand, prompt, { model, sandbox, approvalPolicy, cwd, configOverrides, kind });
  return { command, args, cwd, timeoutSeconds, maxOutputChars, dryRun, allowWrites, model, sandbox, approvalPolicy, subcommand, configOverrides, allowlist: roots };
}
const commonProperties = { ...baseToolProperties, model: { type: "string" }, sandbox: { type: "string" }, approvalPolicy: { type: "string" }, configOverrides: configOverridesProperty };
const tools: Tool[] = [
  { name: "codex_status", description: "Check configured local codex CLI availability. Only runs codex --version.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "codex_config", description: "Return sanitized loaded config, resolved allowlist, and detected Codex path/version.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "codex_validate", description: "Validate cwd/model/sandbox/approval/timeout/output flags and return exact would-run argv without execution.", inputSchema: { type: "object", properties: { ...commonProperties, subcommand: { type: "string", enum: ["exec", "review"], default: "exec" }, allowWrites: { type: "boolean" }, allowDangerFullAccess: { type: "boolean" } }, required: ["cwd"], additionalProperties: false } },
  { name: "codex_review", description: "Dry-run-first read/review Codex CLI wrapper. Real execution uses codex exec by default with read-only sandbox and guard text.", inputSchema: { type: "object", properties: commonProperties, required: ["prompt", "cwd"], additionalProperties: false } },
  { name: "codex_task", description: "Dry-run-first write-capable Codex CLI wrapper. Refuses real execution unless allowWrites is true.", inputSchema: { type: "object", properties: { ...commonProperties, allowWrites: { type: "boolean" }, allowDangerFullAccess: { type: "boolean" } }, required: ["prompt", "cwd"], additionalProperties: false } }
];
async function handleStatus(): Promise<ContentResponse> { return jsonResponse({ server: { name: SERVER_NAME, version: SERVER_VERSION }, codex: await commandStatus(resolvedCodexBin, config), allowedRoots: config.allowedRoots }); }
async function handleConfig(): Promise<ContentResponse> { return jsonResponse({ server: { name: SERVER_NAME, version: SERVER_VERSION }, config: { ...config, codexBin: config.codexBin ?? "auto-discover" }, codex: { path: resolvedCodexBin, version: await commandVersion(resolvedCodexBin, config) } }); }
async function handleValidate(args: Record<string, unknown>): Promise<ContentResponse> { return jsonResponse({ valid: true, ...(await validateCodexInvocation({ prompt: optionalString(args.prompt, "prompt"), cwd: args.cwd, model: args.model, sandbox: args.sandbox, approvalPolicy: args.approvalPolicy, timeoutSeconds: args.timeoutSeconds, maxOutputChars: args.maxOutputChars, subcommand: args.subcommand, dryRun: args.dryRun, allowWrites: args.allowWrites, allowDangerFullAccess: args.allowDangerFullAccess, configOverrides: args.configOverrides, kind: args.allowWrites === true ? "task" : "review" })) }); }
async function handleCodexReview(args: Record<string, unknown>): Promise<ContentResponse> { const prompt = requiredPrompt(args.prompt); const validation = await validateCodexInvocation({ prompt, cwd: args.cwd, model: args.model, sandbox: args.sandbox, approvalPolicy: args.approvalPolicy, timeoutSeconds: args.timeoutSeconds, maxOutputChars: args.maxOutputChars, subcommand: "exec", dryRun: args.dryRun, configOverrides: args.configOverrides, kind: "review" }); if (validation.dryRun) return jsonResponse(validation); const result = await runCommand(validation.command, validation.args, { cwd: validation.cwd, timeoutSeconds: validation.timeoutSeconds, maxOutputChars: validation.maxOutputChars, redaction: config }); return jsonResponse({ dryRun: false, result }); }
async function handleCodexTask(args: Record<string, unknown>): Promise<ContentResponse> { const prompt = requiredPrompt(args.prompt); const validation = await validateCodexInvocation({ prompt, cwd: args.cwd, model: args.model, sandbox: args.sandbox, approvalPolicy: args.approvalPolicy, timeoutSeconds: args.timeoutSeconds, maxOutputChars: args.maxOutputChars, subcommand: "exec", dryRun: args.dryRun, allowWrites: args.allowWrites, allowDangerFullAccess: args.allowDangerFullAccess, configOverrides: args.configOverrides, kind: "task" }); if (!validation.dryRun && !validation.allowWrites) return jsonResponse({ error: "codex_task refuses real execution unless allowWrites is true" }, true); if (validation.dryRun) return jsonResponse(validation); const result = await runCommand(validation.command, validation.args, { cwd: validation.cwd, timeoutSeconds: validation.timeoutSeconds, maxOutputChars: validation.maxOutputChars, redaction: config }); return jsonResponse({ dryRun: false, allowWrites: validation.allowWrites, result }); }
async function main(): Promise<void> {
  config = await loadConfig();
  resolvedCodexBin = await discoverBinary("codex", "CODEX_BIN", config.codexBin);
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      if (name === "codex_status") return await handleStatus();
      if (name === "codex_config") return await handleConfig();
      if (name === "codex_validate") return await handleValidate(args);
      if (name === "codex_review") return await handleCodexReview(args);
      if (name === "codex_task") return await handleCodexTask(args);
      return jsonResponse({ error: `Unknown tool: ${name}` }, true);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, true);
    }
  });
  await server.connect(new StdioServerTransport());
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(redactSecrets(error instanceof Error ? error.stack ?? error.message : String(error), config)); process.exit(1); });
