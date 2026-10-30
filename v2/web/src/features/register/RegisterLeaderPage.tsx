import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import { Input } from '../../components/Field';
import Loader from '../../components/Loader';

interface InviteInfo {
  player_id: number | null;
  username: string;
  alliance_name: string;
  supremacy_id: number | null;
  role: string | null;
}

function roleLabel(role: string | null | undefined) {
  if (role === 'event_admin') return 'Event Admin';
  if (role === 'moderator') return 'Moderador';
  return 'Líder de alianza';
}

/** RegisterLeaderPage — puerto de register-leader.js (signup admin SOLO con código de invitación). */
export default function RegisterLeaderPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inviteCode = params.get('code');

  const [state, setState] = useState<'loading' | 'error' | 'form'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [discordUserId, setDiscordUserId] = useState('');
  const [supremacyId, setSupremacyId] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!inviteCode) {
        setErrorMsg('No se proporcionó un código de invitación.');
        setState('error');
        return;
      }
      // Formato: AH + 6 a 10 alfanuméricos (acepta AH+10 actual y AH+6 legacy)
      if (!/^AH[A-Z0-9]{6,10}$/i.test(inviteCode)) {
        setErrorMsg('Formato de código inválido. Debe ser AH + 6 a 10 caracteres alfanuméricos.');
        setState('error');
        return;
      }
      try {
        // Verificación via RPC acotado (admin_invites no legible con anon key)
        const { data: inviteRows, error } = await publicDb.rpc('verify_leader_invite', { p_code: inviteCode });
        if (error) throw error;
        const inv = (inviteRows as any[])?.[0] || null;
        if (!inv) {
          setErrorMsg('Código inválido, ya usado o expirado.');
          setState('error');
          return;
        }
        const playerId = inv.player_id as number | null;
        let username = '';
        let supremacyId: number | null = null;
        if (playerId) {
          const { data: player } = await publicDb.from('players').select('current_username, id').eq('id', playerId).maybeSingle();
          if (player) {
            username = (player as { current_username: string }).current_username || '';
            supremacyId = (player as { id: number }).id;
          }
        }
        setInvite({
          player_id: playerId,
          username,
          alliance_name: inv.alliance_name || '',
          supremacy_id: supremacyId,
          role: inv.role || null,
        });
        // Nombre visible: precargado con el username del invite (si existe).
        // Quien se registra lo confirma o lo ajusta; nunca se cae al email.
        setDisplayName(username);
        setState('form');
      } catch (e: any) {
        console.error('[verifyInvite]', e);
        setErrorMsg('Error verificando invitación: ' + e.message);
        setState('error');
      }
    })();
  }, [inviteCode]);

  async function signupViaEdgeFunction(payload: {
    email: string; password: string; code: string; displayName: string;
    discordUserId: string; supremacyId: string;
  }) {
    try {
      const resp = await fetch((import.meta.env.VITE_SUPABASE_URL ?? '') + '/functions/v1/complete-leader-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: payload.email,
          password: payload.password,
          inviteCode: payload.code,
          displayName: payload.displayName,
          discordUserId: payload.discordUserId || undefined,
          // Solo se envía cuando el invite no trae jugador vinculado;
          // la edge function ignora cualquier valor en caso contrario.
          supremacyId: invite?.player_id == null && payload.supremacyId ? payload.supremacyId : undefined,
        }),
      });
      let data: any = {};
      try { data = await resp.json(); } catch { data = {}; }
      if (resp.ok && data?.success) {
        return { success: true, message: data.message || 'Cuenta creada exitosamente.' };
      }
      let msg = data?.error || 'Error al crear la cuenta (HTTP ' + resp.status + ').';
      if (resp.status === 409) msg = 'Ese email ya tiene cuenta, inicia sesión.';
      return { success: false, message: msg };
    } catch (e: any) {
      console.error('[signupViaEdgeFunction]', e);
      return { success: false, message: 'Error de red al crear la cuenta: ' + e.message };
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const name = displayName.trim();
    if (!name) {
      setFormError('El nombre visible es obligatorio.');
      return;
    }
    if (!email || !password || password.length < 6) {
      setFormError('Email válido y contraseña de mínimo 6 caracteres son requeridos.');
      return;
    }
    if (password !== password2) {
      setFormError('Las contraseñas no coinciden.');
      return;
    }
    const discord = discordUserId.trim();
    if (discord && !/^[0-9]{5,25}$/.test(discord)) {
      setFormError('ID de Discord inválido: solo números (5-25 dígitos).');
      return;
    }
    if (invite?.player_id == null && supremacyId.trim()) {
      const parsed = Number(supremacyId.trim());
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setFormError('ID de jugador inválido. Debe ser un número positivo.');
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await signupViaEdgeFunction({
        email: email.trim(),
        password,
        code: inviteCode!,
        displayName: name,
        discordUserId: discord,
        supremacyId: supremacyId.trim(),
      });
      if (result.success) {
        // La cuenta ya existe; entrar directo para que el panel funcione
        // en cuanto aterriza (createUser por admin API no abre sesion).
        try {
          await publicDb.auth.signInWithPassword({ email, password });
        } catch { /* si falla, el login queda a mano */ }
        const isAllianceLeader = !invite?.role || invite.role === 'alliance_leader';
        setTimeout(() => navigate(isAllianceLeader ? '/admin/leader-dashboard' : '/admin'), 1500);
      } else {
        setFormError(result.message || 'Error al crear la cuenta.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const label = roleLabel(invite?.role);
  const isAllianceLeader = !invite?.role || invite.role === 'alliance_leader';

  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ ...styles.card, padding: 32 }}>
        <h1 style={{ fontSize: 24, margin: '0 0 8px', textAlign: 'center' }}>Registro de {label}</h1>

        {state === 'loading' && <Loader label="Verificando invitación…" />}

        {state === 'error' && (
          <div style={{ textAlign: 'center', color: colors.danger }}>
            <p style={{ fontSize: 32, margin: 0 }}>⚠️</p>
            <p>{errorMsg}</p>
          </div>
        )}

        {state === 'form' && invite && (
          <>
            <p style={{ textAlign: 'center', color: colors.muted, fontSize: 14 }}>
              {isAllianceLeader ? (
                <>Has sido invitado a liderar <strong style={{ color: colors.accent }}>{invite.alliance_name}</strong></>
              ) : (
                <>Has sido invitado como <strong style={{ color: colors.accent }}>{label}</strong> del staff de AllianceHub</>
              )}
            </p>
            {/* Datos precargados por la invitación (solo lectura, como en la v1) */}
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>ID de Jugador</label>
              <Input
                type="text"
                readOnly
                value={invite.player_id != null ? String(invite.supremacy_id ?? invite.player_id) : '— (sin jugador vinculado)'}
                style={{ width: '100%', marginBottom: 12, opacity: 0.7 }}
              />
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Alianza</label>
              <Input
                type="text"
                readOnly
                value={invite.alliance_name || '—'}
                style={{ width: '100%', marginBottom: 12, opacity: 0.7 }}
              />
            </div>
            <form onSubmit={onSubmit} style={{ marginTop: 8 }}>
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Nombre visible * (cómo te verán en el panel)</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} style={{ width: '100%', marginBottom: 12 }} placeholder="Ej: Matadoremio" />
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Email *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Contraseña * (mín. 6 caracteres)</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Repetir contraseña *</label>
              <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
              {invite.player_id == null && (
                <>
                  <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Tu ID de Supremacy (opcional)</label>
                  <Input
                    type="number"
                    min={1}
                    value={supremacyId}
                    onChange={(e) => setSupremacyId(e.target.value)}
                    style={{ width: '100%', marginBottom: 12 }}
                    placeholder="Solo si quieres vincular tu jugador"
                  />
                </>
              )}
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Discord (opcional — ID numérico para DMs del bot)</label>
              <Input value={discordUserId} onChange={(e) => setDiscordUserId(e.target.value)} style={{ width: '100%', marginBottom: 16 }} placeholder="Ej: 123456789012345678" />
              {formError && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{formError}</div>}
              <Button type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Creando cuenta…' : `Crear cuenta de ${label.toLowerCase()}`}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
