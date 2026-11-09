import { adapters, getAdapter, unsupportedAgents } from "./adapters/index.js";
import type { AgentId, ApplyOptions, ApplyResult, AgentStatus, ResetResult } from "./types.js";

export { DEFAULT_BASE_URL, PROVIDER_ID, PROVIDER_NAME, API_KEY_ENV } from "./constants.js";
export { validateApiKey } from "./validate.js";
export type { ValidateOptions, ValidateResult } from "./validate.js";
export { normalizeBaseUrl } from "./fsutil.js";
export { adapters, getAdapter, listAdapters, unsupportedAgents } from "./adapters/index.js";
export type { AgentAdapter, AgentId, AgentStatus, ApplyOptions, ApplyResult, Model, ResetResult } from "./types.js";

export async function statusAll(opts: { homeDir?: string } = {}): Promise<AgentStatus[]> {
  return Promise.all(adapters.map((adapter) => adapter.status(opts)));
}

export async function applyToAgents(
  agentIds: AgentId[] | "installed" | "all",
  opts: ApplyOptions,
): Promise<ApplyResult[]> {
  let targets = adapters;
  if (agentIds === "installed") {
    const statuses = await statusAll({ homeDir: opts.homeDir });
    const installed = new Set(statuses.filter((status) => status.installed).map((status) => status.id));
    targets = adapters.filter((adapter) => installed.has(adapter.id));
  } else if (agentIds !== "all") {
    targets = agentIds.map((id) => getAdapter(id)).filter((adapter): adapter is NonNullable<typeof adapter> => Boolean(adapter));
  }
  const results: ApplyResult[] = [];
  for (const adapter of targets) results.push(await adapter.apply(opts));
  return results;
}

export async function resetAgents(
  agentIds: AgentId[] | "all",
  opts: { homeDir?: string; dryRun?: boolean } = {},
): Promise<ResetResult[]> {
  const targets = agentIds === "all"
    ? adapters
    : agentIds.map((id) => getAdapter(id)).filter((adapter): adapter is NonNullable<typeof adapter> => Boolean(adapter));
  return Promise.all(targets.map((adapter) => adapter.reset(opts)));
}
