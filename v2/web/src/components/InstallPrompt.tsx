import { useEffect, useState } from 'react';
import { colors } from '../theme';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'ah_install_dismissed_at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // vuelve a aparecer a los 7 dias

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  // iOS Safari: no soporta matchMedia(display-mode) en versiones antiguas
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * Banner de instalacion PWA.
 * - Android/Chrome: captura beforeinstallprompt y ofrece el dialogo nativo.
 * - iOS: no hay beforeinstallprompt; se muestran instrucciones manuales
 *   (Compartir > Anadir a pantalla de inicio). En iOS el push SOLO funciona
 *   con la app instalada, asi que el banner lo deja claro.
 * - Si ya esta instalado, no se muestra nada.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isInstalled);
  const [dismissed, setDismissed] = useState(() => {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_MS;
  });
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (installed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [installed]);

  if (installed || dismissed) return null;

  // En iOS no existe evento de instalacion: se ofrece siempre la ayuda manual.
  const canPrompt = !!deferred;
  const ios = isIos();

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      setDeferred(null);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  const banner: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    background: `linear-gradient(135deg, ${colors.accent}22, ${colors.success}18)`,
    border: `1px solid ${colors.accent}55`, borderRadius: 12,
    padding: '10px 14px', marginBottom: 16, fontSize: 13,
  };

  return (
    <>
      <div style={banner} role="complementary" aria-label="Instalar app">
        <span style={{ fontSize: 20 }}>📲</span>
        <span style={{ flex: 1, minWidth: 200 }}>
          <strong>Instala Alliance Hub</strong> en tu teléfono:
          acceso directo, avisos de partidas, strikes y resultados{' '}
          <strong>al instante</strong> aunque no uses la app.
        </span>
        {canPrompt && (
          <button type="button" onClick={install} style={{
            background: colors.accent, color: '#08131f', border: 'none', borderRadius: 20,
            padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0,
          }}>Instalar</button>
        )}
        {ios && !canPrompt && (
          <button type="button" onClick={() => setShowIosHelp(v => !v)} style={{
            background: colors.success, color: '#08130a', border: 'none', borderRadius: 20,
            padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0,
          }}>Cómo instalar en iPhone/iPad</button>
        )}
        <button type="button" onClick={dismiss} aria-label="Cerrar aviso" style={{
          background: 'transparent', border: 'none', color: colors.muted,
          fontSize: 16, cursor: 'pointer', padding: '4px 8px', flexShrink: 0,
        }}>✕</button>
      </div>
      {showIosHelp && (
        <div style={{
          border: `1px solid ${colors.border}`, borderRadius: 12, padding: '12px 16px',
          marginTop: -10, marginBottom: 16, fontSize: 13, color: colors.text,
          background: colors.card,
        }}>
          <strong>Instalar en iOS (Safari):</strong>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Toca el botón <strong>Compartir</strong> (cuadrado con flecha hacia arriba) en la barra de Safari.</li>
            <li>Baja y toca <strong>«Añadir a pantalla de inicio»</strong>.</li>
            <li>Confirma con <strong>Añadir</strong>.</li>
          </ol>
          <p style={{ margin: '8px 0 0', color: colors.muted }}>
            ⚠️ En iPhone/iPad las notificaciones solo funcionan dentro de la app instalada,
            y necesitas iOS 16.4 o superior. Abre Alliance Hub desde el icono nuevo y activa
            las notificaciones desde el panel.
          </p>
        </div>
      )}
    </>
  );
}
