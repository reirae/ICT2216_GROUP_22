// Thin fetch wrapper that always sends/receives the session cookie
// and surfaces backend error messages with a consistent shape.

export interface ApiError extends Error {
  status: number;
  details?: unknown;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = new Error(
      (data && (data.error || data.message)) || `Request failed (${res.status})`
    ) as ApiError;
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return (data as T) ?? ({} as T);
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
