import { DEFAULT_BASE_URL, PROVIDER_NAME } from "../constants.js";
import { commandExists, normalizeBaseUrl, readJsonFile, writeText } from "../fsutil.js";
import { continueConfigPath } from "../paths.js";
import type { AgentAdapter, AgentStatus, ApplyOptions, ApplyResult, ResetResult } from "../types.js";

async function installed(homeDir?: string) {
  return commandExists("continue", [continueConfigPath(homeDir)]);
}

function isOctafy(model: any) {
  return Boolean(model && /octafy/i.test(String(model.apiBase ?? "")));
}

export const continueAdapter: AgentAdapter = {
  id: "continue",
  name: "Continue",
  description: "Continue (~/.continue/config.json)",

  async status(opts = {}): Promise<AgentStatus> {
    const configPath = continueConfigPath(opts.homeDir);
    const config = await readJsonFile(configPath);
    const models = Array.isArray(config?.models) ? config.models : [];
    const model = models.find(isOctafy);
    return {
      id: "continue",
      name: this.name,
      installed: await installed(opts.homeDir),
      configured: Boolean(model),
      configPath: config ? configPath : null,
      message: model ? "pointed at Octafy" : "Continue config not set to Octafy",
      details: { baseURL: model?.apiBase ?? null, model: model?.model ?? null },
    };
  },

  async apply(opts: ApplyOptions): Promise<ApplyResult> {
    if (!opts.model) return { id: this.id, name: this.name, success: false, message: "A model is required." };
    const configPath = continueConfigPath(opts.homeDir);
    const config = (await readJsonFile(configPath)) ?? {};
    if (!Array.isArray(config.models)) config.models = [];
    const next = {
      title: PROVIDER_NAME,
      provider: "openai",
      model: opts.model,
      apiBase: normalizeBaseUrl(opts.baseUrl || DEFAULT_BASE_URL),
      apiKey: opts.apiKey,
    };
    config.models = config.models.filter((model: any) => !isOctafy(model));
    config.models.unshift(next);

    if (opts.dryRun) {
      return { id: this.id, name: this.name, success: true, dryRun: true, configPath, message: `would write ${configPath}` };
    }
    const result = await writeText(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    return {
      id: this.id,
      name: this.name,
      success: true,
      configPath,
      backupPath: result.backupPath,
      message: `${PROVIDER_NAME} applied to Continue`,
    };
  },

  async reset(opts = {}): Promise<ResetResult> {
    const configPath = continueConfigPath(opts.homeDir);
    const config = await readJsonFile(configPath);
    if (!config || !Array.isArray(config.models)) return { id: this.id, name: this.name, success: true, message: "no Continue config" };
    const before = config.models.length;
    config.models = config.models.filter((model: any) => !isOctafy(model));
    if (!opts.dryRun && config.models.length !== before) {
      await writeText(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    }
    return { id: this.id, name: this.name, success: true, message: "Octafy settings cleared from Continue" };
  },
};
