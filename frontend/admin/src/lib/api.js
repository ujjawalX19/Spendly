import { supabase } from './supabase';

const FALLBACK_API_URL = 'https://spendly-t8s6.onrender.com/api';

export const API_URL = (import.meta.env.VITE_ADMIN_API_URL || import.meta.env.VITE_API_URL || FALLBACK_API_URL).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Call the owner admin API with the current session's access token.
 * The token is read fresh from Supabase on every call (it may have been
 * refreshed); nothing about admin status is stored or trusted client-side.
 */
export async function adminApi(path, { method = 'GET', body, query } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Signed out', 401);

  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString()}`
    : '';

  let response;
  try {
    response = await fetch(`${API_URL}/admin${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch {
    throw new ApiError('Cannot reach the Vittova API. It may be waking up; try again in a moment.', 0);
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    const detail = json.errors?.[0]?.message;
    throw new ApiError(detail || json.message || `Request failed (${response.status})`, response.status, json);
  }
  return json;
}
