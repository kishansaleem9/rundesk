export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string }; throw new Error(body.error ?? "Request failed"); }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
