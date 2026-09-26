import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminGate from '../../components/AdminGate';
import { useAdmin, isStaffRole } from '../../lib/admin';
import { colors, styles } from '../../theme';
import Reveal from '../../components/Reveal';

interface Section { title: string; icon: string; links: { to: string; label: string; desc: string }[] }

/** Todas las herramientas admin, agrupadas. El buscador filtra por titulo y descripcion. */
const SECTIONS: Section[] = [
  {
    title: 'Gestión',
    icon: '🗂',
    links: [
      { to: '/admin/leader-dashboard', label: 'Panel de líder', desc: 'Miembros, solicitudes y partidas de tu alianza' },
      { to: '/admin/jugadores', label: 'Jugadores', desc: 'Gestión de jugadores y bans' },
      { to: '/admin/partidas', label: 'Partidas', desc: 'CRUD v2 + games del v1, detalle, importación y ganadores' },
      { to: '/admin/alianzas', label: 'Alianzas', desc: 'Directorio y edición de alianzas' },
      { to: '/admin/miembros', label: 'Miembros de alianzas', desc: 'Asignación y estado de miembros' },
      { to: '/admin/admins', label: 'Administradores', desc: 'Cuentas administrativas y roles' },
      { to: '/admin/officers', label: 'Oficiales', desc: 'Roles oficiales de alianzas' },
      { to: '/admin/invites', label: 'Invitaciones', desc: 'Códigos de invitación' },
    ],
  },
  {
    title: 'Moderación',
    icon: '🛡',
    links: [
      { to: '/admin/conducta?tab=strikes', label: 'Strikes', desc: 'Aplicar y gestionar strikes' },
      { to: '/admin/conducta?tab=sanciones', label: 'Sanciones', desc: 'Baneos y suspensiones' },
      { to: '/admin/reportes', label: 'Reportes y bandeja', desc: 'Reportes de jugadores, de chat y mensajes' },
      { to: '/admin/comite', label: 'Comité de revisión', desc: 'Auditoría de decisiones' },
      { to: '/admin/solicitudes-lider', label: 'Solicitudes de líder', desc: 'Aprobar o rechazar altas de liderazgo' },
      { to: '/admin/chat', label: 'Chat', desc: 'Moderación del chat en vivo' },
      { to: '/admin/audit-log', label: 'Auditoría', desc: 'Log de acciones administrativas' },
    ],
  },
  {
    title: 'Competición',
    icon: '🏆',
    links: [
      { to: '/admin/rankings', label: 'Rankings', desc: 'Vista administrativa de rankings' },
      { to: '/admin/ligas', label: 'Ligas', desc: 'Gestión de ligas' },
      { to: '/admin/duel-manager', label: 'Duelos', desc: 'Gestión de duelos entre alianzas' },
      { to: '/admin/certificaciones', label: 'Certificaciones', desc: 'Certs de líderes' },
      { to: '/admin/prestigios', label: 'Prestigios', desc: 'Insignias de plataforma y alianzas' },
    ],
  },
  {
    title: 'Configuración',
    icon: '⚙️',
    links: [
      { to: '/admin/reglas', label: 'Editor de reglas', desc: 'Secciones, subsecciones y precedentes' },
      { to: '/admin/import', label: 'Importar datos', desc: 'Importación de resultados' },
      { to: '/admin/match-types', label: 'Tipos de partida', desc: 'Catálogo de tipos (v2)' },
    ],
  },
];

/** AdminHomePage — hub del panel admin: tarjetas agrupadas + buscador global.
 *  Filtrado por rol: un lider puro solo ve las herramientas de liderazgo
 *  (el resto le apareceria como enlaces rotos de permisos). */
const LEADER_LINKS = new Set(['/admin/leader-dashboard', '/admin/miembros', '/admin/officers', '/admin/prestigios']);

export default function AdminHomePage() {
  const [query, setQuery] = useState('');
  const { admin } = useAdmin();
  const staff = isStaffRole(admin?.role);

  const roleSections = useMemo(
    () => staff
      ? SECTIONS
      : SECTIONS
          .map((sec) => ({ ...sec, links: sec.links.filter((l) => LEADER_LINKS.has(l.to.split('?')[0])) }))
          .filter((sec) => sec.links.length > 0),
    [staff],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roleSections;
    return roleSections
      .map((sec) => ({
        ...sec,
        links: sec.links.filter((l) =>
          (l.label + ' ' + l.desc + ' ' + sec.title).toLowerCase().includes(q)),
      }))
      .filter((sec) => sec.links.length > 0);
  }, [query, roleSections]);

  const total = useMemo(() => roleSections.reduce((n, s) => n + s.links.length, 0), [roleSections]);

  return (
    <AdminGate>
      <h1 style={{ color: colors.text, margin: '0 0 4px' }}>{staff ? '🛠️ Panel de Admin' : '🚩 Panel de líder'}</h1>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 16px' }}>
        {total} herramientas. Escribe para filtrar — por ejemplo «strike», «liga» o «invitación».
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Buscar herramienta..."
        autoFocus
        style={{
          ...styles.input, maxWidth: 420, marginBottom: 20, fontSize: 14,
        }}
      />
      {filtered.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>Sin resultados para «{query}».</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map((sec, i) => (
            <Reveal key={sec.title} delay={i * 60}>
              <div style={styles.card}>
                <h2 style={{ margin: '0 0 12px', fontSize: 15, color: colors.accent }}>{sec.icon} {sec.title}</h2>
                <div style={{ display: 'grid', gap: 6 }}>
                  {sec.links.map((l) => (
                    <Link key={l.to + l.label} to={l.to} style={{
                      display: 'block', padding: '8px 10px', borderRadius: 8, textDecoration: 'none',
                      background: colors.bg, border: `1px solid ${colors.border}`,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{l.label}</span>
                      <span style={{ fontSize: 11, color: colors.muted, display: 'block' }}>{l.desc}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </AdminGate>
  );
}
