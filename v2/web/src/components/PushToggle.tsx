import { useEffect, useState } from 'react';
import { publicDb } from '../lib/api';
import { colors } from '../theme';

const VAPID_PUBLIC_KEY = 'BA1T-hD8Im5qjcBoQG9hlMhQd_YelUyzfSDrvt2wn88DD9fZRmCgM7RhtlfaKaSMXY7gdlC23qaRGpyfcUdq7Y0';
const FLAG_KEY = 'ah_push_enabled';

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
    typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}

/**
 * Toggle de notificaciones push (puerto de push-manager.js).
 * Sin SW/PWA en v2 aun: si el registro del SW no aparece en 5s, el toggle
 * se muestra deshabilitado con aviso en vez de romper la pagina.
 */
export default function PushToggle({ playerId, allianceId }: { playerId: number; allianceId?: number | null }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(FLAG_KEY) === '1');
  const [supported] = useState(isSupported());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    (async () => {
      try {
        if (Notification.permission !== 'granted') setEnabled(false);
      } catch { /* ignore */ }
    })();
  }, [supported]);

  if (!supported) return null;

  async function subscribe(): Promise<boolean> {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
    } else if (Notification.permission !== 'granted') return false;

    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw-ready-timeout')), 5000)),
    ]);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    const json = sub.toJSON();
    if (!json?.endpoint || !json.keys) return false;

    try { await publicDb.from('push_subscriptions').delete().eq('endpoint', json.endpoint); } catch { /* no critico */ }
    const { error } = await publicDb.from('push_subscriptions').insert({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      player_id: playerId,
      alliance_id: allianceId ?? null,
    });
    if (error) return false;
    localStorage.setItem(FLAG_KEY, '1');
    return true;
  }

  async function unsubscribe(): Promise<boolean> {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw-ready-timeout')), 3000)),
      ]);
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.toJSON()?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        try { await publicDb.rpc('delete_push_subscription', { p_endpoint: endpoint }); } catch { /* ignore */ }
        try { await publicDb.from('push_subscriptions').delete().eq('endpoint', endpoint); } catch { /* ignore */ }
      }
      localStorage.removeItem(FLAG_KEY);
      return true;
    } catch {
      return false;
    }
  }

  async function onToggle() {
    setBusy(true);
    setHint(null);
    try {
      const ok = enabled ? await unsubscribe() : await subscribe();
      if (ok) setEnabled(!enabled);
      else setHint(enabled ? 'No se pudo desactivar. Revisa el permiso del navegador.' : 'Activa las notificaciones del navegador para Alliance Hub.');
    } catch {
      setHint('Las notificaciones push requieren instalar la app (PWA) o recargar con conexion segura.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        title={enabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: busy ? 'wait' : 'pointer',
          background: enabled ? colors.accent : colors.border, position: 'relative', transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 18, height: 18,
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
        }} />
      </button>
      <span style={{ fontSize: 12, color: colors.muted }}>{enabled ? 'Notificaciones ON' : 'Notificaciones'}</span>
      {hint && <span style={{ fontSize: 11, color: colors.warning }}>{hint}</span>}
    </span>
  );
}
