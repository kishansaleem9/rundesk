/**
 * Thrown by api() for non-2xx responses. Keeps the status and the parsed body
 * so callers can branch on it: the time-tracking routes put a `code` on 409s
 * (TIMER_RUNNING with `running`, TIMESHEET_LOCKED with `submission`, …).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ error: response.statusText }))) as Record<string, unknown>;
    const message =
      typeof body.error === "string" && body.error ? body.error : "Request failed";

    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
