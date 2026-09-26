import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { colors, styles } from '../../theme';
import Reveal from '../../components/Reveal';

type Role = 'publico' | 'jugador' | 'lider' | 'staff';

type Module = {
  id: string;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  highlights: string[];
  link: string;
  linkLabel: string;
  roles: Role[];
};

type FlowStep = { n: string; title: string; desc: string; link?: string };

const ROLE_META: Record<Role, { label: string; color: string; bg: string; desc: string }> = {
  publico: { label: 'Público', color: colors.accent, bg: 'rgba(255,143,0,0.12)', desc: 'Explorar la plataforma sin sesión' },
  jugador: { label: 'Jugador', color: colors.success, bg: 'rgba(129,199,132,0.12)', desc: 'Competir, reportar y crecer en tu perfil' },
  lider: { label: 'Líder', color: colors.warning, bg: 'rgba(255,213,79,0.12)', desc: 'Gestionar alianza, miembros y prestigios' },
  staff: { label: 'Staff/Admin', color: colors.info, bg: 'rgba(79,195,247,0.12)', desc: 'Moderar, cargar datos y configurar reglas' },
};

const MODULES: Module[] = [
  {
    id: 'partidas',
    icon: '⚔️',
    title: 'Partidas y torneos',
    tagline: 'El centro de la actividad competitiva.',
    description: 'Aquí se publican las partidas organizadas por AllianceHub: torneos, duelos, partidas globales y eventos por tipo de partida. Desde el detalle se pueden revisar registrados, ganadores, resultados y estadísticas.',
    highlights: [
      'Dashboard público de partidas disponibles y pasadas.',
      'Detalle por partida con resultados y participantes.',
      'Soporte para tipos de partida y visibilidad pública/privada.',
      'Las partidas válidas alimentan rankings, podios y métricas.',
    ],
    link: '/partidas',
    linkLabel: 'Ver partidas',
    roles: ['publico', 'jugador', 'lider', 'staff'],
  },
  {
    id: 'rankings',
    icon: '🏆',
    title: 'Rankings globales',
    tagline: 'Comparación competitiva con fórmulas explicadas.',
    description: 'El ranking ordena jugadores por estadísticas reales de partidas válidas. Cada modo de orden tiene explicación visible: K/D bayesiano, AH Power Score, bajas efectivas, partidas y desempates deterministas.',
    highlights: [
      'K/D ajustado bayesiano con C=3.',
      'Modos de orden explicados dentro de la vista.',
      'Podios automáticos top 1, 2 y 3 por partida válida.',
      'Rankings públicos, admin y de panel de líder usan el mismo lenguaje.',
    ],
    link: '/rankings',
    linkLabel: 'Abrir rankings',
    roles: ['publico', 'jugador', 'lider', 'staff'],
  },
  {
    id: 'mercado',
    icon: '🧾',
    title: 'Mercado de jugadores',
    tagline: 'Directorio público para descubrir jugadores.',
    description: 'El mercado permite explorar jugadores, revisar sus métricas públicas, ordenar por criterios competitivos y entrar a perfiles individuales con podios y colección de prestigios.',
    highlights: [
      'Cards públicas con K/D, partidas y podios.',
      'Orden por directorio, K/D ajustado, AH Power, bajas y partidas.',
      'Panel de explicación para cada criterio de orden.',
      'Las sanciones/penalizaciones se muestran como parte del expediente.',
    ],
    link: '/jugadores',
    linkLabel: 'Explorar mercado',
    roles: ['publico', 'jugador', 'lider', 'staff'],
  },
  {
    id: 'alianzas',
    icon: '🏴',
    title: 'Directorio y perfiles de alianzas',
    tagline: 'Identidad pública y solicitud de entrada.',
    description: 'Cada alianza tiene ficha pública con descripción, enlaces, miembros y prestigios. Los jugadores pueden solicitar entrada desde el directorio o desde la ficha de la alianza.',
    highlights: [
      'Directorio público de alianzas activas.',
      'Botón de solicitud de entrada para sesiones de jugador.',
      'Perfil público con miembros, datos y prestigios desbloqueados.',
      'Base para que líderes recluten y den identidad a su comunidad.',
    ],
    link: '/alianzas',
    linkLabel: 'Ver alianzas',
    roles: ['publico', 'jugador', 'lider', 'staff'],
  },
  {
    id: 'mi-alianza',
    icon: '🚩',
    title: 'Panel de mi alianza',
    tagline: 'La vista del jugador dentro de su equipo.',
    description: 'Cuando un jugador pertenece a una alianza, puede ver su espacio de equipo, miembros, sanciones aplicables y accesos según su rol. Los líderes ven acciones adicionales sobre cada miembro.',
    highlights: [
      'Acceso “Mi alianza” para sesiones de jugador.',
      'Vista de miembros y datos de equipo.',
      'El jugador puede salir de su alianza.',
      'Los líderes ven acciones de miembro: notas, reportes, strikes, expulsión y sanciones.',
    ],
    link: '/alianza',
    linkLabel: 'Ir a mi alianza',
    roles: ['jugador', 'lider', 'staff'],
  },
  {
    id: 'mi-espacio',
    icon: '🖼️',
    title: 'Mi Espacio',
    tagline: 'Personalización pública de la alianza.',
    description: 'Módulo para que líderes/oficiales administren el perfil visual y anuncios de su alianza: logo, banner, anuncios y reglas internas visibles para su comunidad.',
    highlights: [
      'Edición de imagen/logo y banner con compresión.',
      'Anuncios visibles para miembros.',
      'Reglas o notas internas de la alianza.',
      'Pensado para identidad y comunicación del equipo.',
    ],
    link: '/mi-espacio',
    linkLabel: 'Abrir Mi Espacio',
    roles: ['lider', 'staff'],
  },
  {
    id: 'reportes',
    icon: '🚨',
    title: 'Reportes y evidencia',
    tagline: 'Canal estructurado para incidentes.',
    description: 'Los jugadores y líderes pueden reportar comportamientos, bugs o incidentes de partida. El staff revisa la evidencia, clasifica y actúa desde moderación o comité.',
    highlights: [
      'Reportes con contexto de partida/jugador.',
      'Evidencia y descripción para revisión posterior.',
      'Bandeja admin e inbox para seguimiento.',
      'Conecta con sanciones, strikes y auditoría.',
    ],
    link: '/reportar',
    linkLabel: 'Crear reporte',
    roles: ['jugador', 'lider', 'staff'],
  },
  {
    id: 'sanciones',
    icon: '⚖️',
    title: 'Sanciones, strikes y expediente',
    tagline: 'Moderación con trazabilidad.',
    description: 'El sistema de conducta registra strikes y sanciones por jugador/alianza, con severidad, aplicación temporal y expediente. Las penalizaciones pueden pesar en rankings y métricas públicas.',
    highlights: [
      'Strikes por tipo, severidad y fecha de aplicación.',
      'Sanciones por alianza con alcance y trazabilidad.',
      'Expediente del jugador con historial relevante.',
      'Reglas y precedentes sostienen decisiones de moderación.',
    ],
    link: '/alianza/sanciones',
    linkLabel: 'Ver sanciones',
    roles: ['lider', 'staff'],
  },
  {
    id: 'prestigios',
    icon: '⚜️',
    title: 'Sistema de prestigio',
    tagline: 'Objetivos, insignias y colección.',
    description: 'Los prestigios convierten métricas estables en insignias coleccionables. Hay prestigios de plataforma ⚜ y de alianza 🛡, con rareza fija, fórmulas JSON y colección visible en perfiles.',
    highlights: [
      'Plataforma: los crea el superadmin.',
      'Alianza: los crean líderes/event_admin para su propia alianza.',
      'Fórmulas sobre métricas estables: partidas, bajas, muertes, K/D bayesiano, podios y strikes activos.',
      'El perfil acumula insignias y destaca la principal por mayor rareza.',
    ],
    link: '/rankings',
    linkLabel: 'Ver perfiles con prestigios',
    roles: ['publico', 'jugador', 'lider', 'staff'],
  },
  {
    id: 'chat',
    icon: '💬',
    title: 'Chat comunitario',
    tagline: 'Canales y mensajería interna.',
    description: 'Chat en tiempo real para la comunidad y mensajería interna con staff. Incluye moderación de reportes de chat y límites según sesión/rol.',
    highlights: [
      'Canales públicos/comunitarios.',
      'DMs o atención interna según permisos.',
      'Reportes de chat para moderación.',
      'Se apoya en la sesión activa y RLS.',
    ],
    link: '/chat',
    linkLabel: 'Abrir chat',
    roles: ['jugador', 'lider', 'staff'],
  },
  {
    id: 'reglas',
    icon: '📜',
    title: 'Reglamento, reglas y precedentes',
    tagline: 'La base normativa del proyecto.',
    description: 'El reglamento público organiza las reglas de convivencia y competencia. Staff puede editar secciones, jerarquía, visibilidad y precedentes/jurisprudencia.',
    highlights: [
      'Secciones visibles según rol.',
      'Precedentes para explicar decisiones pasadas.',
      'Editor admin de reglas.',
      'Aterriza sanciones, reportes y criterios de moderación.',
    ],
    link: '/reglas',
    linkLabel: 'Leer reglamento',
    roles: ['publico', 'jugador', 'lider', 'staff'],
  },
  {
    id: 'admin',
    icon: '🛠',
    title: 'Suite admin completa',
    tagline: 'Gestión interna de todo AllianceHub.',
    description: 'El panel admin concentra gestión de jugadores, alianzas, miembros, administradores, oficiales, invitaciones, importación, auditoría, moderación, competición, ligas, duelos, rankings, reglas y prestigios.',
    highlights: [
      '26 páginas/admin tools agrupadas por área.',
      'Moderación: strikes, sanciones, reportes, comité, inbox.',
      'Competición: juegos, ligas, duelos, rankings, certificaciones, prestigios.',
      'Auditoría y trazabilidad de acciones sensibles.',
    ],
    link: '/admin',
    linkLabel: 'Ir al panel',
    roles: ['staff'],
  },
  {
    id: 'pwa',
    icon: '📱',
    title: 'PWA / app instalable',
    tagline: 'AllianceHub como app en el teléfono.',
    description: 'La plataforma funciona como PWA: se puede instalar, recibir push si están habilitadas, abrir deep links y refrescar rutas internas sin caer en 404.',
    highlights: [
      'Instalable en móvil como app web.',
      'Deep links con redirección propia para GitHub Pages.',
      'Service worker con purga de versiones.',
      'Push notifications y diagnóstico portados del v1.',
    ],
    link: '/',
    linkLabel: 'Instalar desde inicio',
    roles: ['publico', 'jugador', 'lider', 'staff'],
  },
];

