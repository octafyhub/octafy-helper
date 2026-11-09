import { DEFAULT_BASE_URL, PROVIDER_NAME } from "../constants.js";
import { commandExists, normalizeBaseUrl, readJsonFile, writeText } from "../fsutil.js";
import { clineGlobalStatePath, clineSecretsPath } from "../paths.js";
import type { AgentAdapter, AgentStatus, ApplyOptions, ApplyResult, ResetResult } from "../types.js";

async function installed(homeDir?: string) {
  return commandExists("cline", [clineGlobalStatePath(homeDir)]);
}

function isOctafy(state: any) {
  return Boolean(
    state &&
    (state.actModeApiProvider === "openai" || state.planModeApiProvider === "openai") &&
    /octafy/i.test(String(state.openAiBaseUrl ?? "")),
  );
}

export const clineAdapter: AgentAdapter = {
  id: "cline",
  name: "Cline",
  description: "Cline CLI (~/.cline/data/globalState.json + secrets.json)",

  async status(opts = {}): Promise<AgentStatus> {
    const configPath = clineGlobalStatePath(opts.homeDir);
    const state = await readJsonFile(configPath);
    return {
      id: "cline",
      name: this.name,
      installed: await installed(opts.homeDir),
      configured: isOctafy(state),
      configPath: state ? configPath : null,
      message: isOctafy(state) ? "pointed at Octafy" : "Cline config not set to Octafy",
      details: {
        provider: state?.actModeApiProvider ?? null,
        baseURL: state?.openAiBaseUrl ?? null,
        model: state?.openAiModelId ?? null,
      },
    };
  },

  async apply(opts: ApplyOptions): Promise<ApplyResult> {
    if (!opts.model) return { id: this.id, name: this.name, success: false, message: "A model is required." };
    const statePath = clineGlobalStatePath(opts.homeDir);
    const secretsPath = clineSecretsPath(opts.homeDir);
    const state = (await readJsonFile(statePath)) ?? {};
    const secrets = (await readJsonFile(secretsPath)) ?? {};
    state.actModeApiProvider = "openai";
    state.planModeApiProvider = "openai";
    state.openAiBaseUrl = normalizeBaseUrl(opts.baseUrl || DEFAULT_BASE_URL);
    state.openAiModelId = opts.model;
    secrets.openAiApiKey = opts.apiKey;

    if (opts.dryRun) {
      return { id: this.id, name: this.name, success: true, dryRun: true, configPath: statePath, message: `would write ${statePath}` };
    }
    const stateResult = await writeText(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    const secretResult = await writeText(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
    return {
      id: this.id,
      name: this.name,
      success: true,
      configPath: statePath,
      backupPath: stateResult.backupPath || secretResult.backupPath,
      message: `${PROVIDER_NAME} applied to Cline`,
    };
  },

  async reset(opts = {}): Promise<ResetResult> {
    const statePath = clineGlobalStatePath(opts.homeDir);
    const secretsPath = clineSecretsPath(opts.homeDir);
    const state = await readJsonFile(statePath);
    if (!state || !isOctafy(state)) return { id: this.id, name: this.name, success: true, message: "no Octafy config on Cline" };
    delete state.openAiBaseUrl;
    delete state.openAiModelId;
    if (!opts.dryRun) {
      await writeText(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      const secrets = await readJsonFile(secretsPath);
      if (secrets?.openAiApiKey) {
        delete secrets.openAiApiKey;
        await writeText(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
      }
    }
    return { id: this.id, name: this.name, success: true, message: "Octafy settings cleared from Cline" };
  },
};
