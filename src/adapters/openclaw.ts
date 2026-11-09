import { DEFAULT_BASE_URL, PROVIDER_ID, PROVIDER_NAME } from "../constants.js";
import { commandExists, normalizeBaseUrl, readJsonFile, writeText } from "../fsutil.js";
import { openclawSettingsPath } from "../paths.js";
import type { AgentAdapter, AgentStatus, ApplyOptions, ApplyResult, ResetResult } from "../types.js";

function primaryModel(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "primary" in value) return String(value.primary ?? "");
  return "";
}

export const openclawAdapter: AgentAdapter = {
  id: "openclaw",
  name: "OpenClaw",
  description: "OpenClaw (~/.openclaw/openclaw.json)",

  async status(opts = {}): Promise<AgentStatus> {
    const configPath = openclawSettingsPath(opts.homeDir);
    const settings = await readJsonFile(configPath);
    const provider = settings?.models?.providers?.[PROVIDER_ID];
    return {
      id: "openclaw",
      name: this.name,
      installed: await commandExists("openclaw", [configPath]),
      configured: Boolean(provider),
      configPath: settings ? configPath : null,
      message: provider ? "pointed at Octafy" : "OpenClaw config not set to Octafy",
      details: {
        baseUrl: provider?.baseUrl ?? null,
        primaryModel: primaryModel(settings?.agents?.defaults?.model) || null,
        models: provider?.models?.map((model: any) => model.id) ?? [],
      },
    };
  },

  async apply(opts: ApplyOptions): Promise<ApplyResult> {
    if (!opts.model) return { id: this.id, name: this.name, success: false, message: "A model is required." };
    const configPath = openclawSettingsPath(opts.homeDir);
    const settings = (await readJsonFile(configPath)) ?? {};
    const ids = [...new Set([opts.model, ...(opts.models ?? []), ...(opts.subagentModel ? [opts.subagentModel] : [])])];
    settings.agents = settings.agents ?? {};
    settings.agents.defaults = settings.agents.defaults ?? {};
    if (!settings.agents.defaults.model || typeof settings.agents.defaults.model === "string") {
      settings.agents.defaults.model = { primary: "" };
    }
    settings.agents.defaults.models = settings.agents.defaults.models ?? {};
    settings.models = settings.models ?? {};
    settings.models.providers = settings.models.providers ?? {};

    for (const key of Object.keys(settings.agents.defaults.models)) {
      if (key.startsWith(`${PROVIDER_ID}/`)) delete settings.agents.defaults.models[key];
    }
    settings.agents.defaults.model.primary = `${PROVIDER_ID}/${opts.model}`;
    for (const id of ids) settings.agents.defaults.models[`${PROVIDER_ID}/${id}`] = {};
    settings.models.providers[PROVIDER_ID] = {
      baseUrl: normalizeBaseUrl(opts.baseUrl || DEFAULT_BASE_URL),
      apiKey: opts.apiKey,
      api: "openai-completions",
      models: ids.map((id) => ({ id, name: opts.modelNames?.[id] || id.split("/").pop() || id })),
    };

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
      message: `${PROVIDER_NAME} applied to OpenClaw`,
    };
  },

  async reset(opts = {}): Promise<ResetResult> {
    const configPath = openclawSettingsPath(opts.homeDir);
    const settings = await readJsonFile(configPath);
    if (!settings) return { id: this.id, name: this.name, success: true, message: "no OpenClaw config" };
    delete settings.models?.providers?.[PROVIDER_ID];
    for (const key of Object.keys(settings.agents?.defaults?.models ?? {})) {
      if (key.startsWith(`${PROVIDER_ID}/`)) delete settings.agents.defaults.models[key];
    }
    if (primaryModel(settings.agents?.defaults?.model).startsWith(`${PROVIDER_ID}/`)) {
      delete settings.agents.defaults.model;
    }
    if (!opts.dryRun) await writeText(configPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    return { id: this.id, name: this.name, success: true, message: "Octafy settings cleared from OpenClaw" };
  },
};
