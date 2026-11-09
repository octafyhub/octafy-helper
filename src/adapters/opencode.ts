import { DEFAULT_BASE_URL, PROVIDER_ID, PROVIDER_NAME } from "../constants.js";
import { commandExists, normalizeBaseUrl, readJsonFile, writeText } from "../fsutil.js";
import { opencodeConfigPath } from "../paths.js";
import type { AgentAdapter, AgentStatus, ApplyOptions, ApplyResult, ResetResult } from "../types.js";

async function installed(homeDir?: string) {
  return commandExists("opencode", [opencodeConfigPath(homeDir)]);
}

function isOctafy(provider: any) {
  return Boolean(provider && /octafy/i.test(String(provider.options?.baseURL ?? "")));
}

export const opencodeAdapter: AgentAdapter = {
  id: "opencode",
  name: "OpenCode",
  description: "OpenCode CLI (~/.config/opencode/opencode.json)",

  async status(opts = {}): Promise<AgentStatus> {
    const configPath = opencodeConfigPath(opts.homeDir);
    const config = await readJsonFile(configPath);
    const provider = config?.provider?.[PROVIDER_ID];
    return {
      id: "opencode",
      name: this.name,
      installed: await installed(opts.homeDir),
      configured: Boolean(provider),
      configPath: config ? configPath : null,
      message: provider ? "pointed at Octafy" : "OpenCode config not set to Octafy",
      details: {
        baseURL: provider?.options?.baseURL ?? null,
        activeModel: config?.model ?? null,
        models: provider?.models ? Object.keys(provider.models) : [],
      },
    };
  },

  async apply(opts: ApplyOptions): Promise<ApplyResult> {
    const configPath = opencodeConfigPath(opts.homeDir);
    const config = (await readJsonFile(configPath)) ?? {};
    const baseUrl = normalizeBaseUrl(opts.baseUrl || DEFAULT_BASE_URL);
    const ids = [...new Set([opts.model, ...(opts.models ?? []), ...(opts.subagentModel ? [opts.subagentModel] : [])].filter(Boolean))];
    if (ids.length === 0) return { id: this.id, name: this.name, success: false, message: "A model is required." };

    if (!config.$schema) config.$schema = "https://opencode.ai/config.json";
    if (!config.provider) config.provider = {};
    const existing = config.provider[PROVIDER_ID] ?? {
      npm: "@ai-sdk/openai-compatible",
      name: PROVIDER_NAME,
      options: {},
      models: {},
    };
    existing.npm = existing.npm ?? "@ai-sdk/openai-compatible";
    existing.name = PROVIDER_NAME;
    existing.options = { ...(existing.options ?? {}), baseURL: baseUrl, apiKey: opts.apiKey };
    existing.models = existing.models ?? {};
    for (const id of ids) {
      existing.models[id] = {
        ...(existing.models[id] ?? {}),
        name: opts.modelNames?.[id] || id.split("/").pop() || id,
        modalities: { input: ["text", "image"], output: ["text"] },
      };
    }
    config.provider[PROVIDER_ID] = existing;
    config.model = `${PROVIDER_ID}/${opts.model}`;
    if (opts.subagentModel) {
      config.agent = config.agent ?? {};
      config.agent.explorer = {
        ...(config.agent.explorer ?? {}),
        description: "Explorer subagent via Octafy",
        mode: "subagent",
        model: `${PROVIDER_ID}/${opts.subagentModel}`,
      };
    }

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
      message: `Octafy provider applied (${ids.length} model${ids.length === 1 ? "" : "s"})`,
    };
  },

  async reset(opts = {}): Promise<ResetResult> {
    const configPath = opencodeConfigPath(opts.homeDir);
    const config = await readJsonFile(configPath);
    if (!config) return { id: this.id, name: this.name, success: true, message: "no OpenCode config" };
    if (config.provider) delete config.provider[PROVIDER_ID];
    if (typeof config.model === "string" && config.model.startsWith(`${PROVIDER_ID}/`)) delete config.model;
    if (config.agent?.explorer?.model?.startsWith?.(`${PROVIDER_ID}/`)) {
      delete config.agent.explorer;
      if (Object.keys(config.agent).length === 0) delete config.agent;
    }
    if (!opts.dryRun) await writeText(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    return { id: this.id, name: this.name, success: true, message: "Octafy provider removed from OpenCode" };
  },
};
