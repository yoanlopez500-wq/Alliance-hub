import { colors, styles } from '../theme';

type Variant = 'primary' | 'ghost' | 'danger';

const variantStyle: Record<Variant, React.CSSProperties> = {
  primary: styles.btnPrimary,
  ghost: styles.btnGhost,
  danger: { ...styles.btnGhost, color: colors.danger },
};

/** Boton unificado del v2. Adios a los gradientes inline copiados por pagina. */
export default function Button({
  children, variant = 'primary', disabled, onClick, type = 'button', style,
}: {
  children: React.ReactNode;
  variant?: Variant;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...variantStyle[variant],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
