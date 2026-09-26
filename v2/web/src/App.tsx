import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { colors } from './theme';
import Reveal from './components/Reveal';
import { serverApi, publicDb, getSessionToken, signOutAll, hasAdminSessionMarker } from './lib/api';
import { useApi } from './hooks/useApi';
import JugadoresPage from './features/players/JugadoresPage';
import SancionesPage from './features/alliance/SancionesPage';
import InvitacionesBadge from './features/alliance/InvitacionesBadge';
import AlianzaPage from './features/alliance/AlianzaPage';
import AlianzasPage from './features/alliance/AlianzasPage';
import AlliancePanelPage from './features/alliance/AlliancePanelPage';
import MiEspacioPage from './features/alliance/MiEspacioPage';
import LoginPage from './features/auth/LoginPage';
import LandingPage from './features/landing/LandingPage';
import NovedadesPage from './features/changelog/NovedadesPage';
import DashboardPage from './features/dashboard/DashboardPage';
import GamePage from './features/game/GamePage';
import ReportPage from './features/report/ReportPage';
import RankingsPage from './features/rankings/RankingsPage';
import RulesPage from './features/rules/RulesPage';
import PlayerPage from './features/player/PlayerPage';
import ApplyLeaderPage from './features/apply-leader/ApplyLeaderPage';
import ChatPage from './features/chat/ChatPage';
import AvisoLegalPage from './features/legal/AvisoLegalPage';
import NotFoundPage from './features/legal/NotFoundPage';
import ResetPasswordPage from './features/auth/ResetPasswordPage';
import RegisterPage from './features/register/RegisterPage';
import RegisterLeaderPage from './features/register/RegisterLeaderPage';
import RegisterOfficerPage from './features/register/RegisterOfficerPage';
// Admin
import MatchTypesPage from './features/admin/MatchTypesPage';
import AdminHomePage from './features/admin/AdminHomePage';
import AdminPlayersPage from './features/admin/AdminPlayersPage';
import AdminMatchesPage from './features/admin/AdminMatchesPage';
import AdminMatchDetailPage from './features/admin/AdminMatchDetailPage';
import AdminGamesPage from './features/admin/AdminGamesPage';
import AdminStrikesPage from './features/admin/AdminStrikesPage';
import AdminSanctionsEnginePage from './features/admin/AdminSanctionsEnginePage';
import AdminReportsPage from './features/admin/AdminReportsPage';
import AdminReviewCommitteePage from './features/admin/AdminReviewCommitteePage';
import AdminInboxPage from './features/admin/AdminInboxPage';
import AdminLeaderRequestsPage from './features/admin/AdminLeaderRequestsPage';
import AdminInvitesPage from './features/admin/AdminInvitesPage';
import AdminOfficersPage from './features/admin/AdminOfficersPage';
import AdminAdminsPage from './features/admin/AdminAdminsPage';
import AdminAllianceMembersPage from './features/admin/AdminAllianceMembersPage';
import AdminAlliancesPage from './features/admin/AdminAlliancesPage';
import AdminCertificationsPage from './features/admin/AdminCertificationsPage';
import AdminRulesEditorPage from './features/admin/AdminRulesEditorPage';
import AdminLeaguesPage from './features/admin/AdminLeaguesPage';
import AdminDuelManagerPage from './features/admin/AdminDuelManagerPage';
import AdminRankingsPage from './features/admin/AdminRankingsPage';
import AdminPrestigesPage from './features/admin/AdminPrestigesPage';
import AdminImportPage from './features/admin/AdminImportPage';
import AdminChatReportsPage from './features/admin/AdminChatReportsPage';
import AdminAuditLogPage from './features/admin/AdminAuditLogPage';
import AdminChatPage from './features/admin/AdminChatPage';
import LeaderDashboardPage from './features/admin/LeaderDashboardPage';

type Me = { kind: 'admin' | 'player'; role?: string; managedAllianceId?: string | null };

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? colors.accent : colors.muted,
  textDecoration: 'none',
  fontWeight: isActive ? 700 : 500,
  fontSize: 14,
  flexShrink: 0,
  padding: '6px 8px',
});

type NavEntry = { to: string; label: string; header?: string };

/**
 * NavDropdown — boton con menu desplegable pensado para dedo en movil:
 * se abre/cierra al toque, se cierra solo al navegar o tocar fuera,
 * y el menu es desplazable si hay muchos elementos.
 */
