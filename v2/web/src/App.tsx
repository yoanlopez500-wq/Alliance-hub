import { Routes, Route, Link } from 'react-router-dom';

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui', background: '#0a0e27', color: '#e8eaf6', minHeight: '100vh', padding: 24 }}>
      <nav style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <Link to="/">AllianceHub 2.0</Link>
        <Link to="/jugadores">Jugadores</Link>
        <Link to="/alianzas">Alianzas</Link>
      </nav>
      <Routes>
        <Route path="/" element={<h1>Big Update — scaffold inicial</h1>} />
        <Route path="/jugadores" element={<h1>Mercado de transferencias (pronto)</h1>} />
        <Route path="/alianzas" element={<h1>Alianzas (pronto)</h1>} />
      </Routes>
    </div>
  );
}
