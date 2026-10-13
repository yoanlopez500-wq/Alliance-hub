import { useEffect, useRef, useState } from 'react';
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

export default function PushToggle({ playerId, allianceId }: { playerId: number; allianceId?: number | null }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(FLAG_KEY) === '1');
  const [supported] = useState(isSupported());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  // Diagnóstico siempre visible: qué dice Chrome REALMENTE (sin fiarnos del toggle)
  const [permNow, setPermNow] = useState<NotificationPermission | 'desconocido'>('desconocido');
  // Asistente de recuperación (solo cuando el permiso está denegado)
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardChecking, setWizardChecking] = useState(false);
  const [healed, setHealed] = useState(false);
  const subRef = useRef<(quiet?: boolean) => Promise<boolean>>(async () => false);

  // ---------- suscripción (extracto para reutilizar en toggle / auto-heal) ----------
  async function doSubscribe(quiet = false): Promise<boolean> {
    const show = (s: Step) => { if (!quiet) setStep(s); };
    if (Notification.permission === 'default') {
      show('permiso');
      const perm = await withTimeout(Notification.requestPermission(), 20000, 'permiso');
      setPermNow(Notification.permission);
      if (perm !== 'granted') {
        if (!quiet) setHint(perm === 'denied'
          ? 'El sistema denegó el permiso. Sigue el asistente de abajo para desbloquearlo.'
          : 'Permiso no concedido. Inténtalo de nuevo cuando quieras.');
        return false;
      }
    } else if (Notification.permission !== 'granted') {
      if (!quiet) setHint('El permiso está bloqueado. Sigue el asistente de abajo para desbloquearlo.');
      return false;
    }

    show('sw');
    const reg = await withTimeout(waitForSw(), 20000, 'sw');

    show('suscripcion');
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
      if (!quiet) setHint('El navegador devolvió una suscripción incompleta. Inténtalo de nuevo.');
      return false;
    }

    show('guardar');
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
      if (!quiet) setHint(`No se pudo guardar la suscripción en el servidor (${error.message.slice(0, 80)}). Revisa tu conexión e inténtalo de nuevo.`);
      return false;
    }
    localStorage.setItem(FLAG_KEY, '1');
    setEnabled(true);
    if (!quiet) {
      setStep('ok');
      setTimeout(() => setStep((s) => (s === 'ok' ? 'idle' : s)), 3000);
    } else {
      setHealed(true);
    }
    return true;
  }
  subRef.current = doSubscribe;

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

  // AUTO-HEAL: si Chrome dice "granted" pero el navegador no tiene suscripción
  // activa (reinstalación de la PWA, limpieza de datos, SW reemplazado), se
  // re-suscribe en silencio: el permiso ya está dado, NO sale ningún diálogo.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        if (Notification.permission !== 'granted') return;
        const reg = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const existing = await reg.pushManager.getSubscription();
        if (existing || cancelled) return;
        await subRef.current(true);
      } catch { /* noop: nunca romper la página por push */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, playerId]);

  if (!supported) return null;

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
      const ok = enabled ? await unsubscribe() : await doSubscribe();
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

  // ---------- asistente de recuperación (permiso denegado) ----------
  const WIZARD_STEPS = [
    {
      title: 'Paso 1 — Permiso de Android para Chrome',
      text: 'Las pushes salen por Chrome, no por la app. Ve a Ajustes de Android → Aplicaciones → Chrome → Notificaciones y actívalo (revisa también las categorías internas: "Sitios web" debe estar activada). Vuelve aquí y pulsa Comprobar.',
    },
    {
      title: 'Paso 2 — Desbloquear el sitio en Chrome',
      text: 'Abre alliancehub.app en una pestaña de Chrome (no la app instalada), toca el candado 🔒 → Configuración del sitio → Notificaciones → elige "Preguntar (por defecto)". Vuelve y pulsa Comprobar.',
    },
    {
      title: 'Paso 3 — Último recurso: resetear Chrome',
      text: 'Si sigue bloqueado, el estado interno de Chrome está corrupto: Ajustes → Aplicaciones → Chrome → Almacenamiento → Borrar caché; y si no basta, "Borrar datos" (cerrará tus sesiones de Chrome) o desinstala las actualizaciones de Chrome y actualízalo de nuevo. Vuelve y pulsa Comprobar.',
    },
  ];

  async function wizardCheck() {
    setWizardChecking(true);
    try {
      // Forzar relectura: la Permissions API emite 'change' sola, pero re-leemos
      // Notification.permission por si el cambio ya ocurrió con la app abierta.
      setPermNow(Notification.permission);
      if (Notification.permission === 'granted') {
        const ok = await doSubscribe();
        if (ok) { setWizardStep(0); setHint(null); return; }
      } else if (Notification.permission !== 'denied') {
        const ok = await doSubscribe(); // estado 'default': mostrará el diálogo
        if (ok) { setWizardStep(0); setHint(null); return; }
      }
      setWizardStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
    } finally {
      setWizardChecking(false);
    }
  }

  const showWizard = permNow === 'denied' && !busy;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, maxWidth: 460 }}>
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
      {healed && enabled && (
        <span style={{ fontSize: 12, color: colors.info }}>
          ℹ️ Detectamos que el permiso estaba activo sin suscripción y la hemos regenerado automáticamente.
        </span>
      )}
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
      {showWizard && (
        <span style={{
          display: 'block', fontSize: 12, color: colors.muted, background: colors.cardAlt,
          border: `1px solid ${colors.warning}`, borderRadius: 8, padding: '10px 12px',
        }}>
          <b style={{ color: colors.warning }}>🔓 Recuperar notificaciones</b>
          <br /><br />
          <b>{WIZARD_STEPS[wizardStep].title}</b>
          <br />
          {WIZARD_STEPS[wizardStep].text}
          <br /><br />
          <button
            type="button"
            onClick={wizardCheck}
            disabled={wizardChecking}
            style={{
              background: colors.accent, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: wizardChecking ? 'wait' : 'pointer',
            }}
          >
            {wizardChecking ? 'Comprobando…' : 'Comprobar'}
          </button>
        </span>
      )}
      <span style={{ fontSize: 11, color: colors.muted }}>
        Diagnóstico — permiso según Chrome: <b>{permNow}</b>
        {permNow === 'denied' && ' (bloqueado: sigue el asistente de recuperación)'}
        {permNow === 'default' && ' (aún sin decidir: al activar debería salir el diálogo del sistema)'}
        {permNow === 'granted' && ' (Chrome lo permite)'}
      </span>
    </div>
  );
}
