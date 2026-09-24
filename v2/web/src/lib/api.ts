import { createClient } from '@supabase/supabase-js';

/**
 * Dos clientes, dos mundos:
 * - serverApi: TODO lo privado pasa por el server v2 (Fastify + service_role).
 * - publicDb: lecturas publicas directas con la anon key (players, partidas).
 */
const SERVER_URL = import.meta.env.VITE_API_URL ?? '/api';

export function getSessionToken(): string | null {
  return localStorage.getItem('ah2_token');
}
export function setSessionToken(token: string | null, playerId?: number) {
  if (!token) {
    localStorage.removeItem('ah2_token');
    localStorage.removeItem('ah2_player_id');
    return;
  }
  localStorage.setItem('ah2_token', token);
  if (playerId) localStorage.setItem('ah2_player_id', String(playerId));
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
  const token = getSessionToken();
  const playerId = localStorage.getItem('ah2_player_id');
  if (token) headers.Authorization = playerId ? `Player ${playerId}:${token}` : `Bearer ${token}`;
  const res = await fetch(`${SERVER_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Error ${res.status}`);
  return body;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const serverApi = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (path: string, body?: unknown) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

// Lecturas publicas directas (anon key, sin secretos)
export const publicDb = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? '',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
);
