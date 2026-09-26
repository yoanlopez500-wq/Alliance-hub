import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb, serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { colors, styles } from '../../theme';
import { Input, Select } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';
import ExpedienteModal from '../../components/ExpedienteModal';
import SortExplainer, { type ExplainerMode } from '../../components/SortExplainer';
import { compareBy, makeBayesScorer, SORT_MODES, type SortMode } from '../../lib/ranking';

type Player = {
  id: number;
  current_username: string;
  current_alliance_id: string | null;
};

type PlayerMetric = {
  player_id: number;
  games: number | string;
  kills: number | string;
  deaths: number | string;
  kd: number | string;
  avg_kills: number | string;
  power: number | string;
  bayes_kd: number | string;
};

type PodiumRow = {
  player_id: number;
  podium_1: number | string;
  podium_2: number | string;
  podium_3: number | string;
};

type PlayerRow = Player & {
  games: number;
  kills: number;
  deaths: number;
  kd: number;
  avg: number;
  power: number;
  score: number;
  p1: number;
  p2: number;
  p3: number;
};

type Filtro = 'todos' | 'libres' | 'fichados';
type MercadoSort = 'directory' | SortMode;

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

/**
 * Mercado de transferencias — v2.
 * Tarjetas de jugador con estado (libre / fichado), K/D global,
 * podios y expediente. Los libres son "invitables" directamente.
 */
export default function JugadoresPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [sortMode, setSortMode] = useState<MercadoSort>('directory');
  const [showSortHelp, setShowSortHelp] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const { data: players, loading, error } = useApi<Player[]>(async () => {
    const { data, error: e } = await publicDb
      .from('players')
      .select('id, current_username, current_alliance_id')
      .order('current_username');
    if (e) throw new Error(e.message);
    return data as Player[];
  }, []);

  const { data: metrics } = useApi<PlayerMetric[]>(async () => {
    const { data, error: e } = await publicDb.from('public_player_metric_view').select('*');
    if (e) return [];
    return (data ?? []) as PlayerMetric[];
  }, []);

  const { data: podiums } = useApi<PodiumRow[]>(async () => {
    const { data, error: e } = await publicDb.from('public_player_podium_stats').select('*');
    if (e) return [];
    return (data ?? []) as PodiumRow[];
  }, []);

  // Resumen de sanciones GLOBALES (publicas) para la tarjeta.
  const { data: strikes } = useApi<{ player_id: number }[]>(async () => {
    const { data, error: e } = await publicDb
      .from('player_strikes')
      .select('player_id')
      .eq('status', 'active')
      // Solo las GLOBALES (alliance_id NULL): las privadas de alianza no
      // se anuncian en la tarjeta del mercado.
      .is('alliance_id', null);
    if (e) return [];
    return (data ?? []) as { player_id: number }[];
  }, []);

  const strikesByPlayer = new Map<number, number>();
  for (const s of strikes ?? []) {
    strikesByPlayer.set(s.player_id, (strikesByPlayer.get(s.player_id) ?? 0) + 1);
  }

  const metricByPlayer = useMemo(() => {
    const map = new Map<number, PlayerMetric>();
    (metrics ?? []).forEach((m) => map.set(Number(m.player_id), m));
    return map;
  }, [metrics]);

  const podiumByPlayer = useMemo(() => {
    const map = new Map<number, PodiumRow>();
    (podiums ?? []).forEach((p) => map.set(Number(p.player_id), p));
    return map;
  }, [podiums]);

  const { rows, priors } = useMemo(() => {
    const base: PlayerRow[] = (players ?? []).map((p) => {
      const m = metricByPlayer.get(p.id);
      const pod = podiumByPlayer.get(p.id);
      return {
        ...p,
        games: num(m?.games),
        kills: num(m?.kills),
        deaths: num(m?.deaths),
        kd: num(m?.kd),
        avg: num(m?.avg_kills),
        power: num(m?.power),
        score: 0,
        p1: num(pod?.podium_1),
        p2: num(pod?.podium_2),
        p3: num(pod?.podium_3),
      };
    });
    const scorer = makeBayesScorer(base, {
      eff: (r) => r.kills,
      deaths: (r) => r.deaths,
      games: (r) => r.games,
    });
    const withScore = base.map((r) => ({ ...r, score: scorer.score(r) }));
    const sorted = sortMode === 'directory'
      ? withScore.slice().sort((a, b) => a.current_username.localeCompare(b.current_username) || a.id - b.id)
      : withScore.slice().sort(compareBy(sortMode, {
          score: (r) => r.score,
          games: (r) => r.games,
          deaths: (r) => r.deaths,
          eff: (r) => r.kills,
          name: (r) => r.current_username,
        }));
    return { rows: sorted, priors: { priorK: scorer.priorK, priorD: scorer.priorD, C: scorer.C } };
  }, [players, metricByPlayer, podiumByPlayer, sortMode]);

  const filtered = rows.filter((p) => {
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

  const explainerModes: ExplainerMode[] = [
    {
      id: 'directory',
      label: 'Directorio A-Z',
      explain: 'Orden alfabetico por nombre visible de jugador. Es el modo mas comodo para explorar y buscar fichajes.',
      example: 'Si dos nombres coinciden, gana el ID numerico mas bajo.',
    },
    ...(SORT_MODES as unknown as ExplainerMode[]),
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <Input
            placeholder="Buscar por nombre o ID…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ maxWidth: 320, flex: '1 1 200px', marginBottom: 0 }}
          />
          <Select value={sortMode} onChange={(e) => setSortMode(e.target.value as MercadoSort)} style={{ width: 190, marginBottom: 0 }}>
            <option value="directory">Directorio A-Z</option>
            {SORT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
          <button onClick={() => setShowSortHelp((v) => !v)} style={{ ...styles.btnGhost, padding: '8px 12px', marginBottom: 0 }} title="Como funciona este orden">ⓘ</button>
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

      {showSortHelp && (
        <SortExplainer
          activeId={sortMode}
          modes={explainerModes}
          priors={priors}
          note={sortMode === 'directory' ? undefined : 'En Mercado este orden usa estadísticas públicas crudas; las sanciones globales se muestran como aviso en la tarjeta.'}
        />
      )}

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
            const libre = !p.current_alliance_id;
            const nStrikes = strikesByPlayer.get(p.id) ?? 0;
            const hasStats = p.games > 0 || p.kills > 0 || p.deaths > 0 || (p.p1 + p.p2 + p.p3) > 0;
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
                  <div style={{ marginTop: 8, fontSize: 12, color: hasStats ? colors.muted : colors.border }}>
                    {hasStats ? (
                      <>K/D {p.kd.toFixed(2)} · {p.games} partidas · 🥇{p.p1} 🥈{p.p2} 🥉{p.p3}</>
                    ) : (
                      'Sin partidas validas todavia'
                    )}
                  </div>
                  <div style={{
                    marginTop: 12, paddingTop: 12,
                    borderTop: `1px solid ${colors.border}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    {nStrikes > 0 ? (
                      <span style={{ color: colors.danger, fontSize: 13, fontWeight: 600 }}>
                        ⚠ {nStrikes} sanción{nStrikes !== 1 ? 'es' : ''} global{nStrikes !== 1 ? 'es' : ''} activa{nStrikes !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span style={{ color: colors.success, fontSize: 13 }}>✓ Sin sanciones globales</span>
                    )}
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
