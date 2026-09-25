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
}

/** RegisterLeaderPage — puerto de register-leader.js (signup de líder con código de invitación). */
export default function RegisterLeaderPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inviteCode = params.get('code');

  const [state, setState] = useState<'loading' | 'error' | 'form'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        setInvite({ player_id: playerId, username, alliance_name: inv.alliance_name || '', supremacy_id: supremacyId });
        setState('form');
      } catch (e: any) {
        console.error('[verifyInvite]', e);
        setErrorMsg('Error verificando invitación: ' + e.message);
        setState('error');
      }
    })();
  }, [inviteCode]);

  async function signupViaEdgeFunction(email: string, password: string, code: string, displayName: string | null) {
    try {
      const resp = await fetch((import.meta.env.VITE_SUPABASE_URL ?? '') + '/functions/v1/complete-leader-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, inviteCode: code, displayName }),
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
    if (!email || !password || password.length < 6) {
      setFormError('Email válido y contraseña de mínimo 6 caracteres son requeridos.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signupViaEdgeFunction(email, password, inviteCode!, invite?.username || null);
      if (result.success) {
        setTimeout(() => navigate('/admin/leader-dashboard'), 1500);
      } else {
        setFormError(result.message || 'Error al crear la cuenta.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ ...styles.card, padding: 32 }}>
        <h1 style={{ fontSize: 24, margin: '0 0 8px', textAlign: 'center' }}>Registro de Líder</h1>

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
              Has sido invitado a liderar <strong style={{ color: colors.accent }}>{invite.alliance_name}</strong>
            </p>
            {invite.username && (
              <p style={{ textAlign: 'center', fontSize: 14 }}>Jugador: <strong>{invite.username}</strong>{invite.supremacy_id ? ` (ID: ${invite.supremacy_id})` : ''}</p>
            )}
            <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Email *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
              <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Contraseña * (mín. 6 caracteres)</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 16 }} />
              {formError && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{formError}</div>}
              <Button type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Creando cuenta…' : 'Crear cuenta de líder'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
