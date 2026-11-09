import type { AgentAdapter, AgentId } from "../types.js";
import { claudeAdapter } from "./claude.js";
import { clineAdapter } from "./cline.js";
import { codexAdapter } from "./codex.js";
import { continueAdapter } from "./continue.js";
import { hermesAdapter } from "./hermes.js";
import { openclawAdapter } from "./openclaw.js";
import { opencodeAdapter } from "./opencode.js";

export const adapters: AgentAdapter[] = [
  claudeAdapter,
  codexAdapter,
  opencodeAdapter,
  clineAdapter,
  continueAdapter,
  hermesAdapter,
  openclawAdapter,
];

export const adapterById = Object.fromEntries(adapters.map((adapter) => [adapter.id, adapter])) as Record<AgentId, AgentAdapter>;

export const unsupportedAgents: Array<{ id: string; name: string; reason: string }> = [];

export function listAdapters() {
  return adapters.slice();
}

export function getAdapter(id: string) {
  return adapterById[id as AgentId];
}
