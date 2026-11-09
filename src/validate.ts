import { DEFAULT_BASE_URL } from "./constants.js";
import { VERSION } from "./version.js";
import { normalizeBaseUrl } from "./fsutil.js";
import type { Model } from "./types.js";

export type ValidateResult =
  | { ok: true; models: Model[] }
  | { ok: false; error: string };

export type ValidateOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function validateApiKey(options: ValidateOptions): Promise<ValidateResult> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) return { ok: false, error: "API key is empty." };
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetchImpl(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": `octafy-helper/${VERSION}`,
      },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      return { ok: false, error: `Octafy rejected the API key (HTTP ${response.status}). ${body.slice(0, 200)}`.trim() };
    }
    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      return { ok: false, error: "Octafy returned a non-JSON model list." };
    }
    const raw = Array.isArray(payload) ? payload : payload.models ?? payload.data ?? [];
    const models: Model[] = raw
      .map((item: any) => ({
        id: String(item.public_id ?? item.id ?? "").trim(),
        name: String(item.display_name ?? item.name ?? item.public_id ?? item.id ?? "").trim(),
        contextWindow: Number(item.context_window ?? 0) || undefined,
        maxOutputTokens: Number(item.max_output_tokens ?? 0) || undefined,
      }))
      .filter((model: Model) => model.id.length > 0);
    if (models.length === 0) {
      return { ok: false, error: "Octafy returned an empty model list for this key." };
    }
    return { ok: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Could not reach Octafy: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
