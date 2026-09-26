import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { edgeCall, getSessionToken, getStoredPlayerId } from '../../lib/api';
import { colors } from '../../theme';

type OfficerInvite = {
  code: string;
  role: string;
  alliances: { name: string; tag: string } | null;
};

/**
 * Banner de invitacion a oficial/co-lider para la sesion de JUGADOR.
 * El lider genero un codigo (admin_invites) para este player_id; aqui se
 * consulta con el token sellado y se ofrece el registro con el codigo ya
 * llenado, igual que el flujo de cuenta de lider.
 */
export default function OfficerInviteBanner() {
  const [invite, setInvite] = useState<OfficerInvite | null>(null);
  const active = !!getStoredPlayerId() && !!getSessionToken();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    edgeCall('my-officer-invite', {})
      .then((r) => { if (alive) setInvite((r?.data as OfficerInvite) ?? null); })
      .catch(() => { /* sin banner si falla */ });
    return () => { alive = false; };
  }, [active]);

  if (!invite) return null;

  const tag = invite.alliances?.tag ? `[${invite.alliances.tag}] ` : '';
  const roleLabel = invite.role === 'co_leader' ? '⭐ co-líder' : '🎖 oficial';

  return (
    <div style={{
      marginBottom: 20, border: `2px solid ${colors.purple}`, borderRadius: 14, padding: 16,
      background: 'rgba(168,85,247,0.08)',
    }}>
      <h3 style={{ margin: 0, color: colors.text }}>
        🎖 {tag}{invite.alliances?.name ?? 'Tu alianza'} te invitó a ser {roleLabel}
      </h3>
      <p style={{ color: colors.muted, fontSize: 13, margin: '6px 0 10px' }}>
        Completa tu registro — el código de invitación ya está puesto. Al terminar, tu botón 🛡 Admin
        abrirá las herramientas de {invite.role === 'co_leader' ? 'co-líder' : 'oficial'} de tu alianza.
      </p>
      <Link to={`/registro/oficial?code=${invite.code}`} style={{
        display: 'inline-block', background: colors.purple, color: '#fff', fontWeight: 700,
        padding: '9px 16px', borderRadius: 9, textDecoration: 'none', fontSize: 14,
      }}>
        Completar registro →
      </Link>
    </div>
  );
}
