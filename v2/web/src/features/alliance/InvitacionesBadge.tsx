import { serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import Button from '../../components/Button';
import { colors } from '../../theme';

type Invitacion = {
  id: string;
  message: string | null;
  alliances: { id: string; name: string; tag: string; description: string | null } | null;
};

/**
 * Notificacion destacada de invitaciones para el JUGADOR (sesion Player).
 * Va en la seccion "Alianzas": resaltada, con aceptar/rechazar y acceso
 * al perfil publico de la alianza que invita.
 */
export default function InvitacionesBadge() {
  const { data, loading, error, reload } = useApi<Invitacion[]>(
    () => serverApi.get('/invitations/mine'),
    []
  );

  if (loading || error || !data || data.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {data.map((inv) => (
        <div key={inv.id} style={{
          border: `2px solid ${colors.accent}`, borderRadius: 14, padding: 16,
          background: 'rgba(255,143,0,0.08)',
          animation: 'ah2-pulse 2s ease-in-out infinite',
        }}>
          <style>{'@keyframes ah2-pulse { 0%,100% { box-shadow: 0 0 0 rgba(255,143,0,0); } 50% { box-shadow: 0 0 24px rgba(255,143,0,0.35); } }'}</style>
          <h3 style={{ margin: 0, color: colors.accent }}>
            ⛨ ¡{inv.alliances?.name ?? 'Una alianza'} te ha invitado!
          </h3>
          {inv.message && <p style={{ color: colors.text, fontSize: 14 }}>{inv.message}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={async () => { await serverApi.post(`/invitations/${inv.id}/respond`, { action: 'accept' }); reload(); }}>
              Aceptar y unirme
            </Button>
            <Button variant="ghost" onClick={async () => { await serverApi.post(`/invitations/${inv.id}/respond`, { action: 'decline' }); reload(); }}>
              Rechazar
            </Button>
            <a href={`/alianzas/${inv.alliances?.id}`} style={{ color: colors.info, fontSize: 14 }}>
              Ver perfil de la alianza →
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
