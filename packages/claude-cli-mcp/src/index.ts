#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import packageJson from "../package.json" with { type: "json" };
import { booleanDefault, jsonResponse, normalizeMaxOutput, normalizedTimeout, numberProp, objectOrEmpty, optionalString, pathExists, redactSecrets, requiredPrompt, resolveAllowedCwd, runCommand, stringArray, type ContentResponse } from "@safe-agent-cli-mcp/shared";

const SERVER_NAME = "claude-cli-mcp-server";
const SERVER_VERSION = packageJson.version;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SAFE_DEFAULTS = {
  allowedRoots: [] as string[],
  timeouts: { reviewDefaultSeconds: 300, taskDefaultSeconds: 900, maxSeconds: 1200 },
  output: { defaultMaxChars: 256 * 1024, maxChars: 512 * 1024 },
  defaultModel: "sonnet",
  defaultFallbackModel: undefined as string | undefined,
  allowedModels: [] as string[],
  allowedEfforts: ["low", "medium", "high", "xhigh", "max"],
  claudeBin: undefined as string | undefined,
  reviewPermissionMode: "default",
  taskPermissionMode: "default",
  redactEmails: false,
  redactTokens: true,
  envPassthroughAllowlist: [] as string[],
};
export type ServerConfig = typeof SAFE_DEFAULTS;
type ValidationOptions = { prompt?: string; cwd: unknown; timeoutSeconds: unknown; dryRun: unknown; model: unknown; fallbackModel: unknown; effort: unknown; systemPrompt: unknown; appendSystemPrompt: unknown; maxOutputChars: unknown; env: unknown; allowWrites?: unknown; kind: "review" | "task"; config?: ServerConfig; claudeBin?: string };
let config: ServerConfig = SAFE_DEFAULTS;
let resolvedClaudeBin = "claude";

async function discoverClaudeBin(configured?: string): Promise<string> {
  const candidates = [configured, process.env.CLAUDE_BIN, ...String(process.env.PATH ?? "").split(path.delimiter).map((dir) => path.join(dir, "claude"))].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  return "claude";
}

async function loadConfig(): Promise<ServerConfig> {
  const candidates = [path.join(PROJECT_ROOT, "claude-mcp.config.json"), path.join(PROJECT_ROOT, "config", "default.json")];
  let raw: Record<string, unknown> = {};
  for (const file of candidates) if (await pathExists(file)) { raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>; break; }
  const timeouts = objectOrEmpty(raw.timeouts);
  const output = objectOrEmpty(raw.output);
  const loaded: ServerConfig = {
    allowedRoots: stringArray(raw.allowedRoots, SAFE_DEFAULTS.allowedRoots),
    timeouts: { reviewDefaultSeconds: numberProp(timeouts, "reviewDefaultSeconds", SAFE_DEFAULTS.timeouts.reviewDefaultSeconds), taskDefaultSeconds: numberProp(timeouts, "taskDefaultSeconds", SAFE_DEFAULTS.timeouts.taskDefaultSeconds), maxSeconds: numberProp(timeouts, "maxSeconds", SAFE_DEFAULTS.timeouts.maxSeconds) },
    output: { defaultMaxChars: numberProp(output, "defaultMaxChars", SAFE_DEFAULTS.output.defaultMaxChars), maxChars: numberProp(output, "maxChars", SAFE_DEFAULTS.output.maxChars) },
    defaultModel: typeof raw.defaultModel === "string" ? raw.defaultModel : SAFE_DEFAULTS.defaultModel,
    defaultFallbackModel: typeof raw.defaultFallbackModel === "string" ? raw.defaultFallbackModel : SAFE_DEFAULTS.defaultFallbackModel,
    allowedModels: stringArray(raw.allowedModels, SAFE_DEFAULTS.allowedModels),
    allowedEfforts: stringArray(raw.allowedEfforts, SAFE_DEFAULTS.allowedEfforts),
    claudeBin: typeof raw.claudeBin === "string" && raw.claudeBin.trim() ? raw.claudeBin : undefined,
    reviewPermissionMode: typeof raw.reviewPermissionMode === "string" ? raw.reviewPermissionMode : SAFE_DEFAULTS.reviewPermissionMode,
    taskPermissionMode: typeof raw.taskPermissionMode === "string" ? raw.taskPermissionMode : SAFE_DEFAULTS.taskPermissionMode,
    redactEmails: typeof raw.redactEmails === "boolean" ? raw.redactEmails : SAFE_DEFAULTS.redactEmails,
    redactTokens: typeof raw.redactTokens === "boolean" ? raw.redactTokens : SAFE_DEFAULTS.redactTokens,
    envPassthroughAllowlist: stringArray(raw.envPassthroughAllowlist, SAFE_DEFAULTS.envPassthroughAllowlist),
  };
  loaded.timeouts.maxSeconds = Math.max(1, loaded.timeouts.maxSeconds);
  loaded.timeouts.reviewDefaultSeconds = Math.min(loaded.timeouts.reviewDefaultSeconds, loaded.timeouts.maxSeconds);
  loaded.timeouts.taskDefaultSeconds = Math.min(loaded.timeouts.taskDefaultSeconds, loaded.timeouts.maxSeconds);
  loaded.output.maxChars = Math.max(1024, loaded.output.maxChars);
  loaded.output.defaultMaxChars = Math.min(Math.max(1024, loaded.output.defaultMaxChars), loaded.output.maxChars);
  return loaded;
}

