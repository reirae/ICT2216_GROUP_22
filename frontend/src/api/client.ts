// Thin fetch wrapper that always sends/receives the session cookie
// and surfaces backend error messages with a consistent shape.

export interface ApiError extends Error {
  status: number;
  details?: unknown;
}

// Anti-CSRF Framework (client side): the backend mints a session-bound
// CSRF token on login/`/auth/me` and expects it echoed back in the
// X-CSRF-Token header on every state-changing request. The token is
// kept only in memory (never in localStorage/a readable cookie) and is
// refreshed automatically whenever a response includes a new one.
let csrfToken: string | null = null;

// Initialize tab isolation token context from tab-sandboxed sessionStorage on boot
let tabSessionId: string | null = sessionStorage.getItem('securebank_tab_sid');

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

// Provide a thread-safe setter to bind the token context dynamically
export function setTabSessionId(token: string | null) {
  tabSessionId = token;
  if (token) {
    sessionStorage.setItem('securebank_tab_sid', token);
  } else {
    sessionStorage.removeItem('securebank_tab_sid');
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();

  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(MUTATING_METHODS.has(method) && csrfToken
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
      ...(tabSessionId ? { 'X-Account-Session-Id': tabSessionId } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  // Pick up a fresh token whenever the backend hands one out (login,
  // 2FA verification, /auth/me) so subsequent mutating requests stay
  // in sync with the current session.
  if (data && typeof data.csrfToken === 'string') {
    setCsrfToken(data.csrfToken);
  }

  // Auto-capture isolation context token properties during /auth/me or login handshakes
  if (data && typeof data.tabSessionId === 'string') {
    setTabSessionId(data.tabSessionId);
  }

  if (!res.ok) {
    // Cross-Tab/Switched Multi-Session Synchronization Check:
    // Fire a notification listener to clear global authentication state variables instantly
    if (res.status === 401) {
      window.dispatchEvent(new Event('auth-unauthorized'));
    }

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
