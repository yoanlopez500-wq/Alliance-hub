import { useState } from 'react';
import { serverApi, publicDb, setSessionToken } from '../../lib/api';
import Button from '../../components/Button';
import { Input } from '../../components/Field';
import { styles, colors } from '../../theme';

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
      try { localStorage.setItem('ah2_player_name', displayName.trim()); } catch { /* noop */ }
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

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ ...styles.card, maxWidth: 380, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['player', 'admin'] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(null); }} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700,
              background: mode === m ? colors.accentGradient : colors.border,
              color: mode === m ? '#fff' : colors.muted,
            }}>{m === 'player' ? 'Jugador' : 'Admin'}</button>
          ))}
        </div>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {mode === 'player' ? (
          <form onSubmit={loginPlayer}>
            <Input placeholder="Tu ID de jugador" value={playerId} onChange={(e) => setPlayerId(e.target.value)} required />
            <Input placeholder="Nombre visible" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <Button type="submit" disabled={busy} style={{ width: '100%' }}>Entrar como jugador</Button>
          </form>
        ) : (
          <form onSubmit={loginAdmin}>
            <Input type="email" placeholder="Email admin" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" disabled={busy} style={{ width: '100%' }}>Entrar como admin</Button>
          </form>
        )}
      </div>
    </div>
  );
}
