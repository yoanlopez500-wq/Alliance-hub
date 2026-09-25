import { colors } from '../theme';

export default function EmptyState({ message = 'Nada por aquí todavía' }: { message?: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '32px 16px', color: colors.muted, fontSize: 14,
      border: `1px dashed ${colors.border}`, borderRadius: 12,
    }}>
      {message}
    </div>
  );
}
