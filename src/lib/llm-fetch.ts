import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";
import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici";

let dispatcher: Dispatcher | undefined;

function proxyUri(): string | undefined {
  const u =
    process.env.LLM_HTTPS_PROXY?.trim() ||
    process.env.LLM_HTTP_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  return u || undefined;
}

function timeouts() {
  const connectTimeout = Math.max(
    10_000,
    Number(process.env.LLM_FETCH_CONNECT_TIMEOUT_MS) || 60_000
  );
  /** 生图等长任务可能长时间无响应头；默认放宽到 8min / 15min */
  const headersTimeout = Math.max(
    10_000,
    Number(process.env.LLM_FETCH_HEADERS_TIMEOUT_MS) || 480_000
  );
  const bodyTimeout = Math.max(
    30_000,
    Number(process.env.LLM_FETCH_BODY_TIMEOUT_MS) || 900_000
  );
  return { connectTimeout, headersTimeout, bodyTimeout };
}

function getDispatcher(): Dispatcher {
  if (!dispatcher) {
    const t = timeouts();
    const proxy = proxyUri();
    dispatcher = proxy ? new ProxyAgent({ uri: proxy, ...t }) : new Agent(t);
  }
  return dispatcher;
}

/**
 * 用于出站 OpenAI 兼容 / Grok / 生图等 API。
 * - 默认将连接超时提高到 60s；响应头/体超时默认 8min / 15min（慢速生图可用 LLM_FETCH_*_TIMEOUT_MS 再调）
 * - 优先读取 LLM_HTTP_PROXY / LLM_HTTPS_PROXY，其次 HTTPS_PROXY / HTTP_PROXY（仅作用于本 helper，不修改全局）
 */
export function llmFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const merged: UndiciRequestInit = {
    ...(init as UndiciRequestInit),
    dispatcher: getDispatcher(),
  };
  return undiciFetch(input, merged) as unknown as Promise<Response>;
}
