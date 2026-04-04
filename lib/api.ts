import type { ApiEnvelope } from "@/lib/types";

const API_BASE = resolveApiBaseUrl();

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SCHOLIA_API_URL?.trim();

  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  return "http://localhost:8080/api/v1";
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  apiKey?: string,
): Promise<ApiEnvelope<T>> {
  const hasEnvBaseUrl = Boolean(process.env.NEXT_PUBLIC_SCHOLIA_API_URL?.trim());

  if (process.env.NODE_ENV === "production" && !hasEnvBaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SCHOLIA_API_URL in production environment.");
  }

  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");

  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    const message = payload.error?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}