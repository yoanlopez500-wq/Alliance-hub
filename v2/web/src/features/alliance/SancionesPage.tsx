import { useState } from 'react';
import { serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import Badge from '../../components/Badge';

type Strike = { id: string; reason: string; status: string; applied_at: string; players?: { current_username: string } };

/**
 * Sanciones de la alianza (vista lider/oficial). Aislada por diseno:
 * el server solo devuelve las de TU alianza.
 */
export default function SancionesPage({ allianceId }: { allianceId: string }) {
  const [playerId, setPlayerId] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: strikes, loading, error, reload } = useApi<Strike[]>(
    () => serverApi.get(`/alliances/${allianceId}/strikes`),
    [allianceId]
  );

  async function ponerStrike(e: React.FormEvent) {
    e.preventDefault();
    try {
      await serverApi.post(`/alliances/${allianceId}/strikes`, {
        playerId: Number(playerId), reason,
      });
      setFeedback('Strike registrado. Solo tu alianza y plataforma lo ven.');
      setPlayerId(''); setReason('');
      reload();
    } catch (e2: any) {
      setFeedback(`Error: ${e2.message}`);
    }
  }

  return (
    <div>
      <h1 style={{ color: '#fff' }}>Sanciones de la alianza</h1>
      <p style={{ color: '#9fa8da', marginTop: -8 }}>
        Aisladas: ninguna otra alianza puede verlas. Puedes usar los tipos de falta estándar de la liga o los tuyos.
      </p>
      {error && <p style={{ color: '#ef5350' }}>{error}</p>}
      {feedback && <p style={{ color: '#4fc3f7' }}>{feedback}</p>}

      <form onSubmit={ponerStrike} style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
        background: '#11183a', padding: 14, borderRadius: 12, border: '1px solid #1a237e',
      }}>
        <input
          placeholder="ID del jugador miembro" value={playerId} onChange={(e) => setPlayerId(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e', background: '#0d1330', color: '#e8eaf6' }}
        />
        <input
          placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)}
          style={{ flex: 3, minWidth: 240, padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e', background: '#0d1330', color: '#e8eaf6' }}
        />
        <button type="submit" style={{
          background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff',
          border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
        }}>Registrar strike</button>
      </form>

      <DataTable<Strike>
        rows={strikes}
        loading={loading}
        empty="La alianza no tiene strikes registrados"
        columns={[
          { key: 'player', header: 'Jugador', render: (s) => s.players?.current_username ?? '—' },
          { key: 'reason', header: 'Motivo' },
          {
            key: 'status', header: 'Estado',
            render: (s) => <Badge label={s.status} tone={s.status === 'active' ? 'danger' : 'neutral'} />,
          },
          {
            key: 'applied_at', header: 'Fecha',
            render: (s) => new Date(s.applied_at).toLocaleDateString('es'),
          },
        ]}
      />
    </div>
  );
}
