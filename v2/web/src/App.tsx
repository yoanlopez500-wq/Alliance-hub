import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { colors } from './theme';
import Reveal from './components/Reveal';
import { serverApi, getSessionToken, setSessionToken } from './lib/api';
import { useApi } from './hooks/useApi';
import JugadoresPage from './features/players/JugadoresPage';
import SancionesPage from './features/alliance/SancionesPage';
import InvitacionesBadge from './features/alliance/InvitacionesBadge';
import MatchTypesPage from './features/admin/MatchTypesPage';
import AlianzaPage from './features/alliance/AlianzaPage';
import AlianzasPage from './features/alliance/AlianzasPage';
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
        <NavLink to="/partidas" style={navStyle}>Partidas</NavLink>
        <NavLink to="/rankings" style={navStyle}>Rankings</NavLink>
        <NavLink to="/reglas" style={navStyle}>Reglamento</NavLink>
        <NavLink to="/alianzas" style={navStyle}>Alianzas</NavLink>
        <NavLink to="/lider/solicitud" style={navStyle}>Liderazgo</NavLink>
        {isAdmin && <NavLink to="/chat" style={navStyle}>Chat</NavLink>}
        {myAllianceId && <NavLink to="/alianza/sanciones" style={navStyle}>Sanciones</NavLink>}
        {myAllianceId && <NavLink to="/mi-espacio" style={navStyle}>Mi Espacio</NavLink>}
        {me?.role === 'superadmin' && <NavLink to="/admin/match-types" style={navStyle}>Tipos de partida</NavLink>}
        <span style={{ flex: 1 }} />
        {loggedIn ? (
          <button onClick={() => { setSessionToken(null); reload(); }} style={{
            background: colors.border, color: colors.muted, border: 'none', padding: '6px 14px',
            borderRadius: 8, cursor: 'pointer', fontSize: 13,
          }}>Salir</button>
        ) : (
          <NavLink to="/login" style={navStyle}>Entrar</NavLink>
        )}
      </nav>
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
          <Route path="/lider/solicitud" element={<ApplyLeaderPage />} />
          <Route path="/chat" element={<ChatPage />} />
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
          <Route path="/admin/match-types" element={<MatchTypesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Reveal>
      </main>
    </div>
  );
}
