import { Link } from 'react-router-dom';
import { useAdmin } from '../lib/admin';
import { colors } from '../theme';
import Loader from './Loader';

/** AdminGate — guard del panel admin: exige sesion admin activa. */
export default function AdminGate({ children, staffOnly }: { children: React.ReactNode; staffOnly?: boolean }) {
  const { admin, loading } = useAdmin();
  if (loading) return <Loader label="Verificando acceso..." />;
  if (!admin) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: colors.text }}>Acceso restringido</h2>
        <p style={{ color: colors.muted }}>Inicia sesion con una cuenta administrativa para continuar.</p>
        <Link to="/login" style={{ color: colors.accent, fontWeight: 700 }}>Ir al login</Link>
      </div>
    );
  }
  if (staffOnly && !(admin.role === 'superadmin' || admin.role === 'event_admin' || admin.role === 'moderator')) {
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
