import AdminGate from '../../components/AdminGate';
import { colors } from '../../theme';

/** AdminLeaguesPage — puerto de admin/leagues.html (DEV: sistema de ligas en desarrollo). */
function Leagues() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 24px' }}>
        🏆 Ligas{' '}
        <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, fontWeight: 700, background: colors.accent, color: '#fff', verticalAlign: 'middle' }}>DEV</span>
      </h1>
      <div style={{ background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: colors.muted }}>
        <p style={{ margin: 0 }}>Sistema de ligas en desarrollo.</p>
        <p style={{ fontSize: 13, margin: '8px 0 0' }}>Pronto podrás crear temporadas, divisiones y sistemas de ascenso/descenso.</p>
      </div>
    </div>
  );
}

export default function AdminLeaguesPage() {
  return (
    <AdminGate staffOnly>
      <Leagues />
    </AdminGate>
  );
}
