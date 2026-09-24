import { Routes, Route, NavLink } from 'react-router-dom';
import JugadoresPage from './features/players/JugadoresPage';
import SancionesPage from './features/alliance/SancionesPage';
import InvitacionesBadge from './features/alliance/InvitacionesBadge';
import MatchTypesPage from './features/admin/MatchTypesPage';

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? '#ff8f00' : '#9fa8da',
  textDecoration: 'none',
  fontWeight: isActive ? 700 : 500,
  fontSize: 14,
});

export default function App() {
  // TODO(v2-auth): resolver la alianza administrada por la sesion actual
  // (endpoint server) en lugar de este placeholder de desarrollo.
  const myAllianceId = (import.meta.env.VITE_DEV_ALLIANCE_ID as string) ?? '';

  return (
    <div style={{ fontFamily: 'system-ui', background: '#0a0e27', color: '#e8eaf6', minHeight: '100vh' }}>
      <nav style={{
        display: 'flex', gap: 20, alignItems: 'center', padding: '14px 24px',
        borderBottom: '1px solid #1a237e', background: '#0d1330', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <NavLink to="/" style={{ ...navStyle({ isActive: false }), fontWeight: 800, color: '#ff8f00', fontSize: 16 }}>
          ⛨ AllianceHub 2.0
        </NavLink>
        <NavLink to="/jugadores" style={navStyle}>Jugadores</NavLink>
        <NavLink to="/alianza/sanciones" style={navStyle}>Sanciones</NavLink>
        <NavLink to="/admin/match-types" style={navStyle}>Tipos de partida</NavLink>
      </nav>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        <InvitacionesBadge />
        <Routes>
          <Route path="/" element={
            <div>
              <h1 style={{ color: '#fff' }}>Big Update — alpha</h1>
              <p style={{ color: '#9fa8da' }}>
                Núcleo v2: server Fastify modular, componentes React reutilizables,
                sanciones aisladas por alianza, mercado de transferencias y tipos de partida administrables.
              </p>
            </div>
          } />
          <Route path="/jugadores" element={<JugadoresPage />} />
          <Route path="/alianza/sanciones" element={<SancionesPage allianceId={myAllianceId} />} />
          <Route path="/admin/match-types" element={<MatchTypesPage />} />
        </Routes>
      </main>
    </div>
  );
}
