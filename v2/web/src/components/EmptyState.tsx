export default function EmptyState({ message = 'Nada por aquí todavía' }: { message?: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '32px 16px', color: '#9fa8da', fontSize: 14,
      border: '1px dashed #1a237e', borderRadius: 12,
    }}>
      {message}
    </div>
  );
}
