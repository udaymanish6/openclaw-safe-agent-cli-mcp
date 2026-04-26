import { spawn } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export type ContentResponse = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
export type AllowRoot = { configured: string; realPath: string };
export type SpawnResult = {
  command: string;
  args: string[];
  cwd?: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};
export type RedactionConfig = { redactEmails?: boolean; redactTokens?: boolean };

export function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : fallback;
}

export function numberProp(obj: Record<string, unknown>, key: string, fallback: number): number {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export function jsonResponse(value: unknown, isError = false): ContentResponse {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError };
}

export function redactSecrets(input: string, options: RedactionConfig = { redactTokens: true }): string {
  let output = input;
  if (options.redactTokens !== false) {
    output = output
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "sk-[REDACTED]")
      .replace(/\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, "sk-ant-[REDACTED]")
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "gh_[REDACTED]")
      .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "github_pat_[REDACTED]")
      .replace(/\b[A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)\s*=\s*[^\s]+/gi, (match) => match.replace(/=.*/, "=[REDACTED]"));
  }
  if (options.redactEmails) {
    output = output.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]");
  }
  return output;
}

export function appendLimited(chunks: Buffer[], chunk: Buffer, limit: number): boolean {
  const existing = chunks.reduce((sum, item) => sum + item.byteLength, 0);
  const remaining = limit - existing;
  if (remaining <= 0) return true;
  if (chunk.byteLength <= remaining) {
    chunks.push(chunk);
    return false;
  }
  chunks.push(chunk.subarray(0, remaining));
  return true;
}

export function outputFromChunks(chunks: Buffer[], redaction: RedactionConfig): string {
  return redactSecrets(Buffer.concat(chunks).toString("utf8"), redaction);
}

export function normalizeMaxOutput(value: unknown, defaults: { defaultMaxChars: number; maxChars: number }): number {
  if (value === undefined || value === null) return defaults.defaultMaxChars;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("maxOutputChars must be a finite number");
  return Math.min(Math.max(1024, Math.floor(value)), defaults.maxChars);
}

export function normalizedTimeout(value: unknown, fallback: number, maxSeconds: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("timeoutSeconds must be a finite number");
  return Math.min(Math.max(1, Math.floor(value)), maxSeconds);
}

export function requiredPrompt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("prompt must be a non-empty string");
  return value;
}

export function booleanDefault(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error("boolean input has invalid type");
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

export async function resolveAllowedCwd(cwdInput: unknown, configuredRoots: string[]): Promise<{ cwd: string; roots: AllowRoot[] }> {
  if (typeof cwdInput !== "string" || cwdInput.trim().length === 0) throw new Error("cwd must be a non-empty string");
  if (configuredRoots.length === 0) throw new Error("allowedRoots is empty; configure at least one allowed project root before running tools");
  const roots: AllowRoot[] = [];
  for (const configured of configuredRoots) roots.push({ configured, realPath: await realpath(configured) });
  const cwd = await realpath(cwdInput);
  if (!roots.some((root) => isWithinRoot(cwd, root.realPath))) throw new Error(`cwd is outside the configured allowlist: ${cwd}`);
  return { cwd, roots };
}

export function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function runCommand(command: string, args: string[], options: { cwd?: string; timeoutSeconds: number; maxOutputChars: number; env?: NodeJS.ProcessEnv; redaction?: RedactionConfig }): Promise<SpawnResult> {
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const limit = options.maxOutputChars;
  const redaction = options.redaction ?? { redactTokens: true };
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;
  let closed = false;
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
    });
    const killChild = (signal: NodeJS.Signals) => {
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // fall through
        }
      }
      child.kill(signal);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killChild("SIGTERM");
      setTimeout(() => {
        if (!closed) killChild("SIGKILL");
      }, 2_000).unref();
    }, options.timeoutSeconds * 1000);
    child.stdout.on("data", (chunk: Buffer) => { stdoutTruncated = appendLimited(stdoutChunks, chunk, limit) || stdoutTruncated; });
    child.stderr.on("data", (chunk: Buffer) => { stderrTruncated = appendLimited(stderrChunks, chunk, limit) || stderrTruncated; });
    child.on("error", (error) => {
      closed = true;
      clearTimeout(timer);
      resolve({ command, args, cwd: options.cwd, exitCode: null, signal: null, timedOut, stdout: outputFromChunks(stdoutChunks, redaction), stderr: redactSecrets(error.message, redaction), stdoutTruncated, stderrTruncated });
    });
    child.on("close", (exitCode, signal) => {
      closed = true;
      clearTimeout(timer);
      resolve({ command, args, cwd: options.cwd, exitCode, signal, timedOut, stdout: outputFromChunks(stdoutChunks, redaction), stderr: outputFromChunks(stderrChunks, redaction), stdoutTruncated, stderrTruncated });
    });
  });
}
