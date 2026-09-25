import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useVisibilityRole, canSeeRuleSection } from '../../lib/playerSession';
import { compareSectionNumber } from '../../lib/format';
import { colors, styles } from '../../theme';
import Reveal from '../../components/Reveal';

const GUIA_URL = 'https://qkccyjegkgjzwoxytnqp.supabase.co/storage/v1/object/public/public-assets/guias/guia-lideres.pdf';

const FEATURES = [
  { icon: '🏆', title: 'Rankings Globales', desc: 'Sistema de rankings basado en estadisticas reales de partidas. K/D ratio, partidas jugadas, victorias y mas.' },
  { icon: '🏴', title: 'Gestiona tu Alianza', desc: 'Lidera tu alianza con herramientas exclusivas: miembros, rankings internos, partidas privadas y duelos.' },
  { icon: '⚔️', title: 'Duelos de Alianzas', desc: 'Prepara un equipo de 5 jugadores y desafia a otras alianzas. Matchmaking automatico.' },
  { icon: '🎯', title: 'Torneos Organizados', desc: 'Partidas con reglas claras, sistema de strikes y auditoria post-partida.' },
  { icon: '📥', title: 'Importa Resultados', desc: 'Importa estadisticas desde CSV de Supremacy 1914. Calculo automatico de rankings.' },
  { icon: '📱', title: 'App Web PWA', desc: 'Instala Alliance Hub en tu telefono. Funciona como app nativa.' },
];

const STEPS = [
  { n: '1', title: 'Registrate', desc: 'Crea tu cuenta como jugador o solicita el liderazgo de tu alianza.' },
  { n: '2', title: 'Compite', desc: 'Participa en partidas organizadas con reglas justas y seguimiento de estadisticas.' },
  { n: '3', title: 'Escala', desc: 'Sube en el ranking global basado en tu desempeno real en el campo de batalla.' },
];

const PREC_SEV: Record<string, { label: string; color: string }> = {
  high: { label: 'ALTO', color: colors.danger },
  medium: { label: 'MEDIO', color: colors.accent },
  low: { label: 'LEVE', color: colors.success },
  minor: { label: 'LEVE', color: colors.success },
};

interface Stat { matches: number; players: number; alliances: number; kills: number }

