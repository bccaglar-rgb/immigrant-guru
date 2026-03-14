import { useEffect, useMemo, useRef, useState } from "react";

type RaceState = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  lap: number;
  passedCheckpoint: boolean;
};

const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 420;
const OUTER_TRACK = { x: 28, y: 28, w: 644, h: 364 };
const INNER_TRACK = { x: 200, y: 130, w: 300, h: 160 };
const START_LINE_X1 = 318;
const START_LINE_X2 = 382;
const START_LINE_Y = 70;
const CHECKPOINT_Y = 332;

const createInitialRaceState = (): RaceState => ({
  x: 350,
  y: 84,
  angle: Math.PI / 2,
  speed: 0,
  lap: 0,
  passedCheckpoint: false,
});

export default function GamesPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const keysRef = useRef({ up: false, left: false, right: false, down: false });
  const stateRef = useRef<RaceState>(createInitialRaceState());
  const [lap, setLap] = useState(0);
  const [bestLapSec, setBestLapSec] = useState<number | null>(null);
  const [currentLapSec, setCurrentLapSec] = useState(0);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const lapStartRef = useRef<number | null>(null);

  const controlsHint = useMemo(() => "Arrow keys: accelerate, steer, brake", []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") keysRef.current.up = true;
      if (event.key === "ArrowLeft") keysRef.current.left = true;
      if (event.key === "ArrowRight") keysRef.current.right = true;
      if (event.key === "ArrowDown") keysRef.current.down = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") keysRef.current.up = false;
      if (event.key === "ArrowLeft") keysRef.current.left = false;
      if (event.key === "ArrowRight") keysRef.current.right = false;
      if (event.key === "ArrowDown") keysRef.current.down = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTs = performance.now();

    const drawTrack = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = "#2f343d";
      ctx.fillRect(OUTER_TRACK.x, OUTER_TRACK.y, OUTER_TRACK.w, OUTER_TRACK.h);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(INNER_TRACK.x, INNER_TRACK.y, INNER_TRACK.w, INNER_TRACK.h);

      ctx.strokeStyle = "#8b95a7";
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.strokeRect(OUTER_TRACK.x + 10, OUTER_TRACK.y + 10, OUTER_TRACK.w - 20, OUTER_TRACK.h - 20);
      ctx.strokeRect(INNER_TRACK.x - 10, INNER_TRACK.y - 10, INNER_TRACK.w + 20, INNER_TRACK.h + 20);
      ctx.setLineDash([]);

      ctx.strokeStyle = "#f5c542";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(START_LINE_X1, START_LINE_Y);
      ctx.lineTo(START_LINE_X2, START_LINE_Y);
      ctx.stroke();
    };

    const drawCar = (car: RaceState) => {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = "#46a7ff";
      ctx.strokeStyle = "#e5f4ff";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-12, -20, 24, 40, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f5c542";
      ctx.fillRect(-3, -18, 6, 8);
      ctx.restore();
    };

    const inOuter = (x: number, y: number) =>
      x > OUTER_TRACK.x && x < OUTER_TRACK.x + OUTER_TRACK.w && y > OUTER_TRACK.y && y < OUTER_TRACK.y + OUTER_TRACK.h;
    const inInner = (x: number, y: number) =>
      x > INNER_TRACK.x && x < INNER_TRACK.x + INNER_TRACK.w && y > INNER_TRACK.y && y < INNER_TRACK.y + INNER_TRACK.h;

    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;

      const car = stateRef.current;
      const keys = keysRef.current;
      const accel = keys.up ? 420 : 0;
      const brake = keys.down ? 520 : 0;
      const turn = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);

      car.angle += turn * (1.9 + Math.abs(car.speed) * 0.002) * dt;
      car.speed += accel * dt;
      car.speed -= brake * dt;
      car.speed *= 0.985;
      car.speed = Math.max(-120, Math.min(340, car.speed));

      const prevY = car.y;
      car.x += Math.cos(car.angle - Math.PI / 2) * car.speed * dt;
      car.y += Math.sin(car.angle - Math.PI / 2) * car.speed * dt;

      const invalid = !inOuter(car.x, car.y) || inInner(car.x, car.y);
      if (invalid) {
        car.speed *= -0.28;
        car.x += Math.cos(car.angle - Math.PI / 2) * car.speed * dt * 4;
        car.y += Math.sin(car.angle - Math.PI / 2) * car.speed * dt * 4;
      }

      if (car.y > CHECKPOINT_Y && car.x > START_LINE_X1 - 40 && car.x < START_LINE_X2 + 40) {
        car.passedCheckpoint = true;
      }

      const crossedStart = prevY > START_LINE_Y && car.y <= START_LINE_Y && car.x >= START_LINE_X1 && car.x <= START_LINE_X2;
      if (crossedStart && car.passedCheckpoint) {
        car.passedCheckpoint = false;
        car.lap += 1;
        setLap(car.lap);
        const now = performance.now();
        if (lapStartRef.current !== null) {
          const lapSec = (now - lapStartRef.current) / 1000;
          setBestLapSec((prev) => (prev === null ? lapSec : Math.min(prev, lapSec)));
        }
        lapStartRef.current = now;
        if (raceStartedAt === null) setRaceStartedAt(now);
      }

      const now = performance.now();
      if (lapStartRef.current !== null) {
        setCurrentLapSec((now - lapStartRef.current) / 1000);
      }

      drawTrack();
      drawCar(car);
      animationRef.current = requestAnimationFrame(loop);
    };

    drawTrack();
    drawCar(stateRef.current);
    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [raceStartedAt]);

  const resetRace = () => {
    stateRef.current = createInitialRaceState();
    setLap(0);
    setCurrentLapSec(0);
    setRaceStartedAt(performance.now());
    lapStartRef.current = performance.now();
  };

  const fmtSec = (value: number | null) => (value === null ? "-" : `${value.toFixed(2)}s`);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className="rounded-2xl border border-white/10 bg-[var(--panel)] p-4">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Games</h1>
          <p className="mt-1 text-sm text-[var(--textSubtle)]">Play mini games directly in Bitrium. New titles will be added over time.</p>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="xl:col-span-2 rounded-2xl border border-white/10 bg-[var(--panel)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Neon Circuit Race</h2>
                <p className="text-xs text-[var(--textSubtle)]">{controlsHint}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full border border-[#4f6f58] bg-[#1c2620] px-2 py-1 text-[#b8d8c4]">Lap {lap}</span>
                <span className="rounded-full border border-[#4f6f58] bg-[#1c2620] px-2 py-1 text-[#b8d8c4]">Current {fmtSec(currentLapSec)}</span>
                <span className="rounded-full border border-[#8e7339] bg-[#2a2415] px-2 py-1 text-[#f1d089]">Best {fmtSec(bestLapSec)}</span>
                <button
                  type="button"
                  onClick={resetRace}
                  className="rounded-full border border-white/15 bg-[#10131a] px-3 py-1 text-[var(--text)] hover:border-[#F5C542]/60"
                >
                  Restart
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0b1020]">
              <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="h-auto w-full" />
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[var(--panel)] p-4">
            <div className="rounded-xl border border-dashed border-white/15 bg-[#0f1118] p-6 text-center">
              <p className="text-lg font-semibold text-[var(--text)]">New games coming soon</p>
              <p className="mt-2 text-xs text-[var(--textSubtle)]">Multiplayer and strategy titles are in development.</p>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[var(--panel)] p-4">
            <div className="rounded-xl border border-dashed border-white/15 bg-[#0f1118] p-6 text-center">
              <p className="text-lg font-semibold text-[var(--text)]">New games coming soon</p>
              <p className="mt-2 text-xs text-[var(--textSubtle)]">Arcade updates will appear here after release.</p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