function buildEnv(extraEnv: unknown, activeConfig = config): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const requested = objectOrEmpty(extraEnv);
  const allowed = new Set(activeConfig.envPassthroughAllowlist);
  for (const [key, value] of Object.entries(requested)) {
    if (!allowed.has(key)) throw new Error(`env key is not allowed: ${key}`);
    if (typeof value !== "string") throw new Error(`env value must be a string: ${key}`);
    env[key] = value;
  }
  return env;
}

function validateModel(value: unknown, field: string, fallback: string | undefined, activeConfig: ServerConfig): string | undefined {
  const model = optionalString(value, field) ?? fallback;
  if (model && activeConfig.allowedModels.length > 0 && !activeConfig.allowedModels.includes(model)) throw new Error(`${field} is not in allowedModels: ${model}`);
  return model;
}
function validateEffort(value: unknown, activeConfig: ServerConfig): string | undefined {
  const effort = optionalString(value, "effort");
  if (effort && !activeConfig.allowedEfforts.includes(effort)) throw new Error(`effort is not allowed: ${effort}`);
  return effort;
}
function reviewGuard(prompt: string): string {
  return ["You are running through a local MCP read-only review wrapper.", "Do not run shell commands. Do not edit, create, delete, move, or write files. Use only read-oriented inspection.", "If the task appears to require commands or file edits, stop and explain what would be needed instead.", "User prompt:", prompt].join("\n\n");
}
function buildClaudeArgs(kind: "review" | "task", prompt: string, opts: { model?: string; fallbackModel?: string; effort?: string; systemPrompt?: string; appendSystemPrompt?: string }, activeConfig = config): string[] {
  const args: string[] = ["--permission-mode", kind === "review" ? activeConfig.reviewPermissionMode : activeConfig.taskPermissionMode];
  if (kind === "review") args.push("--disallowedTools", "Bash,Edit,Write,NotebookEdit");
  if (opts.model) args.push("--model", opts.model);
  if (opts.fallbackModel) args.push("--fallback-model", opts.fallbackModel);
  if (opts.effort) args.push("--effort", opts.effort);
  if (opts.systemPrompt) args.push("--system-prompt", opts.systemPrompt);
  if (opts.appendSystemPrompt) args.push("--append-system-prompt", opts.appendSystemPrompt);
  args.push("--print", kind === "review" ? reviewGuard(prompt) : prompt);
  return args;
}
export async function validateClaudeInvocation(options: ValidationOptions) {
  const activeConfig = options.config ?? config;
  const prompt = options.prompt ?? (options.kind === "review" ? "Review this project without editing files." : "Perform the requested task.");
  const { cwd, roots } = await resolveAllowedCwd(options.cwd, activeConfig.allowedRoots);
  const timeoutSeconds = normalizedTimeout(options.timeoutSeconds, options.kind === "review" ? activeConfig.timeouts.reviewDefaultSeconds : activeConfig.timeouts.taskDefaultSeconds, activeConfig.timeouts.maxSeconds);
  const maxOutputChars = normalizeMaxOutput(options.maxOutputChars, activeConfig.output);
  const dryRun = booleanDefault(options.dryRun, true);
  const allowWrites = options.kind === "task" ? booleanDefault(options.allowWrites, false) : false;
  const model = validateModel(options.model, "model", activeConfig.defaultModel, activeConfig);
  const fallbackModel = validateModel(options.fallbackModel, "fallbackModel", activeConfig.defaultFallbackModel, activeConfig);
  const effort = validateEffort(options.effort, activeConfig);
  const systemPrompt = optionalString(options.systemPrompt, "systemPrompt");
  const appendSystemPrompt = optionalString(options.appendSystemPrompt, "appendSystemPrompt");
  buildEnv(options.env, activeConfig);
  const command = options.claudeBin ?? resolvedClaudeBin;
  const args = buildClaudeArgs(options.kind, prompt, { model, fallbackModel, effort, systemPrompt, appendSystemPrompt }, activeConfig);
  return { command, args, cwd, timeoutSeconds, maxOutputChars, dryRun, allowWrites, model, fallbackModel, effort, systemPrompt: Boolean(systemPrompt), appendSystemPrompt: Boolean(appendSystemPrompt), envKeys: Object.keys(objectOrEmpty(options.env)), allowlist: roots };
}

