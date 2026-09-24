import { serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';

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
          border: '2px solid #ff8f00', borderRadius: 14, padding: 16,
          background: 'rgba(255,143,0,0.08)',
          animation: 'ah2-pulse 2s ease-in-out infinite',
        }}>
          <style>{'@keyframes ah2-pulse { 0%,100% { box-shadow: 0 0 0 rgba(255,143,0,0); } 50% { box-shadow: 0 0 24px rgba(255,143,0,0.35); } }'}</style>
          <h3 style={{ margin: 0, color: '#ff8f00' }}>
            ⛨ ¡{inv.alliances?.name ?? 'Una alianza'} te ha invitado!
          </h3>
          {inv.message && <p style={{ color: '#e8eaf6', fontSize: 14 }}>{inv.message}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={async () => { await serverApi.post(`/invitations/${inv.id}/respond`, { action: 'accept' }); reload(); }}
              style={{ background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
            >Aceptar y unirme</button>
            <button
              onClick={async () => { await serverApi.post(`/invitations/${inv.id}/respond`, { action: 'decline' }); reload(); }}
              style={{ background: '#1a237e', color: '#e8eaf6', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >Rechazar</button>
            <a href={`/alianzas/${inv.alliances?.id}`} style={{ color: '#4fc3f7', alignSelf: 'center', fontSize: 14 }}>
              Ver perfil de la alianza →
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
