import { useState } from 'react';
import { publicDb, serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import ExpedienteModal from '../../components/ExpedienteModal';

type Player = { id: number; current_username: string; current_alliance_id: string | null };

/**
 * Mercado de transferencias: lista global de jugadores -> expediente -> invitar.
 * Lista via anon key (dato publico del v1); expediente e invitacion via server v2.
 */
export default function JugadoresPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const { data: players, loading, error } = useApi<Player[]>(async () => {
    const { data, error: e } = await publicDb
      .from('players')
      .select('id, current_username, current_alliance_id')
      .order('current_username');
    if (e) throw new Error(e.message);
    return data as Player[];
  }, []);

  const filtered = (players ?? []).filter((p) =>
    p.current_username.toLowerCase().includes(busqueda.toLowerCase())
  );

  async function invitar(playerId: number) {
    try {
      await serverApi.post('/invitations', { playerId });
      setInviteMsg('¡Invitación enviada! El jugador la verá destacada en su sección de Alianzas.');
      setSelected(null);
    } catch (e: any) {
      setInviteMsg(`No se pudo invitar: ${e.message}`);
    }
  }

  return (
    <div>
      <h1 style={{ color: '#fff' }}>Jugadores</h1>
      <p style={{ color: '#9fa8da', marginTop: -8 }}>Toca un jugador para ver su expediente completo.</p>
      <input
        placeholder="Buscar por nombre…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        style={{
          width: '100%', maxWidth: 380, marginBottom: 16, padding: '10px 14px',
          borderRadius: 10, border: '1px solid #1a237e', background: '#11183a', color: '#e8eaf6',
        }}
      />
      {error && <p style={{ color: '#ef5350' }}>{error}</p>}
      {inviteMsg && (
        <p onClick={() => setInviteMsg(null)} style={{
          background: 'rgba(76,175,80,0.12)', color: '#81c784', padding: '10px 14px',
          borderRadius: 10, cursor: 'pointer',
        }}>{inviteMsg}</p>
      )}
      <DataTable<Player>
        rows={filtered}
        loading={loading}
        empty="Ningún jugador coincide con la búsqueda"
        onRowClick={(p) => setSelected(p.id)}
        columns={[
          { key: 'current_username', header: 'Jugador' },
          { key: 'id', header: 'ID' },
          {
            key: 'current_alliance_id', header: 'Alianza',
            render: (p) => p.current_alliance_id
              ? <span style={{ color: '#ff8f00' }}>⛨ Miembro</span>
              : <span style={{ color: '#81c784' }}>Libre — invitable</span>,
          },
        ]}
      />
      {selected && (
        <ExpedienteModal
          playerId={selected}
          onClose={() => setSelected(null)}
          onInvitar={invitar}
        />
      )}
    </div>
  );
}