function NavDropdown({ icon, label, items, currentPath }: { icon: string; label: string; items: NavEntry[]; currentPath: string }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  const active = items.some((i) => !i.header && i.to.length > 1 && currentPath.startsWith(i.to));

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{
        background: open || active ? 'rgba(255,255,255,0.09)' : 'transparent',
        border: `1px solid ${open || active ? colors.border : 'transparent'}`,
        color: open || active ? colors.text : colors.muted,
        borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: active ? 700 : 500,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
        {icon} {label} <span style={{ fontSize: 10, marginLeft: 2 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
          background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12,
          minWidth: 220, maxHeight: '65vh', overflowY: 'auto', padding: 6,
          boxShadow: '0 14px 34px rgba(0,0,0,0.55)',
        }}>
          {items.map((it, idx) => it.header ? (
            <div key={'h' + idx} style={{
              fontSize: 11, fontWeight: 700, color: colors.muted, padding: '9px 10px 3px',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{it.header}</div>
          ) : (
            <NavLink key={it.to + idx} to={it.to} onClick={() => setOpen(false)} style={({ isActive }) => ({
              display: 'block', padding: '9px 10px', borderRadius: 8, fontSize: 13,
              textDecoration: 'none',
              color: isActive ? colors.accent : colors.text, fontWeight: isActive ? 700 : 500,
              background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            })}>{it.label}</NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { data: me, reload } = useApi<Me>(() => serverApi.get('/me'), []);
  const location = useLocation();
  const myAllianceId = me?.managedAllianceId ?? null;
  const loggedIn = !!getSessionToken() || hasAdminSessionMarker();
  const isAdmin = me?.kind === 'admin';
  // "Panel de lider" visible para lideres y para staff con alianza (doble sesion).
  const isLeader = me?.role === 'alliance_leader' || (!!me?.managedAllianceId && me?.kind === 'admin');
  // Modo de navegacion: cada modo (jugador/admin) tiene su propio set de enlaces.
  // Con doble sesion se salta al instante; sin sesion del otro tipo manda al login.
  const [navMode, setNavMode] = useState<'player' | 'admin'>(() =>
    localStorage.getItem('ah2_nav_mode') === 'admin' ? 'admin' : 'player');
  const activeMode: 'player' | 'admin' = isAdmin && navMode === 'admin' ? 'admin' : 'player';

  function switchMode(m: 'player' | 'admin') {
    if (m === activeMode) return;
    if (m === 'player') {
      if (getSessionToken()) {
        setNavMode('player');
        localStorage.setItem('ah2_nav_mode', 'player');
      } else {
        window.location.href = '/login?mode=player';
      }
    } else {
      void publicDb.auth.getSession().then(({ data }) => {
        if (data.session) {
          setNavMode('admin');
          localStorage.setItem('ah2_nav_mode', 'admin');
        } else {
          window.location.href = '/login?mode=admin';
        }
      });
    }
  }

  const commonLinks = (
    <>
      <NavLink to="/partidas" style={navStyle}>Partidas</NavLink>
      <NavLink to="/novedades" style={navStyle}>🆕 Novedades</NavLink>
      <NavLink to="/rankings" style={navStyle}>Rankings</NavLink>
      <NavLink to="/jugadores" style={navStyle}>Mercado</NavLink>
      <NavLink to="/alianzas" style={navStyle}>Alianzas</NavLink>
      <NavLink to="/lider/solicitud" style={navStyle}>Liderazgo</NavLink>
      <NavLink to="/reglas" style={navStyle}>Reglamento</NavLink>
    </>
  );

  const playerLinks = !!getSessionToken() && activeMode === 'player' ? (
    <>
      <NavDropdown icon="🚩" label="Mi alianza" currentPath={location.pathname} items={[
        { to: '/alianza', label: 'Panel de mi alianza' },
        ...(myAllianceId ? [
          { to: '/mi-espacio', label: 'Mi Espacio' },
          { to: '/alianza/sanciones', label: 'Sanciones' },
        ] : []),
        ...(isLeader ? [{ to: '/admin/leader-dashboard', label: 'Panel de líder' }] : []),
      ]} />
      <NavLink to="/reportar" style={navStyle}>Reportar</NavLink>
    </>
  ) : null;

  const adminLinks = isAdmin && activeMode === 'admin' ? (
    <>
      <NavLink to="/admin" style={navStyle}>Panel</NavLink>
      {isLeader && <NavLink to="/admin/leader-dashboard" style={navStyle}>Panel de líder</NavLink>}
      <NavDropdown icon="🛠" label="Gestión" currentPath={location.pathname} items={[
        { to: '/admin/jugadores', label: 'Jugadores' },
        { to: '/admin/partidas', label: 'Partidas' },
        { to: '/admin/alianzas', label: 'Alianzas' },
        { to: '/admin/miembros', label: 'Miembros de alianzas' },
        { to: '/admin/admins', label: 'Administradores' },
        { to: '/admin/officers', label: 'Oficiales' },
        { to: '/admin/invites', label: 'Invitaciones' },
        { to: '/admin/import', label: 'Importar datos' },
        { to: '/admin/audit-log', label: 'Registro de auditoría' },
      ]} />
      <NavDropdown icon="🛡" label="Moderación" currentPath={location.pathname} items={[
        { to: '/admin/strikes', label: 'Strikes' },
        { to: '/admin/sanciones', label: 'Sanciones' },
        { to: '/admin/reportes', label: 'Reportes' },
        { to: '/admin/comite', label: 'Comité de revisión' },
        { to: '/admin/chat-reports', label: 'Reportes de chat' },
        { to: '/admin/solicitudes-lider', label: 'Solicitudes de líder' },
        { to: '/admin/inbox', label: 'Bandeja de entrada' },
      ]} />
      <NavDropdown icon="🏆" label="Competición" currentPath={location.pathname} items={[
        { to: '/admin/juegos', label: 'Juegos' },
        { to: '/admin/ligas', label: 'Ligas' },
        { to: '/admin/duel-manager', label: 'Duelos' },
        { to: '/admin/rankings', label: 'Rankings' },
        { to: '/admin/certificaciones', label: 'Certificaciones' },
        { to: '/admin/prestigios', label: 'Prestigios' },
        { to: '/admin/reglas', label: 'Editor de reglas' },
        ...(me?.role === 'superadmin' ? [{ to: '/admin/match-types', label: 'Tipos de partida' }] : []),
      ]} />
      <NavLink to="/chat" style={navStyle}>Chat</NavLink>
    </>
  ) : null;

  const pillBase: React.CSSProperties = {
    borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  };

  return (
    <div style={{ fontFamily: 'system-ui', background: colors.bg, color: colors.text, minHeight: '100vh' }}>
      <nav style={{
        borderBottom: `1px solid ${colors.border}`, position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(13,19,48,0.85)',
      }}>
        {/* Fila 1: identidad + botones de modo permanentes + entrar/salir */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px' }}>
          <NavLink to="/" style={{ ...navStyle({ isActive: false }), fontWeight: 800, color: colors.accent, fontSize: 16, padding: '6px 0' }}>
            ⚔️ AllianceHub
          </NavLink>
          <button onClick={() => switchMode('player')} style={{
            ...pillBase,
            background: activeMode === 'player' ? colors.success : 'transparent',
            border: `1.5px solid ${colors.success}`,
            color: activeMode === 'player' ? '#08130a' : colors.success,
          }}>🎮 Jugador</button>
          <button onClick={() => switchMode('admin')} style={{
            ...pillBase,
            background: activeMode === 'admin' ? colors.warning : 'transparent',
            border: `1.5px solid ${colors.warning}`,
            color: activeMode === 'admin' ? '#1a1400' : colors.warning,
          }}>🛡 Admin</button>
          <span style={{ flex: 1 }} />
          {loggedIn ? (
            <button onClick={() => { signOutAll().finally(() => reload()); }} style={{
              background: 'transparent', color: colors.muted, border: `1px solid ${colors.border}`,
              padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, flexShrink: 0,
            }}>Salir</button>
          ) : (
            <NavLink to="/login" style={{ ...navStyle({ isActive: false }), border: `1px solid ${colors.border}`, borderRadius: 20, padding: '6px 14px' }}>Entrar</NavLink>
          )}
        </div>
        {/* Fila 2: nav horizontal deslizable con los enlaces del modo activo */}
        <div style={{
          display: 'flex', gap: 2, alignItems: 'center',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch', whiteSpace: 'nowrap',
          padding: '0 12px 8px',
        }}>
          {commonLinks}
          {playerLinks}
          {adminLinks}
        </div>
      </nav>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px' }}>
        <InvitacionesBadge />
        <Reveal key={location.pathname}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/partidas" element={<DashboardPage />} />
          <Route path="/partidas/:id" element={<GamePage />} />
          <Route path="/novedades" element={<NovedadesPage />} />
          <Route path="/reportar" element={<ReportPage />} />
          <Route path="/rankings" element={<RankingsPage />} />
          <Route path="/reglas" element={<RulesPage />} />
          <Route path="/jugador/:id" element={<PlayerPage />} />
          <Route path="/jugadores" element={<JugadoresPage />} />
          <Route path="/alianzas" element={<AlianzasPage />} />
          <Route path="/alianzas/:id" element={<AlianzaPage />} />
          <Route path="/alianza" element={<AlliancePanelPage />} />
          <Route path="/lider/solicitud" element={<ApplyLeaderPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/registro/lider" element={<RegisterLeaderPage />} />
          <Route path="/registro/oficial" element={<RegisterOfficerPage />} />
          <Route path="/aviso-legal" element={<AvisoLegalPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/alianza/sanciones" element={
            myAllianceId ? <SancionesPage allianceId={myAllianceId} /> :
            <p style={{ color: colors.muted }}>Inicia sesión como líder u oficial para ver las sanciones de tu alianza.</p>
          } />
          <Route path="/mi-espacio" element={
            myAllianceId ? <MiEspacioPage allianceId={myAllianceId} /> :
            <p style={{ color: colors.muted }}>Inicia sesión como líder u oficial para gestionar tu espacio.</p>
          } />
          {/* Admin */}
          <Route path="/admin" element={<AdminHomePage />} />
          <Route path="/admin/match-types" element={<MatchTypesPage />} />
          <Route path="/admin/jugadores" element={<AdminPlayersPage />} />
          <Route path="/admin/partidas" element={<AdminMatchesPage />} />
          <Route path="/admin/partida" element={<AdminMatchDetailPage />} />
          <Route path="/admin/juegos" element={<AdminGamesPage />} />
          <Route path="/admin/strikes" element={<AdminStrikesPage />} />
          <Route path="/admin/sanciones" element={<AdminSanctionsEnginePage />} />
          <Route path="/admin/reportes" element={<AdminReportsPage />} />
          <Route path="/admin/comite" element={<AdminReviewCommitteePage />} />
          <Route path="/admin/inbox" element={<AdminInboxPage />} />
          <Route path="/admin/solicitudes-lider" element={<AdminLeaderRequestsPage />} />
          <Route path="/admin/invites" element={<AdminInvitesPage />} />
          <Route path="/admin/officers" element={<AdminOfficersPage />} />
          <Route path="/admin/admins" element={<AdminAdminsPage />} />
          <Route path="/admin/miembros" element={<AdminAllianceMembersPage />} />
          <Route path="/admin/alianzas" element={<AdminAlliancesPage />} />
          <Route path="/admin/certificaciones" element={<AdminCertificationsPage />} />
          <Route path="/admin/reglas" element={<AdminRulesEditorPage />} />
          <Route path="/admin/ligas" element={<AdminLeaguesPage />} />
          <Route path="/admin/duel-manager" element={<AdminDuelManagerPage />} />
          <Route path="/admin/rankings" element={<AdminRankingsPage />} />
          <Route path="/admin/prestigios" element={<AdminPrestigesPage />} />
          <Route path="/admin/import" element={<AdminImportPage />} />
          <Route path="/admin/chat-reports" element={<AdminChatReportsPage />} />
          <Route path="/admin/chat" element={<AdminChatPage />} />
          <Route path="/admin/leader-dashboard" element={<LeaderDashboardPage />} />
          {/* Alias en ingles: el panel enlaza estas rutas; antes daban 404. */}
          <Route path="/admin/games" element={<AdminGamesPage />} />
          <Route path="/admin/leagues" element={<AdminLeaguesPage />} />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
          <Route path="/admin/review-committee" element={<AdminReviewCommitteePage />} />
          <Route path="/admin/alianza-miembros" element={<AdminAllianceMembersPage />} />
          <Route path="/admin/leader-requests" element={<AdminLeaderRequestsPage />} />
          <Route path="/admin/certifications" element={<AdminCertificationsPage />} />
          <Route path="/admin/rules-editor" element={<AdminRulesEditorPage />} />
          <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Reveal>
      </main>
    </div>
  );
}
