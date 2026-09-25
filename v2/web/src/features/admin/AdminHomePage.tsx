import { Link } from 'react-router-dom';
import AdminGate from '../../components/AdminGate';
import { colors, styles } from '../../theme';
import Reveal from '../../components/Reveal';

const SECTIONS: { title: string; links: { to: string; label: string; desc: string }[] }[] = [
  {
    title: 'Competencia',
    links: [
      { to: '/admin/partidas', label: 'Partidas', desc: 'Crear, editar y eliminar partidas' },
      { to: '/admin/partida', label: 'Detalle de partida', desc: 'Registrados, resultados, CSV y ganadores' },
      { to: '/admin/games', label: 'Games', desc: 'Partidas tipo game del v1' },
      { to: '/admin/rankings', label: 'Rankings', desc: 'Vista administrativa de rankings' },
      { to: '/admin/duel-manager', label: 'Duel Manager', desc: 'Gestion de duelos entre alianzas' },
      { to: '/admin/leagues', label: 'Ligas', desc: 'Gestion de ligas' },
      { to: '/admin/import', label: 'Importar', desc: 'Importacion de datos' },
    ],
  },
  {
    title: 'Sanciones',
    links: [
      { to: '/admin/strikes', label: 'Strikes', desc: 'Aplicar y gestionar strikes' },
      { to: '/admin/sanciones', label: 'Motor de sanciones', desc: 'Baneos y suspensiones' },
      { to: '/admin/reports', label: 'Reportes', desc: 'Reportes de jugadores' },
      { to: '/admin/review-committee', label: 'Comite de revision', desc: 'Auditoria de decisiones' },
      { to: '/admin/inbox', label: 'Bandeja', desc: 'Reportes de chat y pendientes' },
    ],
  },
  {
    title: 'Comunidad',
    links: [
      { to: '/admin/jugadores', label: 'Jugadores', desc: 'Gestion de jugadores y bans' },
      { to: '/admin/alianzas', label: 'Alianzas', desc: 'Directorio y edicion de alianzas' },
      { to: '/admin/alianza-miembros', label: 'Miembros de alianza', desc: 'Asignacion de miembros' },
      { to: '/admin/leader-requests', label: 'Solicitudes de lider', desc: 'Aprobar o rechazar solicitudes' },
      { to: '/admin/invites', label: 'Invitaciones', desc: 'Codigos de invitacion' },
      { to: '/admin/officers', label: 'Oficiales', desc: 'Roles oficiales de alianzas' },
      { to: '/admin/admins', label: 'Admins', desc: 'Cuentas administrativas' },
      { to: '/admin/certifications', label: 'Certificaciones', desc: 'Certs de lideres' },
    ],
  },
  {
    title: 'Reglamento',
    links: [
      { to: '/admin/rules-editor', label: 'Editor de reglas', desc: 'Secciones, subsecciones y precedentes' },
      { to: '/admin/chat-reports', label: 'Reportes de chat', desc: 'Moderacion del chat' },
      { to: '/admin/audit-log', label: 'Auditoria', desc: 'Log de acciones administrativas' },
      { to: '/admin/match-types', label: 'Tipos de partida', desc: 'Catalogo de tipos (v2)' },
    ],
  },
];

/** AdminHomePage — puerto de admin/index.html (panel principal). */
export default function AdminHomePage() {
  return (
    <AdminGate>
      <h1 style={{ color: colors.text }}>🛠️ Panel de Admin</h1>
      <p style={{ color: colors.muted, fontSize: 13, marginBottom: 24 }}>
        Bienvenido al panel administrativo de AllianceHub. Selecciona una seccion.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {SECTIONS.map((sec, i) => (
          <Reveal key={sec.title} delay={i * 60}>
            <div style={styles.card}>
              <h2 style={{ margin: '0 0 12px', fontSize: 15, color: colors.accent }}>{sec.title}</h2>
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
    </AdminGate>
  );
}
