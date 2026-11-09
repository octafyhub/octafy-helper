import os from "node:os";
import path from "node:path";

export function home(homeDir?: string) {
  return homeDir || os.homedir();
}

export function claudeSettingsPath(homeDir?: string) {
  return path.join(home(homeDir), ".claude", "settings.json");
}

export function codexDir(homeDir?: string) {
  if (process.env.CODEX_HOME && !homeDir) return process.env.CODEX_HOME;
  return path.join(home(homeDir), ".codex");
}

export function codexConfigPath(homeDir?: string) {
  return path.join(codexDir(homeDir), "config.toml");
}

export function codexAuthPath(homeDir?: string) {
  return path.join(codexDir(homeDir), "auth.json");
}

export function opencodeConfigPath(homeDir?: string) {
  return process.env.OPENCODE_CONFIG || path.join(home(homeDir), ".config", "opencode", "opencode.json");
}

export function clineDataDir(homeDir?: string) {
  return path.join(home(homeDir), ".cline", "data");
}

export function clineGlobalStatePath(homeDir?: string) {
  return path.join(clineDataDir(homeDir), "globalState.json");
}

export function clineSecretsPath(homeDir?: string) {
  return path.join(clineDataDir(homeDir), "secrets.json");
}

export function continueConfigPath(homeDir?: string) {
  return path.join(home(homeDir), ".continue", "config.json");
}

export function hermesDir(homeDir?: string) {
  if (process.platform === "win32" && !homeDir && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "hermes");
  }
  return path.join(home(homeDir), ".hermes");
}

export function hermesConfigPath(homeDir?: string) {
  return path.join(hermesDir(homeDir), "config.yaml");
}

export function hermesEnvPath(homeDir?: string) {
  return path.join(hermesDir(homeDir), ".env");
}

export function openclawDir(homeDir?: string) {
  return path.join(home(homeDir), ".openclaw");
}

export function openclawSettingsPath(homeDir?: string) {
  return path.join(openclawDir(homeDir), "openclaw.json");
}
