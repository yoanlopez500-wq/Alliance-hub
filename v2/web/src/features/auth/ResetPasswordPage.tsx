import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import { Input } from '../../components/Field';
import Section from '../../components/Section';
import Reveal from '../../components/Reveal';

/** ResetPasswordPage — puerto de reset-password.js (flujo Supabase por hash de correo). */
export default function ResetPasswordPage() {
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await publicDb.auth.getSession();
        if (!data.session) {
          const hash = window.location.hash;
          if (!hash || !hash.includes('access_token')) setInvalid(true);
        }
      } catch (e) { console.error('[ResetPassword]', e); }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    const newPass = String(fd.get('new_password'));
    const confirmPass = String(fd.get('confirm_password'));
    if (newPass !== confirmPass) { setError('Las contrasenas no coinciden'); return; }
    setSaving(true);
    try {
      const { error: upErr } = await publicDb.auth.updateUser({ password: newPass });
      if (upErr) throw upErr;
      setSuccess('Contrasena actualizada. Redirigiendo...');
      setTimeout(() => { window.location.href = '/admin'; }, 2000);
    } catch (err: any) {
      setError('Error: ' + (err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: '60px auto', padding: 16 }}>
      <Reveal>
        <Section title="🔑 Restablecer contrasena">
          {invalid ? (
            <p style={{ color: colors.danger, fontSize: 14 }}>
              Enlace invalido o expirado. Solicita uno nuevo desde el panel de admin.
            </p>
          ) : (
            <form onSubmit={onSubmit}>
              <label style={{ fontSize: 12, color: colors.muted }}>Nueva contrasena</label>
              <Input name="new_password" type="password" required minLength={6} style={styles.input} />
              <label style={{ fontSize: 12, color: colors.muted }}>Confirmar contrasena</label>
              <Input name="confirm_password" type="password" required minLength={6} style={styles.input} />
              {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
              {success && <p style={{ color: colors.success, fontSize: 13 }}>{success}</p>}
              <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar contrasena'}</Button>
            </form>
          )}
          <p style={{ marginTop: 16, fontSize: 13 }}>
            <Link to="/" style={{ color: colors.accent }}>Volver al inicio</Link>
          </p>
        </Section>
      </Reveal>
    </div>
  );
}
