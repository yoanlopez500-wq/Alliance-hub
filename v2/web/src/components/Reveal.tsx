import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Reveal — aparicion animada al entrar en el viewport (fade-up).
 * Equivalente al ScrollSection del proyecto del inge Alejandro pero
 * con IntersectionObserver en vez de GSAP: cero dependencias.
 * `delay` en ms permite escalonar hijos (efecto stagger).
 */
export default function Reveal({
  children, delay = 0, className = '',
}: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      // threshold 0: basta con que 1px del elemento entre en el viewport.
      // Con 0.1 una pagina mas alta que el viewport (p. ej. /novedades,
      // ~11.000px) nunca llega al 10% visible y queda en opacity: 0
      // para siempre. La animacion (CSS .ah-reveal) no cambia.
      { threshold: 0, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`ah-reveal ${visible ? 'ah-reveal-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
