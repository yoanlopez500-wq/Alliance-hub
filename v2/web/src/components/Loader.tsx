export default function Loader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: '#9fa8da', fontSize: 14 }}>
      <div style={{
        width: 28, height: 28, margin: '0 auto 10px', borderRadius: '50%',
        border: '3px solid #1a237e', borderTopColor: '#ff8f00',
        animation: 'ah2-spin 0.8s linear infinite',
      }} />
      <style>{'@keyframes ah2-spin { to { transform: rotate(360deg); } }'}</style>
      {label}
    </div>
  );
}
