import { colors } from '../theme';

/** Seccion con titulo uppercase — antes duplicada en ExpedienteModal y AlianzaPage. */
export default function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h2>
      {children}
    </div>
  );
}
