import { serverApi } from '../lib/api';
import { useApi } from '../hooks/useApi';
import Badge from './Badge';
import Loader from './Loader';

type Expediente = {
  player: { id: number; current_username: string; created_at: string };
  alliance: { id: string; name: string; tag: string } | null;
  estadisticas: { partidas: number; kills: number; deaths: number; kd: number };
  partidas: { id: string; name: string; match_type: string; status: string }[];
  strikes: { id: string; reason: string; status: string; alliance_id: string | null; applied_at: string }[];
  puede_ser_invitado: boolean;
};

/**
 * Expediente de jugador: componente REUTILIZABLE (mercado, perfil, admin).
 * El server ya aplica las reglas: globales para todos, de alianza solo
 * para el staff de esa alianza (contexto de transferencia).
 */
export default function ExpedienteModal({ playerId, onClose, onInvitar }: {
  playerId: number;
  onClose: () => void;
  onInvitar?: (playerId: number) => void;
}) {
  const { data, loading, error } = useApi<Expediente>(
    () => serverApi.get(`/players/${playerId}/expediente`),
    [playerId]
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(4,6,20,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: '#0d1330', border: '1px solid #1a237e', borderRadius: 16,
        maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 24,
      }} onClick={(e) => e.stopPropagation()}>
        {loading && <Loader label="Abriendo expediente…" />}
        {error && <p style={{ color: '#ef5350' }}>{error}</p>}
        {data && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff' }}>{data.player.current_username}</h2>
                <p style={{ margin: '4px 0 0', color: '#9fa8da', fontSize: 13 }}>
                  {data.alliance ? `⛨ ${data.alliance.name} [${data.alliance.tag}]` : 'Sin alianza'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {data.puede_ser_invitado && onInvitar && (
                  <button onClick={() => onInvitar(playerId)} style={btnAccent}>Invitar</button>
                )}
                <button onClick={onClose} style={btnGhost}>Cerrar</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
              <Stat label="Partidas" value={data.estadisticas.partidas} />
              <Stat label="Kills" value={data.estadisticas.kills} />
              <Stat label="Deaths" value={data.estadisticas.deaths} />
              <Stat label="K/D" value={data.estadisticas.kd.toFixed(2)} />
            </div>

            <Section title={`Partidas (${data.partidas.length})`}>
              {data.partidas.map((m) => (
                <div key={m.id} style={rowStyle}>
                  <span>{m.name}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Badge label={m.match_type} />
                    <Badge label={m.status} tone={m.status === 'finished' ? 'active' : 'pending'} />
                  </span>
                </div>
              ))}
            </Section>

            <Section title={`Strikes (${data.strikes.length})`}>
              {data.strikes.length === 0 && <p style={{ color: '#9fa8da', fontSize: 13 }}>Sin strikes registrados.</p>}
              {data.strikes.map((s) => (
                <div key={s.id} style={rowStyle}>
                  <span>{s.reason}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {s.alliance_id
                      ? <Badge label="de alianza" tone="exclusive" />
                      : <Badge label="liga" tone="global" />}
                    <Badge label={s.status} tone={s.status === 'active' ? 'danger' : 'neutral'} />
                  </span>
                </div>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

const btnAccent: React.CSSProperties = {
  background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff', border: 'none',
  padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: '#1a237e', color: '#e8eaf6', border: 'none',
  padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
};
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 0', borderBottom: '1px solid #1a237e', color: '#e8eaf6', fontSize: 14,
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: '#11183a', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#ff8f00' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9fa8da' }}>{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h3 style={{ fontSize: 13, color: '#9fa8da', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h3>
      {children}
    </div>
  );
}
