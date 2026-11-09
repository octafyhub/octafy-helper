export type AgentId = "claude" | "codex" | "opencode" | "cline" | "continue" | "hermes" | "openclaw";

export type Model = {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
};

export type ApplyOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  models?: string[];
  subagentModel?: string;
  modelNames?: Record<string, string>;
  homeDir?: string;
  dryRun?: boolean;
};

export type AgentStatus = {
  id: AgentId;
  name: string;
  installed: boolean;
  configured: boolean;
  configPath: string | null;
  message: string;
  details?: Record<string, unknown>;
};

export type ApplyResult = {
  id: AgentId;
  name: string;
  success: boolean;
  dryRun?: boolean;
  configPath?: string;
  backupPath?: string;
  message: string;
};

export type ResetResult = {
  id: AgentId;
  name: string;
  success: boolean;
  message: string;
};

export type AgentAdapter = {
  id: AgentId;
  name: string;
  description: string;
  status(opts?: { homeDir?: string }): Promise<AgentStatus>;
  apply(opts: ApplyOptions): Promise<ApplyResult>;
  reset(opts?: { homeDir?: string; dryRun?: boolean }): Promise<ResetResult>;
};
