import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { colors, styles } from '../../theme';
import Reveal from '../../components/Reveal';

type Audience = 'jugadores' | 'lideres' | 'staff' | 'pwa';
type Filter = 'todos' | Audience;

type ChangeItem = {
  date: string;
  phase: string;
  icon: string;
  impact: 'Nuevo' | 'Mejora' | 'Fix';
  title: string;
  body: string;
  bullets: string[];
  audiences: Audience[];
};

const SHARE_URL = 'https://alliancehub.app/novedades';

const AUDIENCE_META: Record<Audience, { label: string; color: string; bg: string }> = {
  jugadores: { label: 'Jugadores', color: colors.success, bg: 'rgba(129,199,132,0.12)' },
  lideres: { label: 'Líderes', color: colors.warning, bg: 'rgba(255,213,79,0.12)' },
  staff: { label: 'Staff', color: colors.info, bg: 'rgba(79,195,247,0.12)' },
  pwa: { label: 'App/PWA', color: colors.purple, bg: 'rgba(206,147,216,0.12)' },
};

const IMPACT_META: Record<ChangeItem['impact'], { color: string; bg: string }> = {
  Nuevo: { color: colors.success, bg: 'rgba(129,199,132,0.14)' },
  Mejora: { color: colors.warning, bg: 'rgba(255,213,79,0.14)' },
  Fix: { color: colors.info, bg: 'rgba(79,195,247,0.14)' },
};

