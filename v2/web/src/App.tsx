import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { colors } from './theme';
import Reveal from './components/Reveal';
import { serverApi, getSessionToken, signOutAll } from './lib/api';
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
import AdminImportPage from './features/admin/AdminImportPage';
import AdminChatReportsPage from './features/admin/AdminChatReportsPage';
import AdminChatPage from './features/admin/AdminChatPage';
import LeaderDashboardPage from './features/admin/LeaderDashboardPage';

type Me = { kind: 'admin' | 'player'; role?: string; managedAllianceId?: string | null };

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? colors.accent : colors.muted,
  textDecoration: 'none',
  fontWeight: isActive ? 700 : 500,
  fontSize: 14,
});

export default function App() {
  const { data: me, reload } = useApi<Me>(() => serverApi.get('/me'), []);
  const location = useLocation();
  const myAllianceId = me?.managedAllianceId ?? null;
  const loggedIn = !!getSessionToken();
  const isAdmin = me?.kind === 'admin';
  const isLeader = me?.role === 'alliance_leader';
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const navLinks = (
    <>
      <NavLink to="/partidas" style={navStyle}>Partidas</NavLink>
      <NavLink to="/rankings" style={navStyle}>Rankings</NavLink>
      <NavLink to="/reglas" style={navStyle}>Reglamento</NavLink>
      <NavLink to="/jugadores" style={navStyle}>Mercado</NavLink>
      <NavLink to="/alianzas" style={navStyle}>Alianzas</NavLink>
      <NavLink to="/lider/solicitud" style={navStyle}>Liderazgo</NavLink>
      {isLeader && <NavLink to="/admin/leader-dashboard" style={navStyle}>Panel de líder</NavLink>}
      {isAdmin && <NavLink to="/chat" style={navStyle}>Chat</NavLink>}
      {myAllianceId && <NavLink to="/alianza" style={navStyle}>Mi alianza</NavLink>}
      {myAllianceId && <NavLink to="/alianza/sanciones" style={navStyle}>Sanciones</NavLink>}
      {myAllianceId && <NavLink to="/mi-espacio" style={navStyle}>Mi Espacio</NavLink>}
      {isAdmin && <NavLink to="/admin" style={navStyle}>Panel admin</NavLink>}
      {me?.role === 'superadmin' && <NavLink to="/admin/match-types" style={navStyle}>Tipos de partida</NavLink>}
    </>
  );

  return (
    <div style={{ fontFamily: 'system-ui', background: colors.bg, color: colors.text, minHeight: '100vh' }}>
      <nav style={{
        display: 'flex', gap: 18, alignItems: 'center', padding: '14px 24px',
        borderBottom: `1px solid ${colors.border}`, position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(13,19,48,0.75)',
        flexWrap: 'wrap',
      }}>
        <NavLink to="/" style={{ ...navStyle({ isActive: false }), fontWeight: 800, color: colors.accent, fontSize: 16 }}>
          ⚔️ AllianceHub
        </NavLink>
        {isMobile ? (
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menú"
            style={{
              background: colors.border, color: colors.text, border: 'none',
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 18,
            }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        ) : (
          <>
            {navLinks}
            <span style={{ flex: 1 }} />
            {loggedIn ? (
              <button onClick={() => { signOutAll().finally(() => reload()); }} style={{
                background: colors.border, color: colors.muted, border: 'none', padding: '6px 14px',
                borderRadius: 8, cursor: 'pointer', fontSize: 13,
              }}>Salir</button>
            ) : (
              <NavLink to="/login" style={navStyle}>Entrar</NavLink>
            )}
          </>
        )}
      </nav>
      {isMobile && menuOpen && (
        <div className="ah-glass-dark" style={{
          position: 'sticky', top: 53, zIndex: 9, padding: '12px 20px',
          display: 'flex', flexDirection: 'column', gap: 12,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {navLinks}
          {loggedIn ? (
            <button onClick={() => { signOutAll().finally(() => reload()); }} style={{
              background: colors.border, color: colors.muted, border: 'none', padding: '6px 14px',
              borderRadius: 8, cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start',
            }}>Salir</button>
          ) : (
            <NavLink to="/login" style={navStyle}>Entrar</NavLink>
          )}
        </div>
      )}
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px' }}>
        <InvitacionesBadge />
        <Reveal key={location.pathname}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/partidas" element={<DashboardPage />} />
          <Route path="/partidas/:id" element={<GamePage />} />
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
          <Route path="/admin/import" element={<AdminImportPage />} />
          <Route path="/admin/chat-reports" element={<AdminChatReportsPage />} />
          <Route path="/admin/chat" element={<AdminChatPage />} />
          <Route path="/admin/leader-dashboard" element={<LeaderDashboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Reveal>
      </main>
    </div>
  );
}
