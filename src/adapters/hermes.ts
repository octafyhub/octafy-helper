import { DEFAULT_BASE_URL, PROVIDER_NAME } from "../constants.js";
import {
  commandExists,
  normalizeBaseUrl,
  readText,
  removeEnvVar,
  upsertEnvVar,
  writeText,
} from "../fsutil.js";
import { hermesConfigPath, hermesDir, hermesEnvPath } from "../paths.js";
import type { AgentAdapter, AgentStatus, ApplyOptions, ApplyResult, ResetResult } from "../types.js";

const MODEL_BLOCK_RE = /^model:[ \t]*\r?\n((?:[ \t]+.*\r?\n?|[ \t]*\r?\n)*)/m;
const API_KEY_ENV = "OPENAI_API_KEY";

function block(model: string, baseUrl: string) {
  return `model:\n  default: "${model}"\n  provider: "custom"\n  base_url: "${baseUrl}"\n`;
}

function parse(yaml: string) {
  const match = yaml.match(MODEL_BLOCK_RE);
  if (!match) return null;
  const body = match[1] || "";
  const get = (key: string) => {
    const found = body.match(new RegExp(`^[ \\t]+${key}:[ \\t]*["']?([^"'\\r\\n]+)["']?`, "m"));
    return found ? found[1].trim() : null;
  };
  return { default: get("default"), provider: get("provider"), base_url: get("base_url") };
}

export const hermesAdapter: AgentAdapter = {
  id: "hermes",
  name: "Hermes Agent",
  description: "Hermes (~/.hermes/config.yaml + .env)",

  async status(opts = {}): Promise<AgentStatus> {
    const configPath = hermesConfigPath(opts.homeDir);
    const yaml = (await readText(configPath)) ?? "";
    const model = parse(yaml);
    const configured = Boolean(model?.provider === "custom" && /octafy/i.test(model.base_url ?? ""));
    return {
      id: "hermes",
      name: this.name,
      installed: await commandExists("hermes", [hermesConfigPath(opts.homeDir), hermesDir(opts.homeDir)]),
      configured,
      configPath: yaml ? configPath : null,
      message: configured ? "pointed at Octafy" : "Hermes config not set to Octafy",
      details: { ...model, envPath: hermesEnvPath(opts.homeDir) },
    };
  },

  async apply(opts: ApplyOptions): Promise<ApplyResult> {
    if (!opts.model) return { id: this.id, name: this.name, success: false, message: "A model is required." };
    const configPath = hermesConfigPath(opts.homeDir);
    const envPath = hermesEnvPath(opts.homeDir);
    const baseUrl = normalizeBaseUrl(opts.baseUrl || DEFAULT_BASE_URL);
    const existing = (await readText(configPath)) ?? "";
    const modelBlock = block(opts.model, baseUrl);
    const yaml = MODEL_BLOCK_RE.test(existing) ? existing.replace(MODEL_BLOCK_RE, modelBlock) : `${modelBlock}\n${existing}`;
    const env = upsertEnvVar((await readText(envPath)) ?? "", API_KEY_ENV, opts.apiKey);

    if (opts.dryRun) {
      return { id: this.id, name: this.name, success: true, dryRun: true, configPath, message: `would write ${configPath} and ${envPath}` };
    }
    const yamlResult = await writeText(configPath, yaml.endsWith("\n") ? yaml : `${yaml}\n`, { mode: 0o600 });
    const envResult = await writeText(envPath, env.endsWith("\n") ? env : `${env}\n`, { mode: 0o600 });
    return {
      id: this.id,
      name: this.name,
      success: true,
      configPath,
      backupPath: yamlResult.backupPath || envResult.backupPath,
      message: `${PROVIDER_NAME} applied to Hermes`,
    };
  },

  async reset(opts = {}): Promise<ResetResult> {
    const configPath = hermesConfigPath(opts.homeDir);
    const envPath = hermesEnvPath(opts.homeDir);
    const yaml = await readText(configPath);
    if (yaml == null) return { id: this.id, name: this.name, success: true, message: "no Hermes config" };
    const model = parse(yaml);
    if (!model || !/octafy/i.test(model.base_url ?? "")) {
      return { id: this.id, name: this.name, success: true, message: "no Octafy config on Hermes" };
    }
    if (!opts.dryRun) {
      await writeText(configPath, yaml.replace(MODEL_BLOCK_RE, "").replace(/^\n+/, ""), { mode: 0o600 });
      const env = await readText(envPath);
      if (env != null) await writeText(envPath, removeEnvVar(env, API_KEY_ENV), { mode: 0o600 });
    }
    return { id: this.id, name: this.name, success: true, message: "Octafy model block removed from Hermes" };
  },
};