const commonProperties = { prompt: { type: "string", minLength: 1 }, cwd: { type: "string", minLength: 1 }, timeoutSeconds: { type: "number", minimum: 1 }, dryRun: { type: "boolean", default: true }, model: { type: "string" }, fallbackModel: { type: "string" }, effort: { type: "string" }, systemPrompt: { type: "string" }, appendSystemPrompt: { type: "string" }, maxOutputChars: { type: "number", minimum: 1024 }, env: { type: "object", additionalProperties: { type: "string" } } };
const tools: Tool[] = [
  { name: "claude_status", description: "Check whether the configured local claude CLI is available. Only runs claude --version.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "claude_config", description: "Return sanitized loaded config, resolved allowlist, detected Claude path, and version.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "claude_validate", description: "Validate cwd/model/effort/timeout/dryRun/write flags and return would-run argv without execution.", inputSchema: { type: "object", properties: { ...commonProperties, kind: { type: "string", enum: ["review", "task"], default: "review" }, allowWrites: { type: "boolean" } }, required: ["cwd"], additionalProperties: false } },
  { name: "claude_review", description: "Dry-run-first read/review Claude CLI wrapper. Real execution uses spawn, no shell, read-only guard text, and disallowed write/shell tools.", inputSchema: { type: "object", properties: commonProperties, required: ["prompt", "cwd"], additionalProperties: false } },
  { name: "claude_task", description: "Dry-run-first write-capable Claude CLI wrapper. Refuses real execution unless allowWrites is true.", inputSchema: { type: "object", properties: { ...commonProperties, allowWrites: { type: "boolean" } }, required: ["prompt", "cwd"], additionalProperties: false } }
];
async function claudeVersion(): Promise<string | null> { const result = await runCommand(resolvedClaudeBin, ["--version"], { timeoutSeconds: 15, maxOutputChars: 8192, redaction: config }); return result.exitCode === 0 ? (result.stdout.trim() || result.stderr.trim() || null) : null; }
async function handleStatus(): Promise<ContentResponse> { const result = await runCommand(resolvedClaudeBin, ["--version"], { timeoutSeconds: 15, maxOutputChars: 8192, redaction: config }); return jsonResponse({ server: { name: SERVER_NAME, version: SERVER_VERSION }, claude: { path: resolvedClaudeBin, available: result.exitCode === 0, version: result.exitCode === 0 ? result.stdout.trim() || result.stderr.trim() || null : null, check: result }, allowedRoots: config.allowedRoots }); }
async function handleConfig(): Promise<ContentResponse> { return jsonResponse({ server: { name: SERVER_NAME, version: SERVER_VERSION }, config: { ...config, claudeBin: config.claudeBin ?? "auto-discover" }, claude: { path: resolvedClaudeBin, version: await claudeVersion() } }); }
async function handleValidate(args: Record<string, unknown>): Promise<ContentResponse> { const kind = args.kind === "task" ? "task" : "review"; return jsonResponse({ valid: true, ...(await validateClaudeInvocation({ prompt: optionalString(args.prompt, "prompt"), cwd: args.cwd, timeoutSeconds: args.timeoutSeconds, dryRun: args.dryRun, model: args.model, fallbackModel: args.fallbackModel, effort: args.effort, systemPrompt: args.systemPrompt, appendSystemPrompt: args.appendSystemPrompt, maxOutputChars: args.maxOutputChars, env: args.env, allowWrites: args.allowWrites, kind })) }); }
async function handleClaudeReview(args: Record<string, unknown>): Promise<ContentResponse> { const prompt = requiredPrompt(args.prompt); const validation = await validateClaudeInvocation({ prompt, cwd: args.cwd, timeoutSeconds: args.timeoutSeconds, dryRun: args.dryRun, model: args.model, fallbackModel: args.fallbackModel, effort: args.effort, systemPrompt: args.systemPrompt, appendSystemPrompt: args.appendSystemPrompt, maxOutputChars: args.maxOutputChars, env: args.env, kind: "review" }); if (validation.dryRun) return jsonResponse(validation); const result = await runCommand(validation.command, validation.args, { cwd: validation.cwd, timeoutSeconds: validation.timeoutSeconds, maxOutputChars: validation.maxOutputChars, env: buildEnv(args.env), redaction: config }); return jsonResponse({ dryRun: false, result }); }
async function handleClaudeTask(args: Record<string, unknown>): Promise<ContentResponse> { const prompt = requiredPrompt(args.prompt); const validation = await validateClaudeInvocation({ prompt, cwd: args.cwd, timeoutSeconds: args.timeoutSeconds, dryRun: args.dryRun, model: args.model, fallbackModel: args.fallbackModel, effort: args.effort, systemPrompt: args.systemPrompt, appendSystemPrompt: args.appendSystemPrompt, maxOutputChars: args.maxOutputChars, env: args.env, allowWrites: args.allowWrites, kind: "task" }); if (!validation.dryRun && !validation.allowWrites) return jsonResponse({ error: "claude_task refuses real execution unless allowWrites is true" }, true); if (validation.dryRun) return jsonResponse(validation); const result = await runCommand(validation.command, validation.args, { cwd: validation.cwd, timeoutSeconds: validation.timeoutSeconds, maxOutputChars: validation.maxOutputChars, env: buildEnv(args.env), redaction: config }); return jsonResponse({ dryRun: false, allowWrites: validation.allowWrites, result }); }

async function main(): Promise<void> {
  config = await loadConfig();
  resolvedClaudeBin = await discoverClaudeBin(config.claudeBin);
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      if (name === "claude_status") return await handleStatus();
      if (name === "claude_config") return await handleConfig();
      if (name === "claude_validate") return await handleValidate(args);
      if (name === "claude_review") return await handleClaudeReview(args);
      if (name === "claude_task") return await handleClaudeTask(args);
      return jsonResponse({ error: `Unknown tool: ${name}` }, true);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, true);
    }
  });
  await server.connect(new StdioServerTransport());
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(redactSecrets(error instanceof Error ? error.stack ?? error.message : String(error), config)); process.exit(1); });
