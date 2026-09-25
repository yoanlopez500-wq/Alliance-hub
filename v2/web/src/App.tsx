import { Routes, Route, NavLink } from 'react-router-dom';
import { colors } from './theme';
import { serverApi, getSessionToken, setSessionToken } from './lib/api';
import { useApi } from './hooks/useApi';
import JugadoresPage from './features/players/JugadoresPage';
import SancionesPage from './features/alliance/SancionesPage';
import InvitacionesBadge from './features/alliance/InvitacionesBadge';
import MatchTypesPage from './features/admin/MatchTypesPage';
import AlianzaPage from './features/alliance/AlianzaPage';
import MiEspacioPage from './features/alliance/MiEspacioPage';
import LoginPage from './features/auth/LoginPage';

type Me = { kind: 'admin' | 'player'; role?: string; managedAllianceId?: string | null };

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? colors.accent : colors.muted,
  textDecoration: 'none',
  fontWeight: isActive ? 700 : 500,
  fontSize: 14,
});

export default function App() {
  const { data: me, reload } = useApi<Me>(() => serverApi.get('/me'), []);
  const myAllianceId = me?.managedAllianceId ?? null;
  const loggedIn = !!getSessionToken();

  return (
    <div style={{ fontFamily: 'system-ui', background: colors.bg, color: colors.text, minHeight: '100vh' }}>
      <nav style={{
        display: 'flex', gap: 20, alignItems: 'center', padding: '14px 24px',
        borderBottom: `1px solid ${colors.border}`, background: colors.card, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <NavLink to="/" style={{ ...navStyle({ isActive: false }), fontWeight: 800, color: colors.accent, fontSize: 16 }}>
          ⛨ AllianceHub 2.0
        </NavLink>
        <NavLink to="/jugadores" style={navStyle}>Jugadores</NavLink>
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
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        <InvitacionesBadge />
        <Routes>
          <Route path="/" element={
            <div>
              <h1 style={{ color: colors.text }}>Big Update — alpha</h1>
              <p style={{ color: colors.muted }}>
                Núcleo v2: server Fastify modular, componentes React reutilizables,
                sanciones aisladas por alianza, mercado de transferencias y tipos de partida administrables.
              </p>
            </div>
          } />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/jugadores" element={<JugadoresPage />} />
          <Route path="/alianzas/:id" element={<AlianzaPage />} />
          <Route path="/alianza/sanciones" element={
            myAllianceId ? <SancionesPage allianceId={myAllianceId} /> :
            <p style={{ color: colors.muted }}>Inicia sesión como líder u oficial para ver las sanciones de tu alianza.</p>
          } />
          <Route path="/mi-espacio" element={
            myAllianceId ? <MiEspacioPage allianceId={myAllianceId} /> :
            <p style={{ color: colors.muted }}>Inicia sesión como líder u oficial para gestionar tu espacio.</p>
          } />
          <Route path="/admin/match-types" element={<MatchTypesPage />} />
        </Routes>
      </main>
    </div>
  );
}
