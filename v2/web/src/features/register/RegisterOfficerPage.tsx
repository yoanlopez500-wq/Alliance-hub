import { useState } from 'react';
import { useSearchParams, Link, Navigate } from 'react-router-dom';
import { styles, colors } from '../../theme';
import { Input } from '../../components/Field';
import Button from '../../components/Button';

/**
 * Registro de OFICIAL por invitacion de su lider (decision del usuario):
 * los oficiales son usuarios Auth (no cuentas de jugador), creados con un
 * codigo de invitacion generado en el panel de lider. La edge function
 * officer-signup crea la cuenta auth + la fila en alliance_officers.
 */
export default function RegisterOfficerPage() {
  const [params] = useSearchParams();
  const preCode = params.get('code') ?? '';
  const [code, setCode] = useState(preCode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return <Navigate to="/login" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/officer-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
        body: JSON.stringify({ email, password, inviteCode: code, displayName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setDone(true);
    } catch (e2: any) {
      setError(e2.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ ...styles.card, maxWidth: 420, width: '100%' }}>
        <h2 style={{ color: colors.text, marginTop: 0 }}>⛨ Cuenta de oficial</h2>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Tu líder te ha invitado como oficial de la alianza. Crea tu cuenta con el código
          que te compartió. Con ella podrás gestionar sanciones, Mi Espacio y más.
        </p>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        <form onSubmit={submit}>
          <Input placeholder="Código de invitación (AH...)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
          <Input placeholder="Tu nombre visible" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Contraseña (mín. 6)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" disabled={busy} style={{ width: '100%' }}>Crear mi cuenta de oficial</Button>
        </form>
        <p style={{ color: colors.muted, fontSize: 13, marginBottom: 0 }}>
          ¿No tienes código? Pídeselo a tu líder en el panel de oficiales.{' '}
          <Link to="/login" style={{ color: colors.accent }}>Volver a entrar</Link>
        </p>
      </div>
    </div>
  );
}
