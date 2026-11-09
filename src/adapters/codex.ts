import { DEFAULT_BASE_URL, PROVIDER_ID, PROVIDER_NAME } from "../constants.js";
import {
  commandExists,
  normalizeBaseUrl,
  readJsonFile,
  readText,
  removeTomlKey,
  removeTomlTable,
  tomlGetString,
  tomlHasTable,
  upsertTomlString,
  upsertTomlTable,
  writeText,
} from "../fsutil.js";
import { codexAuthPath, codexConfigPath } from "../paths.js";
import type { AgentAdapter, AgentStatus, ApplyOptions, ApplyResult, ResetResult } from "../types.js";

const SECTION = `model_providers.${PROVIDER_ID}`;

function isOctafy(toml: string) {
  return tomlGetString(toml, "model_provider") === PROVIDER_ID || tomlHasTable(toml, SECTION);
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  name: "Codex CLI",
  description: "Codex CLI (~/.codex/config.toml + auth.json)",

  async status(opts = {}): Promise<AgentStatus> {
    const configPath = codexConfigPath(opts.homeDir);
    const toml = (await readText(configPath)) ?? "";
    return {
      id: "codex",
      name: this.name,
      installed: await commandExists("codex", [configPath]),
      configured: Boolean(toml) && isOctafy(toml),
      configPath: toml ? configPath : null,
      message: isOctafy(toml) ? "pointed at Octafy" : "Codex not set to Octafy",
      details: { modelProvider: tomlGetString(toml, "model_provider"), model: tomlGetString(toml, "model") },
    };
  },

  async apply(opts: ApplyOptions): Promise<ApplyResult> {
    if (!opts.model) return { id: this.id, name: this.name, success: false, message: "A model is required." };
    const configPath = codexConfigPath(opts.homeDir);
    const authPath = codexAuthPath(opts.homeDir);
    let toml = (await readText(configPath)) ?? "";
    toml = upsertTomlString(toml, "model", opts.model);
    toml = upsertTomlString(toml, "model_provider", PROVIDER_ID);
    toml = upsertTomlTable(toml, SECTION, {
      name: PROVIDER_NAME,
      base_url: normalizeBaseUrl(opts.baseUrl || DEFAULT_BASE_URL),
      wire_api: "responses",
      experimental_bearer_token: opts.apiKey,
    });
    const auth = (await readJsonFile(authPath)) ?? {};
    auth.OPENAI_API_KEY = opts.apiKey;
    auth.auth_mode = "apikey";

    if (opts.dryRun) {
      return { id: this.id, name: this.name, success: true, dryRun: true, configPath, message: `would write ${configPath} and ${authPath}` };
    }
    const configResult = await writeText(configPath, toml.endsWith("\n") ? toml : `${toml}\n`, { mode: 0o600 });
    const authResult = await writeText(authPath, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
    return {
      id: this.id,
      name: this.name,
      success: true,
      configPath,
      backupPath: configResult.backupPath || authResult.backupPath,
      message: `${PROVIDER_NAME} applied to Codex (Responses API)`,
    };
  },

  async reset(opts = {}): Promise<ResetResult> {
    const configPath = codexConfigPath(opts.homeDir);
    const authPath = codexAuthPath(opts.homeDir);
    let toml = await readText(configPath);
    if (toml == null) return { id: this.id, name: this.name, success: true, message: "no Codex config" };
    if (tomlGetString(toml, "model_provider") === PROVIDER_ID) {
      toml = removeTomlKey(toml, "model");
      toml = removeTomlKey(toml, "model_provider");
    }
    toml = removeTomlTable(toml, SECTION);
    if (!opts.dryRun) {
      await writeText(configPath, toml, { mode: 0o600 });
      const auth = await readJsonFile(authPath);
      if (auth) {
        delete auth.OPENAI_API_KEY;
        delete auth.auth_mode;
        await writeText(authPath, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
      }
    }
    return { id: this.id, name: this.name, success: true, message: "Octafy settings cleared from Codex" };
  },
};
