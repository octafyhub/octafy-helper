# @octafy/helper

Point coding agents and IDEs at **[Octafy](https://octafy.xyz)** with one command.

You enter your Octafy API key once. The helper validates it against
`GET https://api.octafy.xyz/v1/models`, then writes or merges the right config
files. Existing settings are preserved and a backup is written next to every
modified file.

Works on Windows, macOS, and Linux with Node.js 18 or newer.

## Install

```bash
# one-shot
npx @octafy/helper

# or global
npm install -g @octafy/helper
octafy-helper
```

The same binary is also available as `octafy`.

## Quick start

```bash
octafy-helper
```

Interactive flow:

1. Enter your Octafy API key (masked, validated against `/v1/models`).
2. Select the agents/IDEs to configure.
3. Pick the primary model from the live catalog.
4. Confirm, then Octafy settings are merged into each config.

Non-interactive:

```bash
octafy-helper apply \
  --key sk_live_... \
  --model octa/deepseek-v4.1-flash \
  --agents opencode,cline \
  --yes
```

## Commands

| Command | Description |
|---|---|
| `octafy-helper` / `setup` | Interactive setup wizard |
| `apply` | Non-interactive setup (`--key` + `--model`) |
| `status` | Show which agents are installed/configured |
| `validate --key ...` | Call `/v1/models` and print available models |
| `reset` | Remove Octafy settings only |
| `list` | List supported and unsupported agents |

### Flags

| Flag | Meaning |
|---|---|
| `--key, -k` | Octafy API key (`OCTAFY_API_KEY` env also works) |
| `--model, -m` | Primary public model ID |
| `--agents` | `installed` (default), `all`, or `opencode,cline,...` |
| `--models` | Extra comma-separated model IDs |
| `--subagent-model` | Optional OpenCode explorer subagent model |
| `--base-url` | Default `https://api.octafy.xyz/v1` |
| `--home` | Override home directory (tests/automation) |
| `--dry-run` | Do not write files |
| `--yes, -y` | Skip confirmation |
| `--json` | Machine-readable output |

## Supported agents

| Id | Tool | Config |
|---|---|---|
| `claude` | Claude Code | `~/.claude/settings.json` Anthropic Messages gateway (`/v1/messages`) |
| `codex` | Codex CLI | `~/.codex/config.toml` + `auth.json`, Responses API (`wire_api = "responses"`) |
| `opencode` | OpenCode | `~/.config/opencode/opencode.json` provider `octafy` (`@ai-sdk/openai-compatible`) |
| `cline` | Cline | `~/.cline/data/globalState.json` + `secrets.json` |
| `continue` | Continue | `~/.continue/config.json` OpenAI-compatible model entry |
| `hermes` | Hermes Agent | `~/.hermes/config.yaml` custom provider + `.env` |
| `openclaw` | OpenClaw | `~/.openclaw/openclaw.json` provider `octafy` |

### Protocol notes

- Claude Code uses Octafy's Anthropic Messages-compatible endpoint at `/v1/messages`.
- Codex CLI uses Octafy's OpenAI Responses-compatible endpoint at `/v1/responses`.
- `ANTHROPIC_BASE_URL` is written without `/v1`; Codex `base_url` keeps `/v1`.

## Programmatic API

```ts
import {
  validateApiKey,
  applyToAgents,
  statusAll,
  DEFAULT_BASE_URL,
} from "@octafy/helper";

const check = await validateApiKey({ apiKey: process.env.OCTAFY_API_KEY! });
if (!check.ok) throw new Error(check.error);

await applyToAgents(["opencode", "cline"], {
  apiKey: process.env.OCTAFY_API_KEY!,
  model: check.models[0]!.id,
  baseUrl: DEFAULT_BASE_URL,
});

console.log(await statusAll());
```

## Security

- The API key is written only to the config files required by the selected agents.
- Modified files are written with mode `600` on Unix-like systems.
- Backups use the `.octafy-backup` suffix and may contain the previous key. Remove them after verifying the setup.
- The helper never sends the key anywhere except `https://api.octafy.xyz` (or your `--base-url`).

## API

- Base URL: `https://api.octafy.xyz/v1`
- Chat completions: `POST /chat/completions`
- Model list: `GET /models`
- Create an API key: https://console.octafy.xyz/dashboard/api-keys

## License

MIT