const CHANGES: ChangeItem[] = [
  {
    date: '26 sep',
    phase: 'Fase 1',
    icon: '⚜️',
    impact: 'Nuevo',
    title: 'Sistema de prestigio para plataforma y alianzas',
    body: 'Llegan insignias coleccionables que se desbloquean automáticamente con métricas estables y visibles de la plataforma.',
    bullets: [
      'Los prestigios de plataforma ⚜ los crea el superadmin.',
      'Los prestigios de alianza 🛡 los crean líderes/event_admin para su propia alianza.',
      'La rareza es fija en Fase 1: común, poco común, raro, épico o legendario.',
      'El perfil acumula toda la colección y destaca como principal la insignia de mayor rareza.',
    ],
    audiences: ['jugadores', 'lideres', 'staff'],
  },
  {
    date: '26 sep',
    phase: 'Fase 1',
    icon: '🥇',
    impact: 'Nuevo',
    title: 'Podios automáticos top 1, 2 y 3',
    body: 'Cada partida válida calcula automáticamente quién terminó primero, segundo y tercero según bajas, muertes y desempate determinista.',
    bullets: [
      'Se cuentan automáticamente en ranking, mercado y perfil público.',
      'No se inventa un contador de victorias: se muestran podios reales por partida válida.',
      'Las fórmulas de prestigio pueden usar podios, K/D bayesiano, partidas y strikes activos.',
    ],
    audiences: ['jugadores', 'lideres', 'staff'],
  },
  {
    date: '26 sep',
    phase: 'Transparencia',
    icon: '🔎',
    impact: 'Mejora',
    title: 'Rankings y mercado explicados al 100%',
    body: 'Cada vista ordenada ahora explica cómo se calcula el criterio activo y muestra las fórmulas en lenguaje claro.',
    bullets: [
      'El panel ⓘ explica K/D ajustado, AH Power Score, bajas efectivas, partidas y criterios de desempate.',
      'Aplicado en rankings públicos, mercado de jugadores, rankings admin y panel de líder.',
      'Sin métricas inventadas: solo partidas, bajas, muertes, K/D bayesiano y strikes activos.',
    ],
    audiences: ['jugadores', 'lideres', 'staff'],
  },
  {
    date: '26 sep',
    phase: 'Gestión',
    icon: '🛡',
    impact: 'Mejora',
    title: 'Acciones de líder por miembro recuperadas',
    body: 'El panel de alianza vuelve a tener control práctico sobre cada miembro, sin depender de atajos externos.',
    bullets: [
      'Expulsar miembro desde el panel de líder.',
      'Añadir notas, reportes, strikes y sanciones desde la ficha del miembro.',
      'Un jugador puede salir de su alianza cuando quiera.',
      'Las acciones visibles respetan sesión y permisos para evitar mezclas entre jugador y admin.',
    ],
    audiences: ['lideres', 'staff'],
  },
  {
    date: '25 sep',
    phase: 'Navegación',
    icon: '🧭',
    impact: 'Mejora',
    title: 'Navegación híbrida por modo',
    body: 'Volvieron los botones permanentes de modo: verde para Jugador y dorado para Admin, cada uno con su propio nav horizontal.',
    bullets: [
      'Menos botones sueltos en móvil y accesos agrupados por secciones.',
      'El login respeta el modo al que intentas entrar.',
      'Pensado para uso rápido desde teléfono sin perder las secciones públicas.',
    ],
    audiences: ['jugadores', 'lideres', 'staff'],
  },
  {
    date: '25 sep',
    phase: 'Alianzas',
    icon: '🤝',
    impact: 'Fix',
    title: 'Solicitud de entrada a alianzas visible de nuevo',
    body: 'Se recuperó el flujo de unirse o solicitar entrada a una alianza desde la sesión de jugador.',
    bullets: [
      'Aparece el enlace Mi alianza para sesiones de jugador.',
      'El botón Solicitar entrada vuelve al directorio y al perfil de alianza.',
      'Se corrigió el conflicto donde una sesión admin huérfana ocultaba la sesión de jugador.',
    ],
    audiences: ['jugadores', 'lideres'],
  },
  {
    date: '25 sep',
    phase: 'Sesiones',
    icon: '🔐',
    impact: 'Fix',
    title: 'Login simple como antes de la big update',
    body: 'Se retiró la huella/WebAuthn como requisito y volvió el comportamiento de token persistente conocido.',
    bullets: [
      'La sesión de jugador y la de admin ya no compiten por el mismo gesto de autenticación.',
      'La huella queda como autocompletado del sistema si el teléfono la ofrece.',
      'La versión previa al big update quedó etiquetada como v1.0.0 para referencia futura.',
    ],
    audiences: ['jugadores', 'lideres', 'staff'],
  },
  {
    date: '25 sep',
    phase: 'PWA',
    icon: '📱',
    impact: 'Fix',
    title: 'La app instalada ya no manda a 404 al refrescar',
    body: 'Se añadió redirección de 404 para deep links de GitHub Pages y una página de error personalizada.',
    bullets: [
      'Refrescar dentro de la PWA conserva la ruta original.',
      'Los enlaces compartidos abren directo en la vista correcta.',
      'Si algo no existe, ahora cae en una 404 propia de AllianceHub.',
    ],
    audiences: ['pwa', 'jugadores', 'lideres', 'staff'],
  },
  {
    date: '24-25 sep',
    phase: 'Big Update',
    icon: '🧱',
    impact: 'Nuevo',
    title: 'AllianceHub 2.0 reconstruido desde cero',
    body: 'La plataforma pasó a React + Vite + Supabase, con la misma infraestructura pública y RLS del proyecto original.',
    bullets: [
      'Suite admin completa con 26 páginas, registro, panel de alianza y rutas públicas.',
      'Nuevo lenguaje visual batallón-inspired: glass, glow, reveal y hero cinematográfico.',
      'Componentes reutilizables y theme único para mantener consistencia.',
      'Directorio público de alianzas y páginas públicas portadas del v1.',
    ],
    audiences: ['jugadores', 'lideres', 'staff'],
  },
  {
    date: '25 sep',
    phase: 'Estabilización',
    icon: '🧯',
    impact: 'Fix',
    title: 'Hotfixes inmediatos post big-update',
    body: 'Se repararon errores reportados por la comunidad antes de seguir sumando features.',
    bullets: [
      'Sanciones de alianza: orden correcto por applied_at en player_strikes.',
      'Restauración de api.ts y corrección de rutas aliases usadas por el panel.',
      'Purgas de service worker para que la PWA actualice sin quedarse con pantallas viejas.',
    ],
    audiences: ['staff', 'lideres'],
  },
];

const FILTERS: { id: Filter; label: string; color: string }[] = [
  { id: 'todos', label: 'Todos', color: colors.accent },
  { id: 'jugadores', label: '🎮 Jugadores', color: AUDIENCE_META.jugadores.color },
  { id: 'lideres', label: '🛡 Líderes', color: AUDIENCE_META.lideres.color },
  { id: 'staff', label: '🧰 Staff', color: AUDIENCE_META.staff.color },
  { id: 'pwa', label: '📱 App/PWA', color: AUDIENCE_META.pwa.color },
];