const FLOWS: Record<Role, FlowStep[]> = {
  publico: [
    { n: '01', title: 'Explora', desc: 'Mira partidas, rankings, alianzas y reglamento sin necesidad de cuenta.', link: '/partidas' },
    { n: '02', title: 'Compara', desc: 'Revisa métricas, podios y criterios de orden explicados.', link: '/rankings' },
    { n: '03', title: 'Decide', desc: 'Entra como jugador, solicita liderazgo o contacta con una alianza.', link: '/login' },
  ],
  jugador: [
    { n: '01', title: 'Entra como jugador', desc: 'Usa el modo Jugador y conserva una sesión simple tipo token persistente.', link: '/login?mode=player' },
    { n: '02', title: 'Únete a una alianza', desc: 'Desde el directorio o perfil de alianza envía tu solicitud de entrada.', link: '/alianzas' },
    { n: '03', title: 'Compite y acumula métricas', desc: 'Participa en partidas válidas para sumar bajas, partidas, podios y prestigios.', link: '/partidas' },
    { n: '04', title: 'Reporta cuando toque', desc: 'Si hay incidente, genera reporte con contexto y evidencia.', link: '/reportar' },
  ],
  lider: [
    { n: '01', title: 'Solicita o recupera liderazgo', desc: 'Presenta tu alianza y espera aprobación del staff.', link: '/lider/solicitud' },
    { n: '02', title: 'Gestiona miembros', desc: 'Revisa miembros, agrega notas, reportes, strikes o expulsa si corresponde.', link: '/admin/leader-dashboard' },
    { n: '03', title: 'Crea prestigios de alianza', desc: 'Define insignias propias con métricas estables y rareza fija.', link: '/admin/prestigios' },
    { n: '04', title: 'Cuida tu espacio', desc: 'Actualiza Mi Espacio, anuncios e identidad pública de tu alianza.', link: '/mi-espacio' },
  ],
  staff: [
    { n: '01', title: 'Entra al modo Admin', desc: 'Usa Supabase Auth/RLS para operar según tu rol real.', link: '/login?mode=admin' },
    { n: '02', title: 'Carga y valida datos', desc: 'Administra jugadores, alianzas, miembros, importaciones y partidas.', link: '/admin' },
    { n: '03', title: 'Modera con trazabilidad', desc: 'Revisa reportes, strikes, sanciones, comité, chat e inbox.', link: '/admin/reportes' },
    { n: '04', title: 'Configura competición', desc: 'Gestiona juegos, ligas, duelos, rankings, reglas y prestigios de plataforma.', link: '/admin/prestigios' },
  ],
};

