import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicDb, hasAdminSessionMarker } from '../../lib/api';
import { useAdmin } from '../../lib/admin';
import { computeEffectiveKills, attachStrikeTypes } from '../../lib/sanctions';
import PlayerNotes from '../../components/PlayerNotes';
import { colors, styles } from '../../theme';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';
import { PrestigeBadgeList } from '../../components/PrestigeBadge';
import type { PrestigeDefinition } from '../../lib/prestige';
import { UNIT_CATEGORY_META, unitLabel, unitCategoryOf } from '../../lib/units';

/** PlayerPage — puerto de player.js: perfil publico + strikes + bajas efectivas. */
export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { admin } = useAdmin();
  const adminSession = hasAdminSessionMarker();
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [alliance, setAlliance] = useState<{ name: string; tag: string | null } | null>(null);
  const [prestiges, setPrestiges] = useState<PrestigeDefinition[]>([]);
  const [podiums, setPodiums] = useState({ p1: 0, p2: 0, p3: 0 });
  const [unitRows, setUnitRows] = useState<{ unit_key: string; kills: number; deaths: number }[]>([]);
  const [stats, setStats] = useState({ effKills: 0, penaltyPct: 0, totalDeaths: 0, games: 0, kd: '0.00', strikeCount: 0 });

  useEffect(() => {
    if (!id) { setState('error'); setErrorMsg('ID de jugador no especificado'); return; }
    (async () => {
      try {
        const { data: player, error } = await publicDb.from('public_players_view').select('*').eq('id', id).single();
        if (error) throw error;
        if (!player) { setState('error'); setErrorMsg('Jugador no encontrado'); return; }

        const { data: rankingRow } = await publicDb.from('public_rankings_view')
          .select('total_kills, total_deaths, games_played').eq('player_id', id).maybeSingle();
        const totalKills = (rankingRow as any)?.total_kills || 0;
        const totalDeaths = (rankingRow as any)?.total_deaths || 0;
        const games = (rankingRow as any)?.games_played || 0;

        let strikes: any[] = [];
        try {
          const { data: strikeRows } = await publicDb.from('player_strikes').select('*')
            .eq('player_id', id).eq('status', 'active');
          strikes = await attachStrikeTypes(strikeRows || [], () =>
            Promise.resolve(publicDb.from('strike_types').select('*').then((r) => r.data || [])));
        } catch (e) { console.error('[Player] strikes:', e); }

        const eff = computeEffectiveKills(totalKills, strikes, 0);
        const kd = totalDeaths > 0 ? (eff.effKills / totalDeaths).toFixed(2) : eff.effKills > 0 ? eff.effKills.toFixed(2) : '0.00';

        if (player.current_alliance_id) {
          const { data: alli } = await publicDb.from('alliances').select('name, tag').eq('id', player.current_alliance_id).maybeSingle();
          if (alli) setAlliance(alli as any);
        }

        let prestigeRows: PrestigeDefinition[] = [];
        try {
          const { data: pr } = await publicDb.rpc('player_prestiges', { p_player_id: Number(id) });
          prestigeRows = (pr ?? []) as PrestigeDefinition[];
        } catch (e) { console.error('[Player] prestigios:', e); }
        setPrestiges(prestigeRows);

        try {
          const { data: pod } = await publicDb.from('public_player_podium_stats').select('*').eq('player_id', id).maybeSingle();
          setPodiums({ p1: Number((pod as any)?.podium_1 || 0), p2: Number((pod as any)?.podium_2 || 0), p3: Number((pod as any)?.podium_3 || 0) });
        } catch (e) { console.error('[Player] podios:', e); }

        try {
          const { data: units } = await publicDb.from('public_player_unit_stats').select('unit_key, kills, deaths').eq('player_id', id);
          setUnitRows((units as any[]) ?? []);
        } catch (e) { console.error('[Player] unidades:', e); }

        setProfile(player);
        setStats({ effKills: eff.effKills, penaltyPct: eff.penaltyPct, totalDeaths, games, kd, strikeCount: strikes.length });
        setState('ready');
      } catch (e: any) {
        console.error('[Profile]', e);
        setState('error');
        setErrorMsg('Error: ' + (e?.message ?? e));
      }
    })();
  }, [id]);

  if (state === 'loading') return <Loader />;
  if (state === 'error') {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', color: colors.danger }}>
        <p>{errorMsg}</p>
        <Link to="/rankings" style={{ color: colors.accent }}>Volver a rankings</Link>
      </div>
    );
  }

  const statCard = (value: React.ReactNode, label: string) => (
    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: colors.text }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.muted }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <Reveal>
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 40 }}>👤</div>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: 24, color: colors.text, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {profile.current_username}
                {stats.strikeCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,143,0,0.2)', color: colors.accent }}>
                    {stats.strikeCount} strike{stats.strikeCount > 1 ? 's' : ''}
                  </span>
                )}
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
                {alliance ? `${alliance.name} [${alliance.tag}]` : 'Sin alianza'}
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {statCard(
              <span>
                {stats.effKills}
                {stats.penaltyPct > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,83,80,0.2)', color: colors.danger, marginLeft: 6 }}>-{stats.penaltyPct}%</span>
                )}
              </span>,
              'Bajas Efectivas'
            )}
            {statCard(stats.totalDeaths, 'Muertes')}
            {statCard(stats.kd, 'K/D')}
            {statCard(stats.games, 'Partidas Validas')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
            {statCard(<span>🥇 {podiums.p1}</span>, 'Primeros lugares')}
            {statCard(<span>🥈 {podiums.p2}</span>, 'Segundos lugares')}
            {statCard(<span>🥉 {podiums.p3}</span>, 'Terceros lugares')}
          </div>
          {unitRows.length > 0 && (() => {
            const byCat: Record<string, number> = {};
            unitRows.forEach((u) => {
              const cat = unitCategoryOf(u.unit_key);
              byCat[cat] = (byCat[cat] || 0) + u.kills;
            });
            const topUnits = [...unitRows].sort((a, b) => b.kills - a.kills).slice(0, 8);
            const maxCat = Math.max(1, ...Object.values(byCat));
            return (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                <h2 style={{ margin: '0 0 2px', fontSize: 16, color: colors.text }}>Bajas por tipo de unidad</h2>
                <p style={{ margin: '0 0 12px', fontSize: 11, color: colors.muted }}>Partidas oficiales importadas por API · dato informativo, no afecta al K/D</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {Object.entries(UNIT_CATEGORY_META).filter(([k]) => byCat[k]).map(([k, meta]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, width: 110, flexShrink: 0, color: colors.text }}>{meta.icon} {meta.label}</span>
                      <div style={{ flex: 1, height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ width: `${(byCat[k] / maxCat) * 100}%`, height: '100%', borderRadius: 6, background: meta.color }} />
                      </div>
                      <strong style={{ fontSize: 13, color: meta.color, minWidth: 44, textAlign: 'right' }}>{byCat[k]}</strong>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: colors.muted }}>TOP UNIDADES</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {topUnits.map((u) => (
                    <span key={u.unit_key} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, color: colors.text }}>
                      {unitLabel(u.unit_key)}: <strong>{u.kills}</strong>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, color: colors.text }}>Colección de prestigio</h2>
            <PrestigeBadgeList prestiges={prestiges} />
          </div>
          <PlayerNotes
            playerId={Number(id)}
            showComposer={adminSession}
            createScope={null}
            authorName={admin?.display_name ?? 'Staff'}
            authorRole={admin?.role ?? 'admin'}
          />
        </div>
      </Reveal>
    </div>
  );
}
