import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
import FuncionesPage from './features/guide/FuncionesPage';
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
import AdminMatchDetailPage from './features/admin/AdminMatchDetailPage';
import AdminReviewCommitteePage from './features/admin/AdminReviewCommitteePage';
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
import AdminAuditLogPage from './features/admin/AdminAuditLogPage';
import AdminChatPage from './features/admin/AdminChatPage';
import LeaderDashboardPage from './features/admin/LeaderDashboardPage';
import InfoPage from './features/info/InfoPage';
import AdminConductaPage from './features/admin/AdminConductaPage';
import AdminReportesPage from './features/admin/AdminReportesPage';
import AdminPartidasPage from './features/admin/AdminPartidasPage';

type Me = { kind: 'admin' | 'player'; role?: string; playerId?: number; managedAllianceId?: string | null; officerRole?: string | null };

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? colors.accent : colors.muted,
  textDecoration: 'none',
  fontWeight: isActive ? 700 : 500,
  fontSize: 14,
  flexShrink: 0,
  padding: '6px 8px',
});

type NavEntry = { to: string; label: string; header?: string };

/** Redirect que preserva la query original (p.ej. prefill_* de strikes). */
function RedirectKeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  if (!search) return <Navigate to={to} replace />;
  const sep = to.includes('?') ? '&' : '?';
  return <Navigate to={to + sep + search.slice(1)} replace />;
}

/**
 * NavDropdown — boton con menu desplegable pensado para dedo en movil:
 * se abre/cierra al toque, se cierra solo al navegar o tocar fuera,
 * y el menu es desplazable si hay muchos elementos.
 */
