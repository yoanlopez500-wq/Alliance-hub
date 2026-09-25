import { useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { usePlayerSession } from '../../lib/playerSession';
import { colors, styles } from '../../theme';
import { formatDate, STATUS_LABELS, STATUS_COLORS, TYPE_LABELS, badgeStyle } from '../../lib/format';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import Reveal from '../../components/Reveal';
import PushToggle from '../../components/PushToggle';

type Match = {
  id: string; name: string; status: string; match_type: string | null;
  category: string | null; alliance_id: string | null; max_players: number | null;
  created_at: string; _fromAlliance?: boolean;
};
type Alliance = { id: string; name: string; tag: string };

const FILTER_KEY = 'ah_match_filter';
const FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'alliance_hub', label: 'Alliance Hub' },
  { value: 'batallon', label: 'Batallon' },
];

function getFilter(): string {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    return (v === 'alliance_hub' || v === 'batallon') ? v : 'all';
  } catch { return 'all'; }
}

/**
 * Dashboard (puerto de dashboard.js v1): partidas publicas + las de la
 * alianza del jugador identificado (al final, badge "DE TU ALIANZA"),
 * filtro por categoria persistente y switch de push.
 */
export default function DashboardPage() {
  const [filter, setFilter] = useState(getFilter());
  const { session } = usePlayerSession();

  const { data, loading, error, reload } = useApi<{ matches: Match[]; alliances: Alliance[] }>(async () => {
    const [{ data: pub, error: e1 }, { data: als, error: e2 }] = await Promise.all([
      publicDb.from('public_matches_view').select('id, name, status, match_type, category, alliance_id, max_players, created_at').order('created_at', { ascending: false }).limit(50),
      publicDb.from('alliances').select('id, name, tag'),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    const matches = [...((pub as Match[] | null) ?? [])];

    // Partidas de la alianza del jugador (append, sin duplicar)
    const pid = session?.playerId ?? Number(localStorage.getItem('ah2_player_id'));
    if (pid) {
      try {
        const { data: player } = await publicDb.from('players').select('id, current_alliance_id').eq('id', pid).maybeSingle();
        if (player?.current_alliance_id) {
          const { data: am } = await publicDb.from('matches')
            .select('id, name, status, match_type, category, alliance_id, max_players, created_at')
            .eq('alliance_id', player.current_alliance_id)
            .order('created_at', { ascending: false }).limit(50);
          const seen = new Set(matches.map((m) => m.id));
          ((am as Match[] | null) ?? []).forEach((m) => {
            if (!seen.has(m.id)) matches.push({ ...m, _fromAlliance: true });
          });
        }
      } catch { /* fallo silencioso: solo publicas, como el v1 */ }
    }
    return { matches, alliances: (als as Alliance[]) ?? [] };
  }, [session?.playerId]);

  const alliances = new Map((data?.alliances ?? []).map((a) => [a.id, a]));
  const filtered = (data?.matches ?? []).filter((m) => filter === 'all' || (m.category ?? 'alliance_hub') === filter);

  return (
    <div>
      <Reveal>
        <h1 style={{ color: colors.text }}>🎮 Partidas</h1>
        <div style={{ margin: '12px 0' }}>{session?.playerId && <PushToggle playerId={session.playerId} />}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {FILTERS.map((f) => {
            const active = f.value === filter;
            return (
              <button key={f.value} onClick={() => { setFilter(f.value); try { localStorage.setItem(FILTER_KEY, f.value); } catch { /* noop */ } }}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: active ? colors.accentGradient : colors.cardAlt,
                  color: active ? '#fff' : colors.muted,
                  boxShadow: active ? undefined : `inset 0 0 0 1px ${colors.border}`,
                }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </Reveal>
      {error && <p style={{ color: colors.danger }}>{error} <button onClick={reload} style={{ ...styles.btnGhost, marginLeft: 8 }}>Reintentar</button></p>}
      {loading && <Loader />}
      {!loading && filtered.length === 0 && <EmptyState message="No hay partidas registradas" />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {filtered.map((m, i) => {
          const al = m.alliance_id ? alliances.get(m.alliance_id) : null;
          const st = STATUS_COLORS[m.status] ?? { bg: 'rgba(255,193,7,0.15)', color: '#ffd54f' };
          return (
            <Reveal key={m.id} delay={Math.min(i, 8) * 40}>
              <Link to={`/partidas/${m.id}`} className="ah-glow-hover" style={{
                display: 'block', borderRadius: 12, padding: 16, textDecoration: 'none',
                background: colors.cardAlt, border: `1px solid ${colors.border}`,
              }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={badgeStyle(st.bg, st.color)}>{STATUS_LABELS[m.status] ?? m.status}</span>
                  {m.match_type === 'duel' && <span style={badgeStyle('rgba(239,83,80,0.15)', colors.danger)}>{TYPE_LABELS.duel}</span>}
                  {m.match_type === 'internal' && <span style={badgeStyle('rgba(33,150,243,0.15)', colors.info)}>{TYPE_LABELS.internal}</span>}
                  {m.category === 'batallon' && <span style={badgeStyle('rgba(156,39,176,0.15)', colors.purple)}>COMUNIDAD BATALLON</span>}
                  {m._fromAlliance && <span style={badgeStyle('rgba(79,195,247,0.15)', colors.info)}>DE TU ALIANZA</span>}
                </div>
                <h3 style={{ color: colors.text, margin: '0 0 4px' }}>{m.name}{al ? ` [${al.tag}]` : ''}</h3>
                <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>{formatDate(m.created_at)} | Max: {m.max_players ?? '-'}</p>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
