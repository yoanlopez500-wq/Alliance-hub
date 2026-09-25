/** lib/invites.ts — puerto de invite-code.js (generador crypto AH+10). */

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I/O/0/1 ambiguos
  let code = 'AH';
  const arr = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 10; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  for (let j = 0; j < 10; j++) code += chars[arr[j] % chars.length];
  return code;
}

/** Jerarquía de roles (puerto de roles-data.js ROLE_HIERARCHY). */
export const ROLE_HIERARCHY: Record<string, number> = {
  superadmin: 5,
  event_admin: 4,
  alliance_leader: 3,
  moderator: 2,
  officer: 1,
};