const GLOSSARY = [
  { term: 'K/D bayesiano', def: 'K/D ajustado con priors globales para no inflar muestras pequeñas. Se explica en cada ranking.' },
  { term: 'AH Power Score', def: 'Puntuación competitiva alternativa basada en producción real y eficiencia.' },
  { term: 'Bajas efectivas', def: 'Bajas reales de partidas válidas, separadas de datos legacy o no globales.' },
  { term: 'Podio', def: 'Top 1, 2 o 3 automático dentro de una partida válida según bajas, muertes y desempate.' },
  { term: 'Strike', def: 'Amonestación registrada con tipo, severidad y fecha de aplicación.' },
  { term: 'Sanción', def: 'Consecuencia aplicada a jugador o alianza según reglas y expediente.' },
  { term: 'Prestigio', def: 'Insignia desbloqueable por fórmulas sobre métricas estables; puede ser de plataforma o alianza.' },
  { term: 'Rareza principal', def: 'En Fase 1 la rareza la define el admin y la insignia principal es la de mayor rareza desbloqueada.' },
  { term: 'Mercado', def: 'Directorio público de jugadores para descubrir perfiles, métricas y podios.' },
  { term: 'Mi Espacio', def: 'Panel de personalización pública de una alianza: logo, banner, anuncios y reglas.' },
  { term: 'Expediente', def: 'Historial relevante de un jugador: reportes, strikes, sanciones y antecedentes.' },
  { term: 'RLS', def: 'Row Level Security de Supabase: autorización directamente en base de datos.' },
];

