import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WriteResult = { backupPath?: string };

export async function readText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function parseJsonLoose(text: string): unknown {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
}

export async function readJsonFile(filePath: string): Promise<Record<string, any> | null> {
  const text = await readText(filePath);
  if (text == null) return null;
  try {
    const parsed = parseJsonLoose(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : null;
  } catch {
    return null;
  }
}

export async function writeText(
  filePath: string,
  content: string,
  opts: { backup?: boolean; mode?: number; dryRun?: boolean } = {},
): Promise<WriteResult> {
  if (opts.dryRun) return {};
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let backupPath: string | undefined;
  if (opts.backup !== false) {
    const existing = await readText(filePath);
    if (existing != null) {
      backupPath = `${filePath}.octafy-backup`;
      await fs.writeFile(backupPath, existing, { encoding: "utf8", mode: 0o600 });
    }
  }
  await fs.writeFile(filePath, content, { encoding: "utf8", mode: opts.mode ?? 0o600 });
  return { backupPath };
}

export function normalizeBaseUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, "");
  if (!url.endsWith("/v1")) url = `${url}/v1`;
  return url;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function commandExists(bin: string, fallbackPaths: string[] = []): Promise<boolean> {
  const cmd = process.platform === "win32" ? "where" : "which";
  const env = { ...process.env };
  if (process.platform === "win32" && process.env.APPDATA) {
    env.PATH = `${process.env.APPDATA}\\npm;${env.PATH ?? ""}`;
  }
  try {
    await execFileAsync(cmd, [bin], { env, windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    for (const file of fallbackPaths) {
      if (await fileExists(file)) return true;
    }
    return false;
  }
}

export function upsertEnvVar(text: string, key: string, value: string): string {
  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  const line = `${key}=${value}`;
  if (re.test(text)) return text.replace(re, line);
  if (!text) return `${line}\n`;
  return `${text}${text.endsWith("\n") ? "" : "\n"}${line}\n`;
}

export function removeEnvVar(text: string, key: string): string {
  return text.replace(new RegExp(`^${escapeRegExp(key)}=.*\\r?\\n?`, "m"), "");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function tomlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function tomlGetString(toml: string, key: string): string | null {
  const match = toml.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, "m"));
  return match ? match[1] : null;
}

export function tomlHasTable(toml: string, section: string): boolean {
  return new RegExp(`^\\[${escapeRegExp(section)}\\]`, "m").test(toml);
}

export function upsertTomlString(toml: string, key: string, value: string): string {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*$`, "m");
  const line = `${key} = ${tomlQuote(value)}`;
  if (re.test(toml)) return toml.replace(re, line);
  const tableIndex = toml.search(/^\[/m);
  if (tableIndex >= 0) {
    const before = toml.slice(0, tableIndex).replace(/\s*$/, "\n");
    return `${before}${line}\n\n${toml.slice(tableIndex)}`;
  }
  return `${toml}${toml && !toml.endsWith("\n") ? "\n" : ""}${line}\n`;
}

export function upsertTomlTable(toml: string, section: string, fields: Record<string, string>): string {
  const header = `[${section}]`;
  const body = Object.entries(fields).map(([key, value]) => `${key} = ${tomlQuote(value)}`).join("\n");
  const block = `${header}\n${body}\n`;
  const re = new RegExp(`^\\[${escapeRegExp(section)}\\][^\\[]*(?=^\\[|$)`, "ms");
  if (re.test(toml)) return toml.replace(re, `${block}\n`);
  return `${toml}${toml && !toml.endsWith("\n") ? "\n" : ""}\n${block}`;
}

export function removeTomlKey(toml: string, key: string): string {
  return toml.replace(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*\\r?\\n?`, "m"), "");
}

export function removeTomlTable(toml: string, section: string): string {
  const re = new RegExp(`^\\[${escapeRegExp(section)}\\][^\\[]*(?=^\\[|$)`, "ms");
  return toml.replace(re, "").replace(/\n{3,}/g, "\n\n");
}
