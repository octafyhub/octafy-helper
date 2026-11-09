import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { claudeAdapter } from "../src/adapters/claude.js";
import { codexAdapter } from "../src/adapters/codex.js";
import { opencodeAdapter } from "../src/adapters/opencode.js";
import { normalizeBaseUrl } from "../src/fsutil.js";
import { validateApiKey } from "../src/validate.js";

test("normalizeBaseUrl appends /v1 once", () => {
  assert.equal(normalizeBaseUrl("https://api.octafy.xyz"), "https://api.octafy.xyz/v1");
  assert.equal(normalizeBaseUrl("https://api.octafy.xyz/v1/"), "https://api.octafy.xyz/v1");
});

test("validateApiKey uses public_id and display_name", async () => {
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer sk_test");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      models: [
        { id: "uuid-1", public_id: "octa/deepseek-v4.1-flash", display_name: "DeepSeek V4.1 Flash", context_window: 1000000 },
      ],
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const result = await validateApiKey({
      apiKey: "sk_test",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.models.map((model) => model.id), ["octa/deepseek-v4.1-flash"]);
    assert.equal(result.models[0]?.name, "DeepSeek V4.1 Flash");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("opencode adapter merges config and preserves other settings", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "octafy-helper-"));
  const configPath = path.join(home, ".config", "opencode", "opencode.json");
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ theme: "system", provider: { other: { name: "Other" } } }), "utf8");
  try {
    const result = await opencodeAdapter.apply({
      apiKey: "sk_test",
      model: "octa/deepseek-v4.1-flash",
      models: ["octa/kimi-k3.1-pro"],
      modelNames: { "octa/deepseek-v4.1-flash": "DeepSeek V4.1 Flash" },
      homeDir: home,
    });
    assert.equal(result.success, true);
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.equal(config.theme, "system");
    assert.equal(config.provider.other.name, "Other");
    assert.equal(config.provider.octafy.options.baseURL, "https://api.octafy.xyz/v1");
    assert.equal(config.model, "octafy/octa/deepseek-v4.1-flash");
    assert.ok(config.provider.octafy.models["octa/deepseek-v4.1-flash"]);
    assert.ok(config.provider.octafy.models["octa/kimi-k3.1-pro"]);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("claude adapter writes Anthropic gateway settings", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "octafy-claude-"));
  const configPath = path.join(home, ".claude", "settings.json");
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ theme: "dark", env: { KEEP: "1" } }), "utf8");
  try {
    const result = await claudeAdapter.apply({
      apiKey: "sk_test", model: "octa/deepseek-v4.1-flash", homeDir: home,
    });
    assert.equal(result.success, true);
    const settings = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.equal(settings.theme, "dark");
    assert.equal(settings.env.KEEP, "1");
    assert.equal(settings.env.ANTHROPIC_BASE_URL, "https://api.octafy.xyz");
    assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "sk_test");
    assert.equal(settings.env.ANTHROPIC_MODEL, "octa/deepseek-v4.1-flash");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("codex adapter writes Responses provider", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "octafy-codex-"));
  try {
    const result = await codexAdapter.apply({
      apiKey: "sk_test", model: "octa/deepseek-v4.1-flash", homeDir: home,
    });
    assert.equal(result.success, true);
    const toml = await fs.readFile(path.join(home, ".codex", "config.toml"), "utf8");
    assert.match(toml, /wire_api = "responses"/);
    assert.match(toml, /base_url = "https:\/\/api\.octafy\.xyz\/v1"/);
    assert.match(toml, /experimental_bearer_token = "sk_test"/);
    const auth = JSON.parse(await fs.readFile(path.join(home, ".codex", "auth.json"), "utf8"));
    assert.equal(auth.OPENAI_API_KEY, "sk_test");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
