import { useState } from 'react';
import { serverApi, publicDb, setSessionToken } from '../../lib/api';

/**
 * Login dual: jugador (id + nombre, RPC sellada del v1) o
 * admin (email + password, Supabase Auth). Un solo token en localStorage.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<'player' | 'admin'>('player');
  const [playerId, setPlayerId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loginPlayer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await serverApi.post('/auth/player', { playerId: Number(playerId), displayName });
      setSessionToken(r.token, r.playerId);
      window.location.href = '/';
    } catch (e2: any) {
      setError(e2.message);
    } finally { setBusy(false); }
  }

  async function loginAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { data, error: authErr } = await publicDb.auth.signInWithPassword({ email, password });
      if (authErr || !data.session) throw new Error(authErr?.message ?? 'login rechazado');
      setSessionToken(data.session.access_token);
      window.location.href = '/';
    } catch (e2: any) {
      setError(e2.message);
    } finally { setBusy(false); }
  }

  const card: React.CSSProperties = {
    background: '#11183a', border: '1px solid #1a237e', borderRadius: 16, padding: 24, maxWidth: 380, width: '100%',
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e',
    background: '#0d1330', color: '#e8eaf6', marginBottom: 10, boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['player', 'admin'] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(null); }} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700,
              background: mode === m ? 'linear-gradient(90deg,#ff6f00,#ff8f00)' : '#1a237e',
              color: mode === m ? '#fff' : '#9fa8da',
            }}>{m === 'player' ? 'Jugador' : 'Admin'}</button>
          ))}
        </div>
        {error && <p style={{ color: '#ef5350', fontSize: 13 }}>{error}</p>}
        {mode === 'player' ? (
          <form onSubmit={loginPlayer}>
            <input placeholder="Tu ID de jugador" value={playerId} onChange={(e) => setPlayerId(e.target.value)} style={input} required />
            <input placeholder="Nombre visible" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={input} required />
            <button disabled={busy} style={{ ...input, background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Entrar como jugador
            </button>
          </form>
        ) : (
          <form onSubmit={loginAdmin}>
            <input type="email" placeholder="Email admin" value={email} onChange={(e) => setEmail(e.target.value)} style={input} required />
            <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} style={input} required />
            <button disabled={busy} style={{ ...input, background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Entrar como admin
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
