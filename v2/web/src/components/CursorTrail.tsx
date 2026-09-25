import { useEffect, useRef } from 'react';

/**
 * CursorTrail — estela de particulas doradas tras el cursor (canvas).
 * Inspirado en el CursorTrail de batallonsupremacy.web.app, recoloreado
 * al acento AllianceHub (#ff8f00). Solo desktop: en touch no hay mousemove.
 */
export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const particles: { x: number; y: number; a: number }[] = [];
    let raf = 0;

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    const onMove = (e: MouseEvent) => {
      particles.push({ x: e.clientX, y: e.clientY, a: 1 });
      if (particles.length > 120) particles.shift();
    };
    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.a -= 0.02;
        ctx.globalAlpha = Math.max(p.a, 0) * 0.12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * (p.a + 0.2), 0, Math.PI * 2);
        ctx.fillStyle = '#ff8f00';
        ctx.fill();
        if (p.a <= 0) particles.splice(i, 1);
      }
      raf = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}
    />
  );
}