function spawnConfetti(rect: DOMRect) {
  const palette = [colors.accent, colors.success, colors.warning, colors.info, colors.purple];
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('span');
    piece.className = 'ah-confetti';
    piece.style.left = `${rect.left + rect.width / 2}px`;
    piece.style.top = `${rect.top + rect.height / 2}px`;
    piece.style.background = palette[i % palette.length];
    piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 180}px`);
    piece.style.setProperty('--dy', `${-40 - Math.random() * 120}px`);
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(piece);
    window.setTimeout(() => piece.remove(), 950);
  }
}

export default function NovedadesPage() {
  const [filter, setFilter] = useState<Filter>('todos');
  const [copied, setCopied] = useState(false);

  const visible = useMemo(
    () => filter === 'todos' ? CHANGES : CHANGES.filter((c) => c.audiences.includes(filter)),
    [filter],
  );

  const copyShareLink = async (e: React.MouseEvent<HTMLButtonElement>) => {
    try { await navigator.clipboard.writeText(SHARE_URL); } catch { /* clipboard puede fallar en navegadores antiguos */ }
    setCopied(true);
    spawnConfetti(e.currentTarget.getBoundingClientRect());
    window.setTimeout(() => setCopied(false), 1800);
  };

  const quick = (to: string, label: string, icon: string) => (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
      color: colors.text, padding: '10px 0', borderBottom: `1px solid ${colors.border}`,
    }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}` }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 650 }}>{label}</span>
      <span style={{ marginLeft: 'auto', color: colors.muted }}>→</span>
    </Link>
  );

  return (
    <div style={{ margin: '-24px -16px 0', minHeight: '100vh', background: colors.bg }}>
      {/* HERO */}
      <section className="ah-novedades-hero" style={{ position: 'relative', overflow: 'hidden', padding: '74px 16px 58px' }}>
        <div style={{ position: 'absolute', top: -180, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,143,0,0.18), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -220, left: -140, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,195,247,0.16), transparent 70%)', pointerEvents: 'none' }} />
        <div className="ah-novedades-ghost" aria-hidden="true">2.0</div>
        <div style={{ maxWidth: 1120, margin: '0 auto', position: 'relative' }}>
          <div className="ah-anim-fade-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: 'rgba(255,143,0,0.11)', border: '1px solid rgba(255,143,0,0.25)', color: colors.accent, fontWeight: 800, fontSize: 12, marginBottom: 18 }}>
            <span className="ah-anim-pulse-glow" style={{ width: 8, height: 8, borderRadius: '50%', background: colors.success }} />
            BIG UPDATE ACTIVA
          </div>
          <div className="ah-novedades-hero-grid">
            <div>
              <h1 className="ah-anim-fade-up" style={{ fontSize: 'clamp(38px, 7vw, 78px)', lineHeight: 0.98, letterSpacing: -2, margin: '0 0 18px', color: colors.text }}>
                Lo que cambió<br />desde la <span style={{ color: colors.accent }}>Big Update</span>
              </h1>
              <p className="ah-anim-fade-up" style={{ color: colors.muted, fontSize: 17, lineHeight: 1.7, maxWidth: 720, margin: 0 }}>
                Una ruta pública y compartible para que jugadores, líderes y staff vean exactamente qué se mejoró,
                qué se reparó y qué herramientas nuevas pueden usar hoy en AllianceHub.
              </p>
            </div>
            <div className="ah-novedades-hero-note">
              <div style={{ fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Enlace para compartir</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <code style={{ flex: 1, minWidth: 220, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, color: colors.text, fontSize: 13 }}>{SHARE_URL}</code>
                <button onClick={copyShareLink} style={{ ...styles.btnPrimary, borderRadius: 10, minWidth: 112 }}>{copied ? '✓ Copiado' : 'Copiar enlace'}</button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 26 }}>
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`ah-novedades-filter ${filter === f.id ? 'active' : ''}`} style={{ '--filter-color': f.color } as React.CSSProperties}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* CONTENIDO */}
      <section style={{ padding: '54px 16px 70px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }} className="ah-novedades-layout">
          <div>
            <Reveal>
              <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 18, marginBottom: 28, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: colors.accent, fontWeight: 900, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>Bitácora pública</div>
                  <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', color: colors.text, letterSpacing: -0.5 }}>
                    {filter === 'todos' ? 'Todos los cambios visibles' : `Cambios para ${AUDIENCE_META[filter].label.toLowerCase()}`}
                  </h2>
                </div>
                <div style={{ color: colors.muted, fontSize: 13 }}>{visible.length} entradas · actualizado el 26 sep 2026</div>
              </div>
            </Reveal>

            <div className="ah-novedades-timeline">
              {visible.map((c, idx) => {
                const impact = IMPACT_META[c.impact];
                return (
                  <Reveal key={c.title} delay={Math.min(idx * 55, 220)}>
                    <article className="ah-novedades-item">
                      <div className="ah-novedades-marker" style={{ boxShadow: `0 0 0 5px rgba(255,143,0,0.08), 0 0 24px rgba(255,143,0,0.16)` }}>{c.icon}</div>
                      <div className="ah-novedades-card" style={{ ...styles.card, background: 'rgba(13,19,48,0.78)' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: impact.bg, color: impact.color, fontSize: 11, fontWeight: 900, letterSpacing: 0.4 }}>{c.impact.toUpperCase()}</span>
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, color: colors.muted, fontSize: 11, fontWeight: 700 }}>{c.phase}</span>
                          <span style={{ color: colors.muted, fontSize: 12, marginLeft: 'auto' }}>{c.date}</span>
                        </div>
                        <h3 style={{ margin: '0 0 8px', color: colors.text, fontSize: 21, lineHeight: 1.2 }}>{c.title}</h3>
                        <p style={{ margin: '0 0 14px', color: colors.muted, lineHeight: 1.7, fontSize: 14 }}>{c.body}</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                          {c.audiences.map((a) => (
                            <span key={a} style={{ padding: '4px 9px', borderRadius: 999, background: AUDIENCE_META[a].bg, color: AUDIENCE_META[a].color, fontSize: 11, fontWeight: 800 }}>{AUDIENCE_META[a].label}</span>
                          ))}
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 9 }}>
                          {c.bullets.map((b) => (
                            <li key={b} style={{ display: 'flex', gap: 10, color: colors.text, fontSize: 13.5, lineHeight: 1.55 }}>
                              <span style={{ color: colors.success, fontWeight: 900 }}>✓</span><span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>

          <aside className="ah-novedades-sticky">
            <Reveal>
              <div style={{ ...styles.card, background: colors.cardAlt, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Para quién es</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {([
                    ['🎮', 'Jugadores', 'podios, prestigios, mercado, sesión simple y PWA estable'],
                    ['🛡', 'Líderes', 'solicitudes, panel de miembro, acciones y prestigios de alianza'],
                    ['🧰', 'Staff', 'suite admin, moderación, competición y auditoría'],
                  ] as const).map(([icon, title, desc]) => (
                    <div key={title} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, flexShrink: 0 }}>{icon}</span>
                      <div>
                        <div style={{ color: colors.text, fontWeight: 800, fontSize: 14 }}>{title}</div>
                        <div style={{ color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div style={{ ...styles.card, background: colors.cardAlt, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Accesos rápidos</div>
                {quick('/funciones', 'Funciones de AllianceHub', '🧭')}
                {quick('/rankings', 'Rankings con podios', '🏆')}
                {quick('/jugadores', 'Mercado de jugadores', '🧾')}
                {quick('/alianzas', 'Directorio de alianzas', '🏴')}
                {quick('/admin/leader-dashboard', 'Panel de líder', '🛡')}
                {quick('/admin/prestigios', 'Administrar prestigios', '⚜️')}
              </div>
            </Reveal>
            <Reveal delay={140}>
              <div className="ah-glow" style={{ ...styles.card, background: 'linear-gradient(135deg, rgba(255,111,0,0.16), rgba(13,19,48,0.9) 46%)', borderColor: 'rgba(255,143,0,0.35)' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🚀</div>
                <h3 style={{ margin: '0 0 8px', color: colors.text }}>¿Siguiente paso?</h3>
                <p style={{ margin: '0 0 14px', color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>
                  Esta página es pública: compártela por WhatsApp o Discord cuando quieras poner al día a tu alianza.
                </p>
                <Link to="/" style={{ ...styles.btnPrimary, display: 'inline-block', textDecoration: 'none', borderRadius: 10 }}>Volver al inicio</Link>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>
    </div>
  );
}
