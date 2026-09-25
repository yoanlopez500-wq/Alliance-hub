import { Link } from 'react-router-dom';
import { colors } from '../../theme';

/** NotFoundPage — 404 catch-all del v2. */
export default function NotFoundPage() {
  return (
    <div style={{ maxWidth: 520, margin: '100px auto', textAlign: 'center', padding: 16 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🗺️</div>
      <h1 style={{ color: colors.text, margin: '0 0 8px' }}>404 — Pagina no encontrada</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>La ruta que buscas no existe o fue movida.</p>
      <Link to="/" style={{ color: colors.accent, fontWeight: 700 }}>Volver al inicio</Link>
    </div>
  );
}
