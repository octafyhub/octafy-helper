#!/usr/bin/env node
import { checkbox, confirm, password, select } from "@inquirer/prompts";

import {
  DEFAULT_BASE_URL,
  applyToAgents,
  listAdapters,
  resetAgents,
  statusAll,
  unsupportedAgents,
  validateApiKey,
} from "./index.js";
import type { AgentId, ApplyResult } from "./types.js";
import { normalizeBaseUrl } from "./fsutil.js";

import { VERSION } from "./version.js";

type Flags = {
  command: string;
  key?: string;
  model?: string;
  agents?: string;
  baseUrl?: string;
  models?: string;
  subagentModel?: string;
  home?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  help?: boolean;
  version?: boolean;
};

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { command: "setup" };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) flags.command = args.shift()!;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => {
      const value = args[++i];
      if (value == null) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case "--key": case "-k": flags.key = next(); break;
      case "--model": case "-m": flags.model = next(); break;
      case "--agents": flags.agents = next(); break;
      case "--base-url": flags.baseUrl = next(); break;
      case "--models": flags.models = next(); break;
      case "--subagent-model": flags.subagentModel = next(); break;
      case "--home": flags.home = next(); break;
      case "--dry-run": flags.dryRun = true; break;
      case "--yes": case "-y": flags.yes = true; break;
      case "--json": flags.json = true; break;
      case "--help": case "-h": flags.help = true; break;
      case "--version": case "-v": flags.version = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return flags;
}

function printHelp() {
  console.log(`Octafy helper ${VERSION}

Point coding agents and IDEs at Octafy.

Usage:
  octafy-helper                    Interactive setup
  octafy-helper apply [options]    Non-interactive setup
  octafy-helper status [--json]    Show detected agents
  octafy-helper validate [--key]   Validate an Octafy API key
  octafy-helper reset [--yes]      Remove Octafy settings
  octafy-helper list               List supported agents

Options:
  -k, --key <key>           Octafy API key (or OCTAFY_API_KEY)
  -m, --model <id>          Primary public model ID
      --agents <list>       installed (default), all, or opencode,cline,...
      --models <list>       Extra comma-separated model IDs
      --subagent-model <id> Optional subagent model for OpenCode
      --base-url <url>      Default ${DEFAULT_BASE_URL}
      --home <dir>          Override home directory for tests
      --dry-run             Do not write files
  -y, --yes                 Skip confirmation
      --json                Machine-readable output
  -h, --help                 Show help
  -v, --version              Show version`);
}

function printResult(result: ApplyResult) {
  const icon = result.success ? "✓" : "✗";
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.configPath) console.log(`  ${result.configPath}`);
  if (result.backupPath) console.log(`  backup: ${result.backupPath}`);
}

async function resolveKey(flags: Flags): Promise<string> {
  const fromFlag = flags.key || process.env.OCTAFY_API_KEY || "";
  if (fromFlag.trim()) return fromFlag.trim();
  return (await password({ message: "Octafy API key", mask: "*" })).trim();
}

function selectedAgents(value?: string): AgentId[] | "installed" | "all" {
  if (!value || value === "installed") return "installed";
  if (value === "all") return "all";
  return value.split(",").map((item) => item.trim()).filter(Boolean) as AgentId[];
}

async function setup(flags: Flags) {
  const baseUrl = normalizeBaseUrl(flags.baseUrl || DEFAULT_BASE_URL);
  let key = await resolveKey(flags);
  const validation = await validateApiKey({ apiKey: key, baseUrl });
  if (!validation.ok) throw new Error(validation.error);

  const statuses = await statusAll({ homeDir: flags.home });
  const installed = statuses.filter((status) => status.installed).map((status) => status.id);
  const choices = listAdapters().map((adapter) => ({
    name: `${adapter.name} — ${adapter.description}`,
    value: adapter.id,
    checked: installed.includes(adapter.id),
  }));
  const agents = await checkbox({ message: "Agents / IDEs to configure", choices, required: true });
  const model = await select({
    message: "Primary model",
    choices: validation.models.map((item) => ({ name: `${item.name} — ${item.id}`, value: item.id })),
  });
  const ok = await confirm({
    message: `Apply Octafy to ${agents.length} agent(s) with ${model}?`,
    default: true,
  });
  if (!ok) return;

  const modelNames = Object.fromEntries(validation.models.map((item) => [item.id, item.name]));
  const results = await applyToAgents(agents as AgentId[], {
    apiKey: key,
    model,
    baseUrl,
    models: flags.models?.split(",").map((item) => item.trim()).filter(Boolean),
    subagentModel: flags.subagentModel,
    modelNames,
    homeDir: flags.home,
    dryRun: flags.dryRun,
  });
  if (flags.json) {
    console.log(JSON.stringify({ models: validation.models, results }, null, 2));
    return;
  }
  for (const result of results) printResult(result);
  console.log(`\nBase URL: ${baseUrl}`);
}

