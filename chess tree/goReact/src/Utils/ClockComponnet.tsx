import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock } from "lucide-react";

interface ClockComponentProps {
  running?: boolean;
  resetToken?: number | string;
  onElapsedChange?: (elapsedMs: number) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

const ClockComponent = ({ running, resetToken, onElapsedChange }: ClockComponentProps) => {
  const isControlled = typeof running === "boolean";
  const [display, setDisplay] = useState({ mm: "00", ss: "00", ms: "0" });
  const [internalRunning, setInternalRunning] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const effectiveRunning = isControlled ? Boolean(running) : internalRunning;

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const render = useCallback((elapsed: number) => {
    elapsedRef.current = elapsed;
    const totalSec = Math.floor(elapsed / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    const ms = Math.floor((elapsed % 1000) / 100);
    setDisplay({ mm: pad(mm), ss: pad(ss), ms: String(ms) });
    onElapsedChange?.(elapsed);
  }, [onElapsedChange]);

  const tick = useCallback(() => {
    if (startTimeRef.current === null) return;
    const elapsed = Date.now() - startTimeRef.current;
    render(elapsed);
    rafRef.current = requestAnimationFrame(tick);
  }, [render]);

  useEffect(() => {
    stopAnimation();
    startTimeRef.current = null;
    elapsedRef.current = 0;
    setDisplay({ mm: "00", ss: "00", ms: "0" });
    onElapsedChange?.(0);
    if (!isControlled) {
      setInternalRunning(false);
    }
  }, [resetToken, stopAnimation, onElapsedChange, isControlled]);

  useEffect(() => {
    if (effectiveRunning) {
      startTimeRef.current = Date.now() - elapsedRef.current;
      stopAnimation();
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (startTimeRef.current !== null) {
      render(Date.now() - startTimeRef.current);
    }
    startTimeRef.current = null;
    stopAnimation();
  }, [effectiveRunning, tick, render, stopAnimation]);

  useEffect(() => {
    return () => stopAnimation();
  }, [stopAnimation]);

  const play = () => {
    if (isControlled) return;
    setInternalRunning(true);
  };

  const pause = () => {
    if (isControlled) return;
    setInternalRunning(false);
  };

  const reset = () => {
    if (isControlled) return;
    stopAnimation();
    startTimeRef.current = null;
    elapsedRef.current = 0;
    setInternalRunning(false);
    setDisplay({ mm: "00", ss: "00", ms: "0" });
    onElapsedChange?.(0);
  };

  const controlsDisabled = isControlled;

  return (
    <div className="flex flex-col items-center gap-6 p-10">
      <div className="flex items-center gap-2">
        <AlarmClock color="red" size={28} />
        <span className="text-sm text-gray-500">
          {effectiveRunning ? "Running" : "Stopped"}
        </span>
      </div>

      <div className="font-mono text-6xl font-medium tracking-widest">
        {display.mm}
        <span className="opacity-40">:</span>
        {display.ss}
        <span className="text-3xl text-gray-400">.{display.ms}</span>
      </div>

      <div className="flex gap-3">
        <button
          onClick={play}
          disabled={controlsDisabled || effectiveRunning}
          className="px-6 py-2 rounded border border-green-400 text-green-600 disabled:opacity-30"
        >
          Play
        </button>
        <button
          onClick={pause}
          disabled={controlsDisabled || !effectiveRunning}
          className="px-6 py-2 rounded border border-yellow-400 text-yellow-600 disabled:opacity-30"
        >
          Pause
        </button>
        <button
          onClick={reset}
          disabled={controlsDisabled}
          className="px-6 py-2 rounded border border-red-400 text-red-500 disabled:opacity-30"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default ClockComponent;
