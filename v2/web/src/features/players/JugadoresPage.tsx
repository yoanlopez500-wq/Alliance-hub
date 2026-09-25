import { useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb, serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { colors, styles } from '../../theme';
import { Input } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';
import ExpedienteModal from '../../components/ExpedienteModal';

type Player = {
  id: number;
  current_username: string;
  current_alliance_id: string | null;
};

type Stat = { player_id: number; kills: number; deaths: number };

type Filtro = 'todos' | 'libres' | 'fichados';

/**
 * Mercado de transferencias — v2.
 * Tarjetas de jugador con estado (libre / fichado), K/D global y
 * expediente. Los libres son "invitables" directamente.
 */
export default function JugadoresPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const { data: players, loading, error } = useApi<Player[]>(async () => {
    const { data, error: e } = await publicDb
      .from('players')
      .select('id, current_username, current_alliance_id')
      .order('current_username');
    if (e) throw new Error(e.message);
    return data as Player[];
  }, []);

  const { data: stats } = useApi<Stat[]>(async () => {
    const { data, error: e } = await publicDb
      .from('public_rankings_view')
      .select('player_id, kills, deaths');
    if (e) return [];
    return (data ?? []) as Stat[];
  }, []);

  const statById = new Map((stats ?? []).map((s) => [s.player_id, s]));

  const filtered = (players ?? []).filter((p) => {
    const q = busqueda.toLowerCase();
    const matchQ = p.current_username.toLowerCase().includes(q) || String(p.id).includes(q);
    const matchF =
      filtro === 'todos' ? true :
      filtro === 'libres' ? !p.current_alliance_id :
      !!p.current_alliance_id;
    return matchQ && matchF;
  });

  const libres = (players ?? []).filter((p) => !p.current_alliance_id).length;

  async function invitar(playerId: number) {
    try {
      await serverApi.post('/invitations', { playerId });
      setInviteMsg('¡Invitación enviada! El jugador la verá destacada en su sección de Alianzas.');
      setSelected(null);
    } catch (e: any) {
      setInviteMsg(`No se pudo invitar: ${e.message}`);
    }
  }

  const tabs: { id: Filtro; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'libres', label: `Libres (${libres})` },
    { id: 'fichados', label: 'Fichados' },
  ];

  if (loading) return <Loader />;

  return (
    <div>
      {/* Cabecera */}
      <Reveal>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ color: colors.text, margin: 0 }}>Mercado de transferencias</h1>
          <p style={{ color: colors.muted, marginTop: 6 }}>
            Explora el plantel global, consulta el expediente de cada jugador y ficha a los libres para tu alianza.
          </p>
        </div>
      </Reveal>

      {/* Filtros */}
      <Reveal delay={60}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
          <Input
            placeholder="Buscar por nombre o ID…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ maxWidth: 320, flex: '1 1 200px' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setFiltro(t.id)}
                style={{
                  background: filtro === t.id ? colors.accent : colors.border,
                  color: filtro === t.id ? '#0a0e27' : colors.muted,
                  border: 'none', padding: '8px 16px', borderRadius: 999,
                  cursor: 'pointer', fontSize: 13, fontWeight: filtro === t.id ? 700 : 500,
                  transition: 'all 0.2s ease',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {inviteMsg && (
        <p onClick={() => setInviteMsg(null)} style={{
          background: 'rgba(129,199,132,0.12)', color: colors.success, padding: '10px 14px',
          borderRadius: 10, cursor: 'pointer',
        }}>{inviteMsg}</p>
      )}

      {/* Grid de tarjetas */}
      {filtered.length === 0 ? (
        <p style={{ color: colors.muted }}>Ningún jugador coincide con los filtros.</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 14,
        }}>
          {filtered.map((p, i) => {
            const s = statById.get(p.id);
            const kd = s && s.deaths > 0 ? (s.kills / s.deaths).toFixed(2) : s ? String(s.kills) : '—';
            const libre = !p.current_alliance_id;
            return (
              <Reveal key={p.id} delay={Math.min(i, 8) * 40}>
                <div
                  className="ah-glow-hover"
                  onClick={() => setSelected(p.id)}
                  style={{
                    ...styles.card, padding: 18, cursor: 'pointer',
                    borderTop: `3px solid ${libre ? colors.success : colors.accent}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, color: colors.text, fontSize: 16,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.current_username}
                      </div>
                      <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>ID {p.id}</div>
                    </div>
                    <Badge
                      label={libre ? 'LIBRE' : 'FICHADO'}
                      tone={libre ? 'active' : 'neutral'}
                    />
                  </div>
                  <div style={{
                    display: 'flex', gap: 18, marginTop: 14, paddingTop: 12,
                    borderTop: `1px solid ${colors.border}`,
                  }}>
                    <div>
                      <div style={{ color: colors.muted, fontSize: 11 }}>KILLS</div>
                      <div style={{ color: colors.text, fontWeight: 700 }}>{s?.kills ?? '—'}</div>
                    </div>
                    <div>
                      <div style={{ color: colors.muted, fontSize: 11 }}>DEATHS</div>
                      <div style={{ color: colors.text, fontWeight: 700 }}>{s?.deaths ?? '—'}</div>
                    </div>
                    <div>
                      <div style={{ color: colors.muted, fontSize: 11 }}>K/D</div>
                      <div style={{ color: colors.accent, fontWeight: 700 }}>{kd}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    {libre ? (
                      <span style={{ color: colors.success, fontSize: 13, fontWeight: 600 }}>
                        ⚡ Disponible para fichar
                      </span>
                    ) : (
                      <span style={{ color: colors.muted, fontSize: 13 }}>
                        ⛨ Bajo contrato con alianza
                      </span>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {selected && (
        <ExpedienteModal
          playerId={selected}
          onClose={() => setSelected(null)}
          onInvitar={invitar}
        />
      )}

      <p style={{ color: colors.muted, fontSize: 13, marginTop: 24 }}>
        ¿Buscas más detalle? <Link to="/rankings" style={{ color: colors.accent }}>Ver rankings globales</Link>
      </p>
    </div>
  );
}
