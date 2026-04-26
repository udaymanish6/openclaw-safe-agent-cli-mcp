#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const jsonFiles = [
  ".claude-plugin/plugin.json",
  ".mcp.json",
  "plugin/openclaw.plugin.json",
  "examples/openclaw/mcp-servers.example.json",
  "examples/openclaw/mcp-servers.bundle.example.json",
  "packages/claude-cli-mcp/claude-mcp.config.example.json",
  "packages/codex-cli-mcp/codex-mcp.config.example.json"
];
const failures = [];

async function parseJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: invalid JSON: ${error.message}`);
    return undefined;
  }
}

for (const file of jsonFiles) await parseJson(file);

const bundleManifest = await parseJson(".claude-plugin/plugin.json");
if (bundleManifest) {
  if (bundleManifest.name !== "safe-agent-cli-mcp") failures.push(".claude-plugin/plugin.json: name must stay safe-agent-cli-mcp for stable OpenClaw plugin id");
  if (!Array.isArray(bundleManifest.mcpServers) || !bundleManifest.mcpServers.includes(".mcp.json")) failures.push(".claude-plugin/plugin.json: must reference .mcp.json in mcpServers");
}

const mcpConfig = await parseJson(".mcp.json");
const servers = mcpConfig?.mcpServers ?? {};
for (const name of ["safe-claude", "safe-codex"]) {
  const server = servers[name];
  if (!server) failures.push(`.mcp.json: missing ${name}`);
  if (server && server.command !== "node") failures.push(`.mcp.json: ${name}.command should be node`);
  if (server && !Array.isArray(server.args)) failures.push(`.mcp.json: ${name}.args must be an array`);
  if (server && !String(server.cwd ?? "").includes("${CLAUDE_PLUGIN_ROOT}")) failures.push(`.mcp.json: ${name}.cwd should use the bundle root placeholder`);
}

for (const [file, key] of [
  ["packages/claude-cli-mcp/claude-mcp.config.example.json", "allowedRoots"],
  ["packages/codex-cli-mcp/codex-mcp.config.example.json", "allowedRoots"]
]) {
  const config = await parseJson(file);
  if (config && (!Array.isArray(config[key]) || config[key].some((entry) => typeof entry !== "string"))) failures.push(`${file}: ${key} must be an array of strings`);
}

const blockedDirs = new Set([".git", "node_modules", "dist"]);
const blockedFiles = new Set([
  "claude-mcp.config.json",
  "claude-mcp.config.local.json",
  "codex-mcp.config.json",
  "codex-mcp.config.local.json"
]);
const textExtensions = new Set([".json", ".md", ".ts", ".js", ".mjs", ".yml", ".yaml"]);
const privatePatterns = [
  { name: "personal absolute path", re: /\/Users\/miya\b/i },
  { name: "Discord snowflake", re: /\b\d{17,20}\b/ },
  { name: "email address", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: "common raw token", re: /\b(?:sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ }
];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (blockedDirs.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (!entry.isFile() || blockedFiles.has(entry.name) || !textExtensions.has(path.extname(entry.name))) continue;
    const relative = path.relative(root, absolute);
    const info = await stat(absolute);
    if (info.size > 1024 * 1024) continue;
    const text = await readFile(absolute, "utf8");
    for (const pattern of privatePatterns) {
      if (pattern.re.test(text)) failures.push(`${relative}: contains ${pattern.name}`);
    }
  }
}
await walk(root);

if (failures.length > 0) {
  console.error("OpenClaw plugin validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("OpenClaw plugin validation passed.");