async function apply(flags: Flags) {
  const baseUrl = normalizeBaseUrl(flags.baseUrl || DEFAULT_BASE_URL);
  const key = await resolveKey(flags);
  if (!key) throw new Error("API key is required.");
  const validation = await validateApiKey({ apiKey: key, baseUrl });
  if (!validation.ok) throw new Error(validation.error);
  if (!flags.model) throw new Error("--model is required. Use `octafy-helper validate` to list models.");
  if (!validation.models.some((model) => model.id === flags.model)) {
    throw new Error(`Model ${flags.model} is not available to this key.`);
  }
  const agents = selectedAgents(flags.agents);
  if (agents !== "installed" && agents !== "all" && agents.length === 0) throw new Error("No agents selected.");
  if (!flags.yes) {
    const ok = await confirm({ message: `Write Octafy settings for ${flags.model}?`, default: true });
    if (!ok) return;
  }
  const modelNames = Object.fromEntries(validation.models.map((model) => [model.id, model.name]));
  const results = await applyToAgents(agents, {
    apiKey: key,
    model: flags.model,
    baseUrl,
    models: flags.models?.split(",").map((item) => item.trim()).filter(Boolean),
    subagentModel: flags.subagentModel,
    modelNames,
    homeDir: flags.home,
    dryRun: flags.dryRun,
  });
  if (flags.json) {
    console.log(JSON.stringify({ baseUrl, results }, null, 2));
    return;
  }
  for (const result of results) printResult(result);
}

async function status(flags: Flags) {
  const rows = await statusAll({ homeDir: flags.home });
  if (flags.json) {
    console.log(JSON.stringify({ agents: rows, unsupported: unsupportedAgents }, null, 2));
    return;
  }
  for (const row of rows) {
    const state = row.configured ? "Octafy" : row.installed ? "installed" : "not detected";
    console.log(`${row.configured ? "✓" : "○"} ${row.name.padEnd(14)} ${state}`);
    if (row.configPath) console.log(`  ${row.configPath}`);
  }
  if (unsupportedAgents.length) {
    console.log("\nNot supported:");
    for (const agent of unsupportedAgents) console.log(`  ${agent.name}: ${agent.reason}`);
  }
}

async function validate(flags: Flags) {
  const baseUrl = normalizeBaseUrl(flags.baseUrl || DEFAULT_BASE_URL);
  const key = await resolveKey(flags);
  const result = await validateApiKey({ apiKey: key, baseUrl });
  if (!result.ok) throw new Error(result.error);
  if (flags.json) {
    console.log(JSON.stringify({ baseUrl, models: result.models }, null, 2));
    return;
  }
  console.log(`Connected to ${baseUrl}`);
  for (const model of result.models) console.log(`- ${model.id} (${model.name})`);
}

async function reset(flags: Flags) {
  const agents = selectedAgents(flags.agents);
  if (!flags.yes) {
    const ok = await confirm({ message: "Remove Octafy settings from selected agents?", default: false });
    if (!ok) return;
  }
  const results = await resetAgents(agents === "installed" ? "all" : agents, {
    homeDir: flags.home,
    dryRun: flags.dryRun,
  });
  if (flags.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }
  for (const result of results) console.log(`${result.success ? "✓" : "✗"} ${result.name}: ${result.message}`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.version) return console.log(VERSION);
  if (flags.help || flags.command === "help") return printHelp();
  switch (flags.command) {
    case "setup": return setup(flags);
    case "apply": return apply(flags);
    case "status": return status(flags);
    case "validate": return validate(flags);
    case "reset": return reset(flags);
    case "list": {
      for (const adapter of listAdapters()) console.log(`${adapter.id.padEnd(10)} ${adapter.name} — ${adapter.description}`);
      if (unsupportedAgents.length) {
        console.log("\nNot supported:");
        for (const agent of unsupportedAgents) console.log(`${agent.id.padEnd(10)} ${agent.name} — ${agent.reason}`);
      }
      return;
    }
    default:
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
