import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../lib/api';
import { useAdmin } from '../lib/admin';
import { colors } from '../theme';
import Loader from './Loader';

/**
 * AdminGate — guard del panel admin.
 * - Por defecto: exige fila admin_users activa (lideres incluidos).
 * - staffOnly: solo superadmin/event_admin/moderator.
 * - allowManagers: ademas deja pasar a oficiales activos de alianza
 *   (para herramientas de gestion de partidas internas, donde el RLS
 *   hace la restriccion fina por alianza y por tipo de partida).
 */
export default function AdminGate({ children, staffOnly, allowManagers }: { children: React.ReactNode; staffOnly?: boolean; allowManagers?: boolean }) {
  const { admin, loading } = useAdmin();
  const [officerAllianceId, setOfficerAllianceId] = useState<string | null>(null);
  const [officerChecked, setOfficerChecked] = useState(false);

  useEffect(() => {
    if (!allowManagers || admin) { setOfficerChecked(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await publicDb.auth.getSession();
        const uid = data.session?.user.id;
        if (uid) {
          const { data: off } = await publicDb.from('alliance_officers')
            .select('alliance_id').eq('auth_user_id', uid).eq('is_active', true).limit(1).maybeSingle();
          if (!cancelled) setOfficerAllianceId((off as { alliance_id: string } | null)?.alliance_id ?? null);
        }
      } catch { /* noop */ }
      finally { if (!cancelled) setOfficerChecked(true); }
    })();
    return () => { cancelled = true; };
  }, [allowManagers, admin]);

  if (loading || (allowManagers && !officerChecked)) return <Loader label="Verificando acceso..." />;
  const isOfficer = !!officerAllianceId;
  if (!admin && !(allowManagers && isOfficer)) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: colors.text }}>Acceso restringido</h2>
        <p style={{ color: colors.muted }}>Inicia sesion con una cuenta administrativa para continuar.</p>
        <Link to="/login" style={{ color: colors.accent, fontWeight: 700 }}>Ir al login</Link>
      </div>
    );
  }
  if (staffOnly && !(admin && (admin.role === 'superadmin' || admin.role === 'event_admin' || admin.role === 'moderator'))) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚫</div>
        <h2 style={{ color: colors.text }}>Permisos insuficientes</h2>
        <p style={{ color: colors.muted }}>Esta seccion requiere rol de staff (superadmin, event_admin o moderator).</p>
      </div>
    );
  }
  return <>{children}</>;
}
