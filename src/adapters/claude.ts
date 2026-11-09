import { DEFAULT_BASE_URL, PROVIDER_NAME } from "../constants.js";
import { commandExists, readJsonFile, writeText } from "../fsutil.js";
import { claudeSettingsPath } from "../paths.js";
import type { AgentAdapter, AgentStatus, ApplyOptions, ApplyResult, ResetResult } from "../types.js";

const KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
];

function anthropicBaseUrl(value: string) {
  return value.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
}

function isOctafy(settings: any) {
  return /octafy/i.test(String(settings?.env?.ANTHROPIC_BASE_URL ?? ""));
}

export const claudeAdapter: AgentAdapter = {
  id: "claude",
  name: "Claude Code",
  description: "Claude Code (~/.claude/settings.json)",

  async status(opts = {}): Promise<AgentStatus> {
    const configPath = claudeSettingsPath(opts.homeDir);
    const settings = await readJsonFile(configPath);
    return {
      id: "claude",
      name: this.name,
      installed: await commandExists("claude", [configPath]),
      configured: isOctafy(settings),
      configPath: settings ? configPath : null,
      message: isOctafy(settings) ? "pointed at Octafy" : "Claude Code not set to Octafy",
      details: {
        baseURL: settings?.env?.ANTHROPIC_BASE_URL ?? null,
        model: settings?.env?.ANTHROPIC_MODEL ?? null,
      },
    };
  },

  async apply(opts: ApplyOptions): Promise<ApplyResult> {
    if (!opts.model) return { id: this.id, name: this.name, success: false, message: "A model is required." };
    const configPath = claudeSettingsPath(opts.homeDir);
    const settings = (await readJsonFile(configPath)) ?? {};
    settings.env = settings.env ?? {};
    settings.env.ANTHROPIC_BASE_URL = anthropicBaseUrl(opts.baseUrl || DEFAULT_BASE_URL);
    settings.env.ANTHROPIC_AUTH_TOKEN = opts.apiKey;
    settings.env.ANTHROPIC_MODEL = opts.model;
    for (const key of [
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "ANTHROPIC_DEFAULT_FABLE_MODEL",
    ]) {
      settings.env[key] = opts.model;
    }

    if (opts.dryRun) {
      return { id: this.id, name: this.name, success: true, dryRun: true, configPath, message: `would write ${configPath}` };
    }
    const result = await writeText(configPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    return {
      id: this.id,
      name: this.name,
      success: true,
      configPath,
      backupPath: result.backupPath,
      message: `${PROVIDER_NAME} applied to Claude Code`,
    };
  },

  async reset(opts = {}): Promise<ResetResult> {
    const configPath = claudeSettingsPath(opts.homeDir);
    const settings = await readJsonFile(configPath);
    if (!settings || !isOctafy(settings)) return { id: this.id, name: this.name, success: true, message: "no Octafy config on Claude Code" };
    for (const key of KEYS) delete settings.env?.[key];
    if (settings.env && Object.keys(settings.env).length === 0) delete settings.env;
    if (!opts.dryRun) await writeText(configPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    return { id: this.id, name: this.name, success: true, message: "Octafy settings cleared from Claude Code" };
  },
};