function NavDropdown({ icon, label, items, currentPath }: { icon: string; label: string; items: NavEntry[]; currentPath: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  const active = items.some((i) => !i.header && i.to.length > 1 && currentPath.startsWith(i.to.split('?')[0]));

  // El menu se renderiza en un PORTAL con posicion fija: la fila del nav tiene
  // overflow-x:auto, que fuerza overflow-y:auto y recorta (invisible) cualquier
  // menu absoluto desplegado dentro — en el PWA ningun dropdown se veia.
  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    setPos(r ? { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) } : null);
    setOpen(true);
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button ref={btnRef} onClick={toggle} style={{
        background: open || active ? 'rgba(255,255,255,0.09)' : 'transparent',
        border: `1px solid ${open || active ? colors.border : 'transparent'}`,
        color: open || active ? colors.text : colors.muted,
        borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: active ? 700 : 500,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
        {icon} {label} <span style={{ fontSize: 10, marginLeft: 2 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && pos && createPortal(
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
          background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12,
          minWidth: 220, maxWidth: 'calc(100vw - 16px)', maxHeight: '65vh', overflowY: 'auto', padding: 6,
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
        </div>,
        document.body
      )}
    </div>
  );
}

export default function App() {
  const { data: me, loading: meLoading, error: meError, reload } = useApi<Me>(() => serverApi.get('/me'), []);
  const location = useLocation();
  const navigate = useNavigate();
  const myAllianceId = me?.managedAllianceId ?? null;
  const loggedIn = !!getSessionToken() || hasAdminSessionMarker();
  // Modo admin OPTIMISTA: si hay marcador de sesion admin, se ofrece el modo
  // aunque /me este cargando o haya fallado (en el PWA la sesion Supabase
  // puede caducar y /me devolver player/error -> antes el boton Admin quedaba
  // en nada). El contenido de cada pagina sigue protegido por AdminGate.
  const isAdmin = me?.kind === 'admin'
    || (hasAdminSessionMarker() && (!!meError || meLoading));
  // "Panel de lider" visible para lideres y para staff con alianza (doble sesion).
  const isLeader = me?.role === 'alliance_leader' || (!!me?.managedAllianceId && me?.kind === 'admin');
  // Oficial de alianza: cuenta auth SIN fila admin_users pero con fila en
  // alliance_officers. Tiene workspace propio (herramientas de oficial) aunque
  // no sea admin: al tocar "Admin" entra a SU panel, no al de staff.
  const isOfficer = !isAdmin && me?.kind === 'player' && !!me?.officerRole && !!me?.managedAllianceId;
  const hasWorkspace = isAdmin || isOfficer;
  // Modo de navegacion: cada modo (jugador/admin) tiene su propio set de enlaces.
  // Con doble sesion se salta al instante; sin sesion del otro tipo manda al login.
  const [navMode, setNavMode] = useState<'player' | 'admin'>(() =>
    localStorage.getItem('ah2_nav_mode') === 'admin' ? 'admin' : 'player');
  const activeMode: 'player' | 'admin' = hasWorkspace && navMode === 'admin' ? 'admin' : 'player';

  function switchMode(m: 'player' | 'admin') {
    if (m === activeMode) return;
    if (m === 'player') {
      if (getSessionToken()) {
        setNavMode('player');
        localStorage.setItem('ah2_nav_mode', 'player');
      } else {
        // Navegacion client-side: un location.href completo pasaria por
        // 404.html y perderiamos la query (?mode=player) en el redirect.
        navigate('/login?mode=player');
      }
    } else {
      void publicDb.auth.getSession().then(({ data }) => {
        if (data.session) {
          setNavMode('admin');
          localStorage.setItem('ah2_nav_mode', 'admin');
        } else {
          navigate('/login?mode=admin');
        }
      }).catch(() => navigate('/login?mode=admin'));
    }
  }

  // Enlaces publicos: solo visibles en modo jugador (en modo admin el staff
  // trabaja con el panel; el logo vuelve a la vista publica).
  const commonLinks = activeMode === 'player' ? (
    <>
      <NavLink to="/partidas" style={navStyle}>Partidas</NavLink>
      <NavLink to="/rankings" style={navStyle}>Rankings</NavLink>
      <NavLink to="/alianzas" style={navStyle}>Alianzas</NavLink>
      <NavDropdown icon="ℹ️" label="Información" currentPath={location.pathname} items={[
        { to: '/info?tab=novedades', label: '🆕 Novedades' },
        { to: '/info?tab=funciones', label: '🧭 Funciones del proyecto' },
        { to: '/info?tab=reglas', label: '📜 Reglamento' },
        { to: '/info?tab=liderazgo', label: '🛡 Cómo ser líder' },
      ]} />
    </>
  ) : null;

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

  // Nav admin: 4-5 cabeceras con las ~20 paginas repartidas, filtradas por
  // rol (un alliance_leader no ve herramientas de staff que RLS le bloquea).
  const role = me?.role;
  const isStaff = role === 'superadmin' || role === 'event_admin' || role === 'moderator';
  const isSuper = role === 'superadmin';
  const adminLinks = isAdmin && activeMode === 'admin' ? (
    <>
      <NavLink to="/admin" style={navStyle}>Panel</NavLink>
      {/* Acceso compacto a las paginas publicas desde el modo admin:
          ocultarlas del todo dejaba esas paginas inaccesibles sin cambiar de modo. */}
      <NavDropdown icon="🌐" label="Sitio" currentPath={location.pathname} items={[
        { to: '/partidas', label: '🎯 Partidas' },
        { to: '/rankings', label: '🏆 Rankings' },
        { to: '/alianzas', label: '🛡 Alianzas' },
        { to: '/info?tab=novedades', label: '🆕 Novedades' },
        { to: '/info?tab=funciones', label: '🧭 Funciones' },
        { to: '/info?tab=reglas', label: '📜 Reglamento' },
      ]} />
      <NavDropdown icon="🗂" label="Gestión" currentPath={location.pathname} items={[
        ...(isLeader ? [{ to: '/admin/leader-dashboard', label: 'Panel de líder' }] : []),
        ...(isStaff ? [
          { to: '/admin/jugadores', label: 'Jugadores' },
          { to: '/admin/partidas', label: 'Partidas' },
          { to: '/admin/alianzas', label: 'Alianzas' },
          { to: '/admin/officers', label: 'Oficiales' },
          { to: '/admin/invites', label: 'Invitaciones' },
        ] : []),
        { to: '/admin/miembros', label: 'Miembros de alianzas' },
        ...(isSuper ? [
          { to: '/admin/admins', label: 'Administradores' },
          { to: '/admin/audit-log', label: 'Registro de auditoría' },
        ] : []),
      ]} />
      {/* Moderacion es de staff: un lider puro no la ve (sus herramientas de
          disciplina estan en el panel de lider y en /alianza/sanciones). */}
      {isStaff && (
        <NavDropdown icon="🛡" label="Moderación" currentPath={location.pathname} items={[
          { to: '/admin/conducta', label: 'Conducta (strikes y sanciones)' },
          { to: '/admin/reportes', label: 'Reportes y bandeja' },
          { to: '/admin/comite', label: 'Comité de revisión' },
          { to: '/admin/solicitudes-lider', label: 'Solicitudes de líder' },
          { to: '/admin/chat', label: 'Chat' },
        ]} />
      )}
      <NavDropdown icon="🏆" label="Competición" currentPath={location.pathname} items={[
        ...(isStaff ? [
          { to: '/admin/ligas', label: 'Ligas' },
          { to: '/admin/duel-manager', label: 'Duelos' },
          { to: '/admin/rankings', label: 'Rankings' },
          { to: '/admin/certificaciones', label: 'Certificaciones' },
        ] : []),
        { to: '/admin/prestigios', label: 'Prestigios' },
      ]} />
      {isStaff && (
        <NavDropdown icon="⚙️" label="Config" currentPath={location.pathname} items={[
          { to: '/admin/reglas', label: 'Editor de reglas' },
          { to: '/admin/import', label: 'Importar datos' },
          ...(isSuper ? [{ to: '/admin/match-types', label: 'Tipos de partida' }] : []),
        ]} />
      )}
    </>
  ) : null;

  // Workspace del oficial: mismas paginas a las que ya tiene acceso por RLS
  // (sin AdminGate), presentadas como "su panel". Las herramientas de gestion
  // propiamente dichas llegan con los permisos por rol (officer/co_leader).
  const officerLinks = isOfficer && activeMode === 'admin' ? (
    <>
      <NavDropdown icon="🚩" label="Mi alianza" currentPath={location.pathname} items={[
        { to: '/alianza', label: '🛡 Panel de mi alianza' },
        { to: '/mi-espacio', label: '🎮 Mi Espacio' },
        { to: '/alianza/sanciones', label: '⚖️ Sanciones de mi alianza' },
      ]} />
      <NavLink to="/reportar" style={navStyle}>Reportar</NavLink>
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
          {officerLinks}
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
          <Route path="/info" element={<InfoPage />} />
          <Route path="/funciones" element={<FuncionesPage />} />
          <Route path="/reportar" element={<ReportPage />} />
          <Route path="/rankings" element={<RankingsPage />} />
          <Route path="/reglas" element={<RulesPage />} />
          <Route path="/jugador/:id" element={<PlayerPage />} />
          <Route path="/jugadores" element={<Navigate to="/rankings?tab=market" replace />} />
          {/* ^ sin params que preservar; los de abajo usan RedirectKeepQuery */}
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
          <Route path="/admin/partidas" element={<AdminPartidasPage />} />
          <Route path="/admin/partida" element={<AdminMatchDetailPage />} />
          <Route path="/admin/conducta" element={<AdminConductaPage />} />
          <Route path="/admin/strikes" element={<RedirectKeepQuery to="/admin/conducta?tab=strikes" />} />
          <Route path="/admin/sanciones" element={<RedirectKeepQuery to="/admin/conducta?tab=sanciones" />} />
          <Route path="/admin/reportes" element={<AdminReportesPage />} />
          <Route path="/admin/chat-reports" element={<RedirectKeepQuery to="/admin/reportes?tab=chat" />} />
          <Route path="/admin/inbox" element={<RedirectKeepQuery to="/admin/reportes?tab=bandeja" />} />
          <Route path="/admin/comite" element={<AdminReviewCommitteePage />} />
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
          <Route path="/admin/chat" element={<AdminChatPage />} />
          <Route path="/admin/leader-dashboard" element={<LeaderDashboardPage />} />
          {/* Alias en ingles: redirigen a las paginas unificadas. */}
          <Route path="/admin/games" element={<RedirectKeepQuery to="/admin/partidas?tab=games" />} />
          <Route path="/admin/leagues" element={<AdminLeaguesPage />} />
          <Route path="/admin/reports" element={<RedirectKeepQuery to="/admin/reportes?tab=jugadores" />} />
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
