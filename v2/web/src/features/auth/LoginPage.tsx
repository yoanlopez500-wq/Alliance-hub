import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { serverApi, publicDb, setSessionToken, setAdminSessionMarker } from '../../lib/api';
import Button from '../../components/Button';
import { Input } from '../../components/Field';
import { styles, colors } from '../../theme';

const RESET_REDIRECT_URL = 'https://alliancehub.app/reset-password';
const INVITE_CODE_RE = /^AH[A-Z0-9]{6,10}$/i;
const AUTH_LINK_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: colors.accent,
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
  textDecoration: 'underline',
  textUnderlineOffset: 3,
};

/**
 * Login dual: jugador (id + nombre, RPC sellada del v1) o
 * admin (email + password, Supabase Auth).
 * La sesion persiste sola: el token de jugador vive 30 dias en localStorage
 * y la sesion Auth la guarda supabase-js (el autofill del SO puede rellenar
 * el password con huella, como antes de la big update).
 *
 * El registro admin sigue siendo SOLO por invitación: el panel de abajo
 * no crea cuentas abiertas, solo lleva el código AH... al flujo sellado
 * /registro/lider?code=... (RPC verify_leader_invite + edge function).
 */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'player' | 'admin'>(searchParams.get('mode') === 'admin' ? 'admin' : 'player');

  // Destino tras login de jugador: solo rutas internas (anti open-redirect).
  // Lo usan flujos como "solicitar liderazgo": aplica -> login -> continua.
  const redirectTo = (() => {
    const r = searchParams.get('redirect');
    return r && r.startsWith('/') && !r.startsWith('//') ? r : null;
  })();

  // Los botones verde/dorado del nav llegan con ?mode=
  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'admin' || m === 'player') setMode(m);
  }, [searchParams]);
  const [playerId, setPlayerId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adminPanel, setAdminPanel] = useState<'login' | 'reset' | 'invite'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function loginPlayer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await serverApi.post('/auth/player', { playerId: Number(playerId), displayName });
      setSessionToken(r.token, r.playerId);
      try { localStorage.setItem('ah2_player_name', displayName.trim()); } catch { /* noop */ }
      localStorage.setItem('ah2_nav_mode', 'player');
      window.location.href = redirectTo ?? '/';
    } catch (e2: any) {
      setError(e2.message);
    } finally { setBusy(false); }
  }

  async function loginAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { data, error: authErr } = await publicDb.auth.signInWithPassword({ email, password });
      if (authErr || !data.session) throw new Error(authErr?.message ?? 'login rechazado');
      setAdminSessionMarker();
      localStorage.setItem('ah2_nav_mode', 'admin');
      window.location.href = '/';
    } catch (e2: any) {
      setError(e2.message);
    } finally { setBusy(false); }
  }

  async function requestPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setResetNotice(null);
    setError(null);
    const target = resetEmail.trim();
    if (!target) {
      setResetNotice('Escribe el email de la cuenta admin.');
      return;
    }
    setResetBusy(true);
    try {
      const { error: resetErr } = await publicDb.auth.resetPasswordForEmail(target, {
        redirectTo: RESET_REDIRECT_URL,
      });
      if (resetErr) throw resetErr;
      setResetNotice('Si existe una cuenta admin con ese email, el enlace de recuperación acaba de enviarse. Revisa también spam.');
    } catch (e2: any) {
      setResetNotice('No se pudo enviar el enlace: ' + (e2?.message ?? e2));
    } finally {
      setResetBusy(false);
    }
  }

  function continueWithInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    const code = inviteCode.trim();
    if (!INVITE_CODE_RE.test(code)) {
      setInviteError('Formato inválido. Debe ser AH + 6 a 10 caracteres alfanuméricos.');
      return;
    }
    navigate(`/registro/lider?code=${encodeURIComponent(code)}`);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ ...styles.card, maxWidth: 380, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['player', 'admin'] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(null); setAdminPanel('login'); }} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700,
              background: mode === m ? colors.accentGradient : colors.border,
              color: mode === m ? '#fff' : colors.muted,
            }}>{m === 'player' ? 'Jugador' : 'Admin'}</button>
          ))}
        </div>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {mode === 'player' ? (
          <form onSubmit={loginPlayer}>
            <Input placeholder="Tu ID de jugador" value={playerId} onChange={(e) => setPlayerId(e.target.value)} required />
            <Input placeholder="Nombre visible" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <Button type="submit" disabled={busy} style={{ width: '100%' }}>Entrar como jugador</Button>
          </form>
        ) : adminPanel === 'reset' ? (
          <form onSubmit={requestPasswordReset}>
            <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
              Te enviaremos un enlace seguro para crear una contraseña nueva. No cambia nada hasta que abras el correo y guardes la nueva contraseña.
            </p>
            <Input type="email" placeholder="Email admin" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required autoComplete="email" />
            {resetNotice && (
              <p style={{ color: resetNotice.startsWith('Si existe') ? colors.success : colors.danger, fontSize: 13 }}>
                {resetNotice}
              </p>
            )}
            <Button type="submit" disabled={resetBusy} style={{ width: '100%' }}>
              {resetBusy ? 'Enviando…' : 'Enviar enlace de recuperación'}
            </Button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" style={AUTH_LINK_STYLE} onClick={() => { setAdminPanel('login'); setResetNotice(null); }}>
                Volver a iniciar sesión
              </button>
            </div>
          </form>
        ) : adminPanel === 'invite' ? (
          <form onSubmit={continueWithInvite}>
            <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
              El registro admin está cerrado al público. Solo continúa si un administrador te dio un código de invitación.
            </p>
            <Input placeholder="Código AH..." value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required autoCapitalize="characters" />
            {inviteError && <p style={{ color: colors.danger, fontSize: 13 }}>{inviteError}</p>}
            <Button type="submit" style={{ width: '100%' }}>Continuar con mi código</Button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" style={AUTH_LINK_STYLE} onClick={() => { setAdminPanel('login'); setInviteError(null); }}>
                Volver a iniciar sesión
              </button>
            </div>
          </form>
        ) : (
          <>
            <form onSubmit={loginAdmin}>
              <Input type="email" placeholder="Email admin" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              <Input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              <Button type="submit" disabled={busy} style={{ width: '100%' }}>Entrar como admin</Button>
            </form>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" style={AUTH_LINK_STYLE} onClick={() => { setAdminPanel('reset'); setError(null); }}>
                ¿Olvidaste tu contraseña?
              </button>
              <button type="button" style={AUTH_LINK_STYLE} onClick={() => { setAdminPanel('invite'); setError(null); }}>
                Registrar con código de invitación
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
