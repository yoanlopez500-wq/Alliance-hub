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
 * El SW se registra al cargar la pagina; en la primera visita (o con cache
 * frio) puede tardar varios segundos, asi que se espera con reintentos en
 * lugar de un timeout fijo que fallaba en cargas lentas.
 */
async function waitForSw(maxMs = 15000): Promise<ServiceWorkerRegistration> {
  const started = Date.now();
  // ready se resuelve en cuanto hay un SW activo; si tarda, reintentamos con
  // getRegistration(), que no se queda colgado esperando uno nuevo.
  for (;;) {
    try {
      return await navigator.serviceWorker.ready;
    } catch {
      /* seguir esperando */
    }
    if (Date.now() - started > maxMs) throw new Error('sw-ready-timeout');
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// En Android los pasos de push pueden colgarse sin responder (Play Services
// ausente, red inestable, pestana en segundo plano). Un timeout por paso
// con mensaje claro evita el "no hace nada" percibido.

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

type Step = 'idle' | 'permiso' | 'sw' | 'suscripcion' | 'guardar' | 'ok';

const STEP_LABEL: Record<Exclude<Step, 'idle' | 'ok'>, string> = {
  permiso: 'Pidiendo permiso al sistema…',
  sw: 'Preparando el service worker…',
  suscripcion: 'Creando la suscripción push…',
  guardar: 'Guardando en el servidor…',
};

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (msg.startsWith('timeout:')) {
    const what = msg.split(':')[1];
    if (what === 'permiso') return 'El sistema no respondió a la petición de permiso. Recarga la página e inténtalo de nuevo.';
    if (what === 'sw') return 'El service worker no terminó de activarse. Recarga la página (tira hacia abajo) e inténtalo de nuevo.';
    if (what === 'suscripcion') return 'La suscripción push no respondió. En Android esto pasa sin Google Play Services o con datos móviles inestables; prueba con Wi‑Fi.';
    return 'La operación tardó demasiado. Inténtalo de nuevo.';
  }
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError') return 'El navegador bloqueó la suscripción. Revisa que el permiso de notificaciones esté activado para la app.';
    if (e.name === 'NotSupportedError') return 'Este navegador no soporta push web (prueba con Chrome actualizado).';
    if (e.name === 'AbortError') return 'La suscripción fue cancelada. Inténtalo de nuevo.';
    if (e.name === 'NetworkError') return 'Fallo de red al contactar el servicio de push. Inténtalo con mejor conexión.';
  }
  if (msg.includes('sw-ready-timeout')) return 'El service worker no se activó. Recarga la app e inténtalo de nuevo.';
  return `Error inesperado: ${msg.slice(0, 120)}`;
}

const DENIED_HINT = 'Permiso bloqueado. Para activarlo: Ajustes de Android → Aplicaciones → AllianceHub (o Chrome) → Notificaciones → Permitir. También: abre alliancehub.app en Chrome, toca el candado 🔒 → Configuración del sitio → Notificaciones → Permitir.';

