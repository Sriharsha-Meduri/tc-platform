const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/api/v1';

function authHeaders(token?: string): Record<string, string> {
  const t = token ?? readToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function readToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)tc_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiPost(path: string, body: FormData | object, token?: string): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders(token) };
  const isFormData = body instanceof FormData;
  if (!isFormData) headers['Content-Type'] = 'application/json';
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: isFormData ? body : JSON.stringify(body),
  });
}

export async function apiGet(path: string, token?: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders(token) },
    credentials: 'include',
  });
}

export async function apiPatch(path: string, body: object, token?: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    credentials: 'include',
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path: string, token?: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders(token) },
    credentials: 'include',
  });
}
