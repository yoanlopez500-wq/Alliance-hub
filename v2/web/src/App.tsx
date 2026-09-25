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
  const location = useLocation();
  const myAllianceId = me?.managedAllianceId ?? null;
  const loggedIn = !!getSessionToken();

  return (
    <div style={{ fontFamily: 'system-ui', background: colors.bg, color: colors.text, minHeight: '100vh' }}>
      <nav style={{
        display: 'flex', gap: 20, alignItems: 'center', padding: '14px 24px',
        borderBottom: `1px solid ${colors.border}`, position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(13,19,48,0.75)',
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
        <Reveal key={location.pathname}>
        <Routes>
          <Route path="/" element={
            <div>
              {/* Hero cinematografico: glow radial con slow-zoom (tecnica del fork del inge Alejandro) */}
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 32 }}>
                <div className="ah-anim-slow-zoom" style={{
                  position: 'absolute', inset: -40,
                  background: `radial-gradient(ellipse at 30% 20%, rgba(255,143,0,0.22), transparent 55%),
                               radial-gradient(ellipse at 75% 80%, rgba(79,195,247,0.12), transparent 50%),
                               ${colors.card}`,
                }} />
                <div style={{ position: 'relative', padding: '72px 32px', textAlign: 'center' }}>
                  <Reveal>
                    <div className="ah-glass ah-anim-pulse-glow" style={{
                      display: 'inline-block', padding: '6px 16px', borderRadius: 999,
                      color: colors.accent, fontSize: 12, fontWeight: 800,
                      letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 20,
                    }}>
                      ⛨ Big Update
                    </div>
                    <h1 style={{ color: colors.text, fontSize: 'clamp(32px, 6vw, 56px)', margin: '0 0 16px', letterSpacing: -1 }}>
                      AllianceHub{' '}
                      <span className="ah-anim-gradient-pan" style={{
                        background: colors.accentGradient, WebkitBackgroundClip: 'text',
                        backgroundClip: 'text', color: 'transparent', fontWeight: 900,
                      }}>2.0</span>
                    </h1>
                    <p style={{ color: colors.muted, maxWidth: 560, margin: '0 auto', fontSize: 17, lineHeight: 1.6 }}>
                      Server Fastify modular, componentes React reutilizables, sanciones aisladas
                      por alianza, mercado de transferencias y tipos de partida administrables.
                    </p>
                  </Reveal>
                </div>
              </div>
              <Reveal delay={120}>
                <div className="ah-glass ah-glow-hover" style={{ borderRadius: 16, padding: 20 }}>
                  <p style={{ color: colors.muted, margin: 0 }}>
                    Explora <NavLink to="/jugadores" style={{ color: colors.accent }}>Jugadores</NavLink> para ver
                    el mercado de transferencias, o entra como líder para gestionar tu espacio y sanciones.
                  </p>
                </div>
              </Reveal>
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
        </Reveal>
      </main>
    </div>
  );
}