export default function FuncionesPage() {
  const [activeRole, setActiveRole] = useState<Role>('publico');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState('partidas');

  const normalized = query.trim().toLowerCase();
  const visibleModules = useMemo(() => MODULES.filter((m) => {
    const roleOk = activeRole === 'publico' ? true : m.roles.includes(activeRole);
    if (!roleOk) return false;
    if (!normalized) return true;
    const hay = [m.title, m.tagline, m.description, ...m.highlights].join(' ').toLowerCase();
    return hay.includes(normalized);
  }), [activeRole, normalized]);

  const visibleGlossary = useMemo(() => {
    if (!normalized) return GLOSSARY;
    return GLOSSARY.filter((g) => `${g.term} ${g.def}`.toLowerCase().includes(normalized));
  }, [normalized]);

  const roleButton = (role: Role) => (
    <button
      key={role}
      onClick={() => setActiveRole(role)}
      className={`ah-novedades-filter ${activeRole === role ? 'active' : ''}`}
      style={{ '--filter-color': ROLE_META[role].color } as React.CSSProperties}
    >
      {role === 'publico' ? '🌐' : role === 'jugador' ? '🎮' : role === 'lider' ? '🛡' : '🧰'} {ROLE_META[role].label}
    </button>
  );

  return (
    <div style={{ margin: '-24px -16px 0', minHeight: '100vh', background: colors.bg }}>
      <section style={{ position: 'relative', overflow: 'hidden', padding: '74px 16px 54px' }}>
        <div style={{ position: 'absolute', top: -180, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,143,0,0.17), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -220, left: -140, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(129,199,132,0.14), transparent 70%)', pointerEvents: 'none' }} />
        <div className="ah-novedades-ghost" aria-hidden="true">AH</div>
        <div style={{ maxWidth: 1120, margin: '0 auto', position: 'relative' }}>
          <div className="ah-anim-fade-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: 'rgba(79,195,247,0.10)', border: '1px solid rgba(79,195,247,0.22)', color: colors.info, fontWeight: 900, fontSize: 12, marginBottom: 18 }}>
            <span className="ah-anim-pulse-glow" style={{ width: 8, height: 8, borderRadius: '50%', background: colors.info }} />
            GUÍA COMPLETA DEL PROYECTO
          </div>
          <div className="ah-novedades-hero-grid">
            <div>
              <h1 className="ah-anim-fade-up" style={{ fontSize: 'clamp(38px, 7vw, 76px)', lineHeight: 0.98, letterSpacing: -2, margin: '0 0 18px', color: colors.text }}>
                AllianceHub,<br /><span style={{ color: colors.accent }}>función por función</span>
              </h1>
              <p className="ah-anim-fade-up" style={{ color: colors.muted, fontSize: 17, lineHeight: 1.7, maxWidth: 740, margin: 0 }}>
                Una guía pública y viva para entender qué hace cada módulo, quién lo usa y cómo encaja en el ecosistema:
                partidas, rankings, alianzas, moderación, prestigios, administración y PWA.
              </p>
            </div>
            <div className="ah-novedades-hero-note">
              <div style={{ fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Navegación rápida</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <Link to="/novedades" style={{ color: colors.text, textDecoration: 'none', fontWeight: 800 }}>🆕 Ver novedades recientes →</Link>
                <Link to="/rankings" style={{ color: colors.text, textDecoration: 'none', fontWeight: 800 }}>🏆 Ir a rankings →</Link>
                <Link to="/alianzas" style={{ color: colors.text, textDecoration: 'none', fontWeight: 800 }}>🏴 Explorar alianzas →</Link>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 26, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(Object.keys(ROLE_META) as Role[]).map(roleButton)}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar módulo, función o concepto… ej. prestigio, strike, ranking, alianza"
              style={{ ...styles.input, marginBottom: 0, maxWidth: 760, background: 'rgba(255,255,255,0.05)' }}
            />
          </div>
        </div>
      </section>

      <section style={{ padding: '50px 16px 70px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', flexWrap: 'wrap', marginBottom: 24 }}>
              <div>
                <div style={{ color: colors.accent, fontWeight: 900, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>Mapa del producto</div>
                <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', color: colors.text, letterSpacing: -0.5 }}>
                  Módulos para {activeRole === 'publico' ? 'todos' : ROLE_META[activeRole].label.toLowerCase()}
                </h2>
              </div>
              <div style={{ color: colors.muted, fontSize: 13 }}>{visibleModules.length} módulos visibles · {visibleGlossary.length} conceptos</div>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
            {visibleModules.map((m, idx) => {
              const open = openId === m.id;
              return (
                <Reveal key={m.id} delay={Math.min(idx * 35, 180)}>
                  <article className="ah-novedades-card" style={{ ...styles.card, background: 'rgba(13,19,48,0.78)', height: '100%' }}>
                    <button onClick={() => setOpenId(open ? '' : m.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: colors.text, cursor: 'pointer', padding: 0 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: ROLE_META[activeRole].bg, border: `1px solid ${colors.border}`, fontSize: 20, flexShrink: 0 }}>{m.icon}</span>
                        <span style={{ flex: 1 }}>
                          <h3 style={{ margin: '0 0 4px', fontSize: 18, color: colors.text }}>{m.title}</h3>
                          <p style={{ margin: 0, color: colors.muted, fontSize: 13, lineHeight: 1.5 }}>{m.tagline}</p>
                        </span>
                        <span style={{ color: colors.muted, marginTop: 4 }}>{open ? '▴' : '▾'}</span>
                      </div>
                    </button>

                    {open && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                        <p style={{ margin: '0 0 12px', color: colors.muted, fontSize: 13.5, lineHeight: 1.7 }}>{m.description}</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                          {m.roles.map((r) => (
                            <span key={r} style={{ padding: '4px 9px', borderRadius: 999, background: ROLE_META[r].bg, color: ROLE_META[r].color, fontSize: 11, fontWeight: 900 }}>
                              {ROLE_META[r].label}
                            </span>
                          ))}
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'grid', gap: 9 }}>
                          {m.highlights.map((h) => (
                            <li key={h} style={{ display: 'flex', gap: 10, color: colors.text, fontSize: 13, lineHeight: 1.55 }}>
                              <span style={{ color: colors.success, fontWeight: 900 }}>✓</span><span>{h}</span>
                            </li>
                          ))}
                        </ul>
                        <Link to={m.link} style={{ color: colors.accent, textDecoration: 'none', fontWeight: 900, fontSize: 13 }}>
                          {m.linkLabel} →
                        </Link>
                      </div>
                    )}
                  </article>
                </Reveal>
              );
            })}
          </div>

          <Reveal>
            <section style={{ marginTop: 44, ...styles.card, background: colors.cardAlt }}>
              <div style={{ color: colors.accent, fontWeight: 900, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>Flujo recomendado</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 28, color: colors.text }}>Cómo usar AllianceHub como {ROLE_META[activeRole].label.toLowerCase()}</h2>
              <p style={{ margin: '0 0 22px', color: colors.muted }}>{ROLE_META[activeRole].desc}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {FLOWS[activeRole].map((s) => (
                  <div key={s.n} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 950, color: ROLE_META[activeRole].color, marginBottom: 8 }}>{s.n}</div>
                    <h3 style={{ margin: '0 0 8px', fontSize: 16, color: colors.text }}>{s.title}</h3>
                    <p style={{ margin: '0 0 12px', color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>{s.desc}</p>
                    {s.link && <Link to={s.link} style={{ color: colors.accent, textDecoration: 'none', fontWeight: 900, fontSize: 12 }}>Abrir →</Link>}
                  </div>
                ))}
              </div>
            </section>
          </Reveal>

          <Reveal>
            <section style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div style={{ color: colors.accent, fontWeight: 900, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>Glosario vivo</div>
                  <h2 style={{ margin: 0, fontSize: 28, color: colors.text }}>Conceptos que verás por toda la plataforma</h2>
                </div>
                <Link to="/novedades" style={{ color: colors.muted, textDecoration: 'none', fontWeight: 800 }}>¿Qué cambió recientemente? →</Link>
              </div>
              {visibleGlossary.length === 0 ? (
                <p style={{ color: colors.muted }}>No hay conceptos para esa búsqueda.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  {visibleGlossary.map((g) => (
                    <div key={g.term} style={{ ...styles.card, background: 'rgba(13,19,48,0.70)' }}>
                      <h3 style={{ margin: '0 0 8px', color: colors.accent, fontSize: 15 }}>{g.term}</h3>
                      <p style={{ margin: 0, color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>{g.def}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