/** LandingPage — puerto completo de index.html + landing.js. */
export default function LandingPage() {
  const role = useVisibilityRole();
  const [stats, setStats] = useState<Stat | null>(null);
  const [rules, setRules] = useState<any[] | null>(null);
  const [allSections, setAllSections] = useState<Record<number, any>>({});
  const [showPrec, setShowPrec] = useState(false);
  const [precedents, setPrecedents] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, a, m, k] = await Promise.all([
          publicDb.from('players').select('*', { count: 'exact', head: true }),
          publicDb.from('alliances').select('*', { count: 'exact', head: true }),
          publicDb.from('public_matches_view').select('*', { count: 'exact', head: true }),
          publicDb.from('match_results').select('kills'),
        ]);
        let totalKills = 0;
        (k.data || []).forEach((r: any) => { totalKills += r.kills || 0; });
        setStats({
          matches: m.count || 0,
          players: p.count || 0,
          alliances: a.count || 0,
          kills: totalKills,
        });
      } catch (e) { console.error('[Stats]', e); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: roots } = await publicDb.from('rule_sections').select('*')
          .eq('is_active', true).is('parent_id', null).order('order_index');
        const visibleRoots = ((roots || []) as any[]).filter((s) => canSeeRuleSection(role, s.visibility)).sort(compareSectionNumber);
        setRules(visibleRoots.slice(0, 6));
        const { data: all } = await publicDb.from('rule_sections').select('*').eq('is_active', true).order('order_index');
        const map: Record<number, any> = {};
        ((all || []) as any[]).filter((s) => canSeeRuleSection(role, s.visibility)).forEach((s) => { map[s.id] = s; });
        setAllSections(map);
      } catch (e) { console.error('[LandingRules]', e); setRules([]); }
    })();
  }, [role]);

  useEffect(() => {
    if (!showPrec || precedents !== null) return;
    (async () => {
      try {
        const { data } = await publicDb.from('rule_precedents').select('*').order('created_at', { ascending: false }).limit(8);
        setPrecedents(data ?? []);
      } catch (e) { console.error('[LandingPrecedents]', e); setPrecedents([]); }
    })();
  }, [showPrec, precedents]);

  const heroBtn: React.CSSProperties = {
    padding: '14px 26px', borderRadius: 12, fontWeight: 700, fontSize: 15,
    textDecoration: 'none', transition: 'transform 0.15s', display: 'inline-block',
  };

  const statCard = (value: string | number, label: string, color: string) => (
    <div style={{ ...styles.card, textAlign: 'center', background: colors.bg }} className="ah-glow-hover">
      <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: colors.muted }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* HERO */}
      <section className="ah-anim-slow-zoom" style={{ position: 'relative', overflow: 'hidden', padding: '80px 16px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', top: -200, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,111,0,0.15), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -200, left: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,35,126,0.4), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative' }}>
          <div className="ah-anim-pulse-glow" style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 24, background: 'rgba(255,143,0,0.1)', color: colors.accent, border: '1px solid rgba(255,143,0,0.2)' }}>
            🎉 La plataforma de competencia para Supremacy 1914
          </div>
          <h1 className="ah-anim-gradient-pan" style={{ fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 900, margin: '0 0 20px', lineHeight: 1.15, color: colors.text }}>
            Domina el campo de batalla. <span style={{ color: colors.accent }}>Demuestralo.</span>
          </h1>
          <p style={{ fontSize: 17, color: colors.muted, maxWidth: 620, margin: '0 auto 32px' }}>
            Alliance Hub organiza <strong style={{ color: colors.text }}>torneos, rankings y ligas</strong> para comunidades de Supremacy 1914. Registra tu alianza, compite en partidas organizadas y escala el ranking global.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
            <Link to="/login" style={{ ...heroBtn, background: colors.accentGradient, color: '#fff' }}>🎮 Comenzar como Jugador</Link>
            <Link to="/lider/solicitud" style={{ ...heroBtn, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.04)', color: colors.text }}>🏅 Registrar mi Alianza</Link>
            <a href={GUIA_URL} target="_blank" rel="noopener noreferrer" style={{ ...heroBtn, border: '1px solid rgba(255,213,79,0.5)', background: 'rgba(255,213,79,0.1)', color: colors.warning }}>📕 Guia para Lideres (PDF)</a>
            <Link to="/rankings" style={{ ...heroBtn, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.04)', color: colors.text }}>🏆 Ver Rankings</Link>
          </div>
        </div>
      </section>

      {/* STATS + FEATURES */}
      <section style={{ padding: '56px 16px', background: colors.card, borderTop: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 48 }}>
            {statCard(stats?.matches ?? '-', 'Partidas', colors.accent)}
            {statCard(stats?.players ?? '-', 'Jugadores', colors.success)}
            {statCard(stats?.alliances ?? '-', 'Alianzas', colors.info)}
            {statCard(stats?.kills != null ? stats.kills.toLocaleString() : '-', 'Bajas Totales', colors.purple)}
          </div>
          <Reveal>
            <h2 style={{ fontSize: 28, textAlign: 'center', color: colors.text, margin: '0 0 8px' }}>Que es Alliance Hub?</h2>
            <p style={{ textAlign: 'center', color: colors.muted, margin: '0 auto 40px', maxWidth: 520 }}>Una plataforma independiente creada por y para la comunidad de Supremacy 1914.</p>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <div style={{ ...styles.card, background: colors.bg, height: '100%' }} className="ah-glow-hover">
                  <div style={{ fontSize: 34, marginBottom: 14 }}>{f.icon}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: colors.text, margin: '0 0 8px' }}>{f.title}</h3>
                  <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section style={{ padding: '56px 16px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <Reveal><h2 style={{ fontSize: 28, textAlign: 'center', color: colors.text, margin: '0 0 40px' }}>Como Funciona</h2></Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32 }}>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: colors.accentGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, margin: '0 auto 16px', color: '#fff' }}>{s.n}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: colors.text, margin: '0 0 8px' }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PARA ALIANZAS */}
      <section style={{ padding: '56px 16px', background: colors.card, borderTop: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 40, alignItems: 'center' }}>
          <Reveal>
            <h2 style={{ fontSize: 28, color: colors.text, margin: '0 0 12px' }}>🏴 Para Alianzas</h2>
            <p style={{ color: colors.muted, margin: '0 0 20px' }}>Eres lider de alianza? Lleva tu comunidad al siguiente nivel.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: 12 }}>
              {['Panel exclusivo para gestionar miembros', 'Rankings internos de tu alianza', 'Sistema de duelos contra otras alianzas', 'Sistema de aprobacion de lideres'].map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, color: colors.muted, fontSize: 14 }}>
                  <span style={{ color: colors.success }}>✓</span>{item}
                </li>
              ))}
            </ul>
            <Link to="/lider/solicitud" style={{ ...heroBtn, background: colors.accentGradient, color: '#fff', fontSize: 14, padding: '12px 22px' }}>🏅 Solicitar Liderazgo</Link>
          </Reveal>
          <Reveal delay={120}>
            <div style={{ ...styles.card, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 60, marginBottom: 16 }}>🏴</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: colors.text, margin: '0 0 8px' }}>Tu Alianza. Tu Equipo.</h3>
              <p style={{ color: colors.muted, margin: 0 }}>Solicita el liderazgo de tu alianza y gestiona a tu equipo.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* REGLAMENTO */}
      <section style={{ padding: '56px 16px', background: colors.card, borderTop: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <h2 style={{ fontSize: 28, color: colors.text, margin: 0 }}>📜 Reglamento</h2>
            <Link to="/reglas" style={{ ...heroBtn, background: colors.accentGradient, color: '#fff', fontSize: 13, padding: '8px 18px' }}>Ver completo →</Link>
          </div>
          {!rules ? (
            <p style={{ color: colors.muted, textAlign: 'center' }}>Cargando reglamento...</p>
          ) : rules.length === 0 ? (
            <p style={{ color: colors.muted, textAlign: 'center' }}>No hay reglas configuradas.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
              {rules.map((s) => (
                <Reveal key={s.id}>
                  <div style={styles.card}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: colors.accent, margin: '0 0 6px' }}>
                      {s.section_number || String(s.order_index + 1)}. {s.title}
                    </h3>
                    <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.5 }}>
                      {(s.content || '').substring(0, 150)}{(s.content || '').length > 150 ? '...' : ''}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
            <button onClick={() => setShowPrec((v) => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...styles.card, cursor: 'pointer' }}>
              <strong style={{ color: colors.accent, fontSize: 14 }}>⚖️ Ver precedentes y jurisprudencia</strong>
              <span style={{ color: colors.muted, fontSize: 12 }}>{showPrec ? '▲' : '▼'}</span>
            </button>
            {showPrec && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 16 }}>
                {precedents === null ? (
                  <p style={{ color: colors.muted, gridColumn: '1 / -1', textAlign: 'center' }}>Cargando...</p>
                ) : precedents.length === 0 ? (
                  <p style={{ color: colors.muted, gridColumn: '1 / -1', textAlign: 'center' }}>No hay precedentes registrados aun.</p>
                ) : precedents.map((p) => {
                  const sec = p.rule_section_id ? allSections[p.rule_section_id] : null;
                  const sev = PREC_SEV[p.severity] || { label: 'LEVE', color: colors.muted };
                  return (
                    <div key={p.id} style={styles.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <h4 style={{ margin: 0, fontSize: 14, color: colors.accent }}>{p.title}</h4>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${sev.color}22`, color: sev.color, height: 'fit-content' }}>{sev.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: colors.text, margin: '0 0 10px' }}>
                        {(p.description || '').substring(0, 120)}{(p.description || '').length > 120 ? '...' : ''}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {sec ? (
                          <Link to={`/reglas#section-${sec.id}`} style={{ fontSize: 11, color: colors.accent, textDecoration: 'underline' }}>
                            {sec.section_number || ''} {sec.title}
                          </Link>
                        ) : <span style={{ fontSize: 11, color: colors.muted }}>Sin seccion asignada</span>}
                        <Link to={`/reglas#precedent-${p.id}`} style={{ fontSize: 11, color: colors.muted }}>Ver mas →</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '32px 16px', background: colors.bg, borderTop: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 700, color: colors.accent }}>⚔️ Alliance Hub</span>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 13, flexWrap: 'wrap' }}>
              <Link to="/rankings" style={{ color: colors.muted, textDecoration: 'none' }}>Rankings</Link>
              <Link to="/reglas" style={{ color: colors.muted, textDecoration: 'none' }}>Reglamento</Link>
              <Link to="/lider/solicitud" style={{ color: colors.muted, textDecoration: 'none' }}>Liderazgo</Link>
              <Link to="/login" style={{ color: colors.muted, textDecoration: 'none' }}>Admin</Link>
              <Link to="/login" style={{ color: colors.muted, textDecoration: 'none' }}>Jugador</Link>
            </div>
          </div>
          <div style={{ fontSize: 11, color: colors.muted, maxWidth: 480, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 4px' }}>© 2026 Alliance Hub. Proyecto comunitario e independiente, hecho por jugadores.</p>
            <p style={{ margin: '0 0 4px' }}>No forma parte de, ni esta afiliado, patrocinado o respaldado por <strong>Bytro Labs GmbH</strong> ni <strong>Stillfront Group AB</strong>. Supremacy 1914 es marca de sus respectivos titulares.</p>
            <p style={{ margin: 0 }}>No usamos ninguna API ni dato interno del juego: las estadisticas deportivas se calculan con herramientas externas de terceros y datos aportados por la comunidad, respetando el EULA de Supremacy 1914. <Link to="/aviso-legal" style={{ color: colors.muted, textDecoration: 'underline' }}>Aviso legal</Link></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
