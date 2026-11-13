import { useEffect, useRef } from 'react';
import { Sparkles, CheckCircle2 } from 'lucide-react';

interface CelebrationBurstProps {
  active: boolean;
  onComplete?: () => void;
  durationMs?: number; // strictly 3000ms maximum
  message?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRotation: number;
  shape: 'circle' | 'rect' | 'star';
  wobble: number;
  wobbleSpeed: number;
}

const PALETTE = [
  '#6657E8', // OmBhi Purple
  '#8B7CF8', // Soft Violet
  '#10B981', // Emerald Success
  '#3B82F6', // Vibrant Blue
  '#F59E0B', // Warm Amber
  '#EC4899', // Pink Accent
  '#A855F7', // Deep Lilac
];

export function CelebrationBurst({
  active,
  onComplete,
  durationMs = 3000,
  message = 'Milestone reached! Completed.',
}: CelebrationBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;

    let isFinished = false;
    let animationFrameId: number;

    // Respect user's accessibility preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const quickTimer = setTimeout(() => {
        onCompleteRef.current?.();
      }, 500);
      return () => clearTimeout(quickTimer);
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      onCompleteRef.current?.();
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onCompleteRef.current?.();
      return;
    }

    // Set canvas resolution
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Origin: center-top area where celebration radiates naturally
    const originX = width / 2;
    const originY = Math.min(height * 0.28, 220);

    // Generate ~48 subtle, lightweight particles
    const particleCount = 48;
    const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.9);
      const speed = 4 + Math.random() * 7;
      const shapes: Particle['shape'][] = ['circle', 'rect', 'star'];
      return {
        x: originX + (Math.random() - 0.5) * 80,
        y: originY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 5,
        color: PALETTE[i % PALETTE.length],
        rotation: Math.random() * Math.PI * 2,
        vRotation: (Math.random() - 0.5) * 0.2,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.08,
      };
    });

    const startTime = performance.now();

    const finishAndCleanup = () => {
      if (isFinished) return;
      isFinished = true;
      cancelAnimationFrame(animationFrameId);
      clearTimeout(stopTimer);

      if (canvasRef.current) {
        const c = canvasRef.current;
        const cCtx = c.getContext('2d');
        if (cCtx) cCtx.clearRect(0, 0, c.width, c.height);
      }

      onCompleteRef.current?.();
    };

    const render = (now: number) => {
      if (isFinished) return;

      const elapsed = now - startTime;

      // Stop all confetti, particles, and animations completely within 3 seconds maximum
      if (elapsed >= durationMs) {
        finishAndCleanup();
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Smooth fade-out in the final 800ms of the 3 seconds
      let globalAlpha = 1;
      if (elapsed > durationMs - 800) {
        globalAlpha = Math.max(0, (durationMs - elapsed) / 800);
      }

      particles.forEach((p) => {
        // Physics update: gentle gravity and friction
        p.vy += 0.18;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx + Math.sin(p.wobble) * 0.8;
        p.y += p.vy;
        p.rotation += p.vRotation;
        p.wobble += p.wobbleSpeed;

        ctx.save();
        ctx.globalAlpha = globalAlpha * 0.9;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size * 0.6);
        } else {
          // Subtle four-point sparkle
          const r = p.size;
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.quadraticCurveTo(0, 0, r, 0);
          ctx.quadraticCurveTo(0, 0, 0, r);
          ctx.quadraticCurveTo(0, 0, -r, 0);
          ctx.quadraticCurveTo(0, 0, 0, -r);
          ctx.fill();
        }

        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    // Hard fallback timer strictly guaranteeing complete shutdown at exactly 3 seconds maximum
    const stopTimer = setTimeout(finishAndCleanup, durationMs);

    return () => {
      isFinished = true;
      cancelAnimationFrame(animationFrameId);
      clearTimeout(stopTimer);
      if (canvasRef.current) {
        const c = canvasRef.current;
        const cCtx = c.getContext('2d');
        if (cCtx) cCtx.clearRect(0, 0, c.width, c.height);
      }
    };
  }, [active, durationMs]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-start pt-16 overflow-hidden select-none"
    >
      {/* High-performance canvas for 3-second celebratory micro-animation particles */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Milestone Banner — stops completely within 3 seconds with particles */}
      <div className="relative z-10 flex items-center gap-2 rounded-full border border-[#6657E8]/25 bg-white/90 px-4 py-2 shadow-[0_8px_30px_rgba(102,87,232,0.18)] backdrop-blur-md transition-all duration-300 animate-in fade-in zoom-in-95 dark:border-slate-700 dark:bg-slate-900/90">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-900 dark:text-white">
          {message}
        </span>
        <Sparkles className="h-3.5 w-3.5 text-[#6657E8] dark:text-[#A59DF7] shrink-0 animate-pulse" />
      </div>
    </div>
  );
}