export default function PushToggle({ playerId, allianceId }: { playerId: number; allianceId?: number | null }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(FLAG_KEY) === '1');
  const [supported] = useState(isSupported());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  // Diagnóstico siempre visible: qué dice Chrome REALMENTE (sin fiarnos del toggle)
  const [permNow, setPermNow] = useState<NotificationPermission | 'desconocido'>('desconocido');

  // Estado real del permiso visto con la Permissions API: se sincroniza solo
  // aunque el permiso cambie desde ajustes de Android/Chrome con la app abierta.
  useEffect(() => {
    if (!supported) return;
    let status: PermissionStatus | undefined;
    let onChange: (() => void) | undefined;
    (async () => {
      try {
        status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
        onChange = () => {
          const granted = status?.state === 'granted';
          setEnabled(granted);
          setPermNow(Notification.permission);
          if (granted) localStorage.setItem(FLAG_KEY, '1');
          else localStorage.removeItem(FLAG_KEY);
        };
        onChange();
        status.addEventListener('change', onChange);
      } catch {
        // Permissions API no disponible: sincronización manual de respaldo
        try {
          setPermNow(Notification.permission);
          if (Notification.permission !== 'granted') {
            setEnabled(false);
            localStorage.removeItem(FLAG_KEY);
          }
        } catch { /* ignore */ }
      }
    })();
    return () => {
      if (status && onChange) status.removeEventListener('change', onChange);
    };
  }, [supported]);

  if (!supported) return null;

  async function subscribe(): Promise<boolean> {
    if (Notification.permission === 'default') {
      setStep('permiso');
      const perm = await withTimeout(Notification.requestPermission(), 20000, 'permiso');
      setPermNow(Notification.permission);
      if (perm !== 'granted') {
        setHint(perm === 'denied' ? DENIED_HINT : 'Permiso no concedido. Inténtalo de nuevo cuando quieras.');
        return false;
      }
    } else if (Notification.permission !== 'granted') {
      setHint(DENIED_HINT);
      return false;
    }

    setStep('sw');
    const reg = await withTimeout(waitForSw(), 20000, 'sw');

    setStep('suscripcion');
    const sub = await withTimeout(
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }),
      25000,
      'suscripcion',
    );
    const json = sub.toJSON();
    if (!json?.endpoint || !json.keys) {
      setHint('El navegador devolvió una suscripción incompleta. Inténtalo de nuevo.');
      return false;
    }

    setStep('guardar');
    try { await publicDb.from('push_subscriptions').delete().eq('endpoint', json.endpoint); } catch { /* no critico */ }
    const { error } = await withTimeout<{ error: { message: string } | null }>(
      Promise.resolve(publicDb.from('push_subscriptions').insert({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        player_id: playerId,
        alliance_id: allianceId ?? null,
      })),
      15000,
      'guardar',
    );
    if (error) {
      setHint(`No se pudo guardar la suscripción en el servidor (${error.message.slice(0, 80)}). Revisa tu conexión e inténtalo de nuevo.`);
      return false;
    }
    localStorage.setItem(FLAG_KEY, '1');
    setStep('ok');
    setTimeout(() => setStep((s) => (s === 'ok' ? 'idle' : s)), 3000);
    return true;
  }

  async function unsubscribe(): Promise<boolean> {
    try {
      const reg = await withTimeout(waitForSw(10000), 15000, 'sw');
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.toJSON()?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        try { await publicDb.rpc('delete_push_subscription', { p_endpoint: endpoint }); } catch { /* ignore */ }
        try { await publicDb.from('push_subscriptions').delete().eq('endpoint', endpoint); } catch { /* ignore */ }
      }
      localStorage.removeItem(FLAG_KEY);
      return true;
    } catch (e) {
      setHint(friendlyError(e));
      return false;
    }
  }

  async function onToggle() {
    setBusy(true);
    setHint(null);
    setStep('idle');
    try {
      const ok = enabled ? await unsubscribe() : await subscribe();
      if (ok) setEnabled(!enabled);
      else if (!hint) setHint(enabled ? 'No se pudo desactivar. Revisa el permiso del navegador.' : 'No se pudo activar. Revisa los mensajes de arriba.');
    } catch (e) {
      console.error('[PushToggle]', e);
      setHint(friendlyError(e));
    } finally {
      setBusy(false);
      if (step !== 'ok') setStep('idle');
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          title={enabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: busy ? 'wait' : 'pointer',
            background: enabled ? colors.accent : colors.border, position: 'relative', transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 18, height: 18,
            borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: enabled ? colors.success : colors.muted }}>
          {enabled ? '✓ Notificaciones activadas' : 'Notificaciones push'}
        </span>
      </span>
      {busy && step !== 'idle' && step !== 'ok' && (
        <span style={{
          fontSize: 12, color: colors.info, background: colors.cardAlt,
          border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px',
        }}>
          ⏳ {STEP_LABEL[step]}
        </span>
      )}
      {step === 'ok' && (
        <span style={{
          fontSize: 12, color: colors.success, background: colors.cardAlt,
          border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px',
        }}>
          ✅ Listo. Ya puedes recibir avisos incluso con la app cerrada.
        </span>
      )}
      {hint && !busy && (
        <span style={{
          fontSize: 12, color: colors.warning, background: colors.cardAlt,
          border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px',
        }}>
          ⚠️ {hint}
        </span>
      )}
      <span style={{ fontSize: 11, color: colors.muted }}>
        Diagnóstico — permiso según Chrome: <b>{permNow}</b>
        {permNow === 'denied' && ' (bloqueado: revisa el checklist de Chrome/Ajustes)'}
        {permNow === 'default' && ' (aún sin decidir: al activar debería salir el diálogo del sistema)'}
        {permNow === 'granted' && ' (Chrome lo permite; si no funciona el fallo está después)'}
      </span>
    </div>
  );
}
