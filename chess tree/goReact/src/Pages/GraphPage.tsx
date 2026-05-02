import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, Clock, Zap, Target, ZoomIn, ZoomOut } from "lucide-react";
import React from "react";
import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";


interface PuzzleDataPoint {
  puzzle: number;
  time: number;
  cumulative: number;
}

interface BrushState {
  start: number;
  end: number;
}

interface AttemptSummary {
  _id: string;
  attemptnumber: number;
}

interface ReportRecord {
  _id: string;
  user_id?: number;
  set_id?: string;
  attemptnumber: number;
  totaltimems: number;
  solvedclean: number;
  failed: number;
  timebucket?: string | null;
  createdat?: string;
}

interface SessionReportsResponse {
  bucket?: unknown;
  data?: string;
  list?: unknown;
  report?: unknown;
}

interface ResultReportResponse {
  bucket?: unknown;
  data?: unknown;
  message?: string;
}

interface ReportPayload {
  report: ReportRecord;
  bucket: number[];
}

interface SessionReportsData {
  attempts: AttemptSummary[];
  latestReport: ReportPayload | null;
}


const OVERVIEW_PAD = { l: 4, r: 4, t: 6, b: 20 };
const DETAIL_PAD = { l: 48, r: 12, t: 16, b: 28 };
const MIN_SPAN = 5;
const HANDLE_HIT_MOUSE = 12;
const HANDLE_HIT_TOUCH = 28;


function fmtS(ms: number): string {
  return (ms / 1000).toFixed(2) + "s";
}

function getBarColor(time: number, fastest: number, slowest: number): string {
  if (time === fastest) return "#4ade80";
  if (time === slowest) return "#facc15";
  return "#22c55e";
}

function clampBrush(b: BrushState, total: number): BrushState {
  let { start, end } = b;
  if (end - start < MIN_SPAN) end = start + MIN_SPAN;
  start = Math.max(0, start);
  end = Math.min(total, end);
  if (end - start < MIN_SPAN) start = end - MIN_SPAN;
  start = Math.max(0, start);
  return { start, end };
}


function useBrush(total: number, initialSpan = 50) {
  const [brush, setBrushRaw] = useState<BrushState>({
    start: 0,
    end: Math.min(initialSpan, total),
  });

  const setBrush = useCallback(
    (b: BrushState) => setBrushRaw(clampBrush(b, total)),
    [total]
  );

  const zoom = useCallback(
    (centerIdx: number, factor: number) => {
      setBrushRaw((prev) => {
        const span = prev.end - prev.start;
        const newSpan = Math.max(MIN_SPAN, Math.min(total, span * factor));
        const safeCenter = Math.max(newSpan / 2, Math.min(total - newSpan / 2, centerIdx));
        return clampBrush(
          { start: safeCenter - newSpan / 2, end: safeCenter + newSpan / 2 },
          total
        );
      });
    },
    [total]
  );

  const pan = useCallback(
    (delta: number) => {
      setBrushRaw((prev) => {
        const span = prev.end - prev.start;
        let start = prev.start + delta;
        let end = prev.end + delta;
        if (start < 0) { start = 0; end = span; }
        if (end > total) { end = total; start = total - span; }
        return { start, end };
      });
    },
    [total]
  );

  return { brush, setBrush, zoom, pan };
}


function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}


interface OverviewCanvasProps {
  data: PuzzleDataPoint[];
  brush: BrushState;
  fastest: number;
  slowest: number;
  onBrushChange: (b: BrushState) => void;
  onZoom: (centerIdx: number, factor: number) => void;
}

function OverviewCanvas({ data, brush, fastest, slowest, onBrushChange, onZoom }: OverviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const N = data.length;

  const mouseDragRef = useRef<{
    type: "left" | "right" | "pan";
    anchorX: number;
    anchorBrush: BrushState;
  } | null>(null);

  const touchRef = useRef<{
    mode: "single" | "pinch" | null;
    lastX: number;
    lastSpan: number;
    anchorBrush: BrushState;
    hitType: "left" | "right" | "pan" | "jump" | null;
  }>({ mode: null, lastX: 0, lastSpan: 0, anchorBrush: brush, hitType: null });

  const idxToX = useCallback(
    (idx: number, w: number) => OVERVIEW_PAD.l + (idx / N) * (w - OVERVIEW_PAD.l - OVERVIEW_PAD.r),
    [N]
  );

  const xToIdx = useCallback(
    (x: number, w: number) => {
      const ratio = (x - OVERVIEW_PAD.l) / (w - OVERVIEW_PAD.l - OVERVIEW_PAD.r);
      return Math.max(0, Math.min(N, ratio * N));
    },
    [N]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const chartH = h - OVERVIEW_PAD.t - OVERVIEW_PAD.b;
    const barW = (w - OVERVIEW_PAD.l - OVERVIEW_PAD.r) / N;

    ctx.clearRect(0, 0, w, h);

    data.forEach((d, i) => {
      const bh = Math.max(1, (d.time / slowest) * chartH);
      const x = OVERVIEW_PAD.l + i * barW;
      const y = OVERVIEW_PAD.t + (chartH - bh);
      ctx.fillStyle = getBarColor(d.time, fastest, slowest);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y, Math.max(barW - 0.5, 0.5), bh);
    });
    ctx.globalAlpha = 1;

    const bx1 = idxToX(brush.start, w);
    const bx2 = idxToX(brush.end, w);

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(OVERVIEW_PAD.l, OVERVIEW_PAD.t, bx1 - OVERVIEW_PAD.l, chartH);
    ctx.fillRect(bx2, OVERVIEW_PAD.t, w - OVERVIEW_PAD.r - bx2, chartH);

    ctx.fillStyle = "rgba(96,165,250,0.13)";
    ctx.fillRect(bx1, OVERVIEW_PAD.t, bx2 - bx1, chartH);

    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 1.5;
    [bx1, bx2].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, OVERVIEW_PAD.t);
      ctx.lineTo(x, OVERVIEW_PAD.t + chartH);
      ctx.stroke();
    });

    const handleW = 5;
    const handleH = 26;
    const handleY = OVERVIEW_PAD.t + (chartH - handleH) / 2;
    ctx.fillStyle = "#60a5fa";
    [bx1, bx2].forEach((x) => {
      ctx.beginPath();
      ctx.roundRect(x - handleW / 2, handleY, handleW, handleH, 3);
      ctx.fill();
    });

    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    const labelStep = Math.ceil(N / 8);
    for (let i = 0; i < N; i += labelStep) {
      ctx.fillText(String(i + 1), OVERVIEW_PAD.l + (i + 0.5) * barW, h - 4);
    }
  }, [data, brush, fastest, slowest, idxToX, N]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);


  const hitTestMouse = useCallback(
    (clientX: number, rect: DOMRect): "left" | "right" | "pan" | null => {
      const lx = rect.left + idxToX(brush.start, rect.width);
      const rx = rect.left + idxToX(brush.end, rect.width);
      if (Math.abs(clientX - lx) <= HANDLE_HIT_MOUSE) return "left";
      if (Math.abs(clientX - rx) <= HANDLE_HIT_MOUSE) return "right";
      if (clientX > lx && clientX < rx) return "pan";
      return null;
    },
    [brush, idxToX]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const type = hitTestMouse(e.clientX, rect);
      if (!type) return;
      mouseDragRef.current = { type, anchorX: e.clientX, anchorBrush: { ...brush } };
      e.preventDefault();
    },
    [brush, hitTestMouse]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = mouseDragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const w = canvas.clientWidth;
      const usable = w - OVERVIEW_PAD.l - OVERVIEW_PAD.r;
      const dIdx = ((e.clientX - drag.anchorX) / usable) * N;
      if (drag.type === "left") {
        onBrushChange({ start: drag.anchorBrush.start + dIdx, end: drag.anchorBrush.end });
      } else if (drag.type === "right") {
        onBrushChange({ start: drag.anchorBrush.start, end: drag.anchorBrush.end + dIdx });
      } else {
        const span = drag.anchorBrush.end - drag.anchorBrush.start;
        let start = drag.anchorBrush.start + dIdx;
        let end = drag.anchorBrush.end + dIdx;
        if (start < 0) { start = 0; end = span; }
        if (end > N) { end = N; start = N - span; }
        onBrushChange({ start, end });
      }
    };
    const onUp = () => { mouseDragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [N, onBrushChange]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const idx = xToIdx(e.clientX - rect.left, rect.width);
      onZoom(idx, e.deltaY > 0 ? 1.12 : 0.88);
    },
    [xToIdx, onZoom]
  );

  const getCursor = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const type = hitTestMouse(e.clientX, rect);
      if (type === "left" || type === "right") return "ew-resize";
      if (type === "pan") return "grab";
      return "default";
    },
    [hitTestMouse]
  );


  const hitTestTouch = useCallback(
    (relX: number, w: number): "left" | "right" | "pan" | "jump" => {
      const lx = idxToX(brush.start, w);
      const rx = idxToX(brush.end, w);
      if (Math.abs(relX - lx) <= HANDLE_HIT_TOUCH) return "left";
      if (Math.abs(relX - rx) <= HANDLE_HIT_TOUCH) return "right";
      if (relX > lx && relX < rx) return "pan";
      return "jump";
    },
    [brush, idxToX]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const relX = t.clientX - rect.left;
        const hitType = hitTestTouch(relX, rect.width);

        if (hitType === "jump") {
          const idx = xToIdx(relX, rect.width);
          const span = brush.end - brush.start;
          onBrushChange(clampBrush({ start: idx - span / 2, end: idx + span / 2 }, N));
          return;
        }

        touchRef.current = {
          mode: "single",
          lastX: t.clientX,
          lastSpan: 0,
          anchorBrush: { ...brush },
          hitType,
        };
        e.preventDefault();
      } else if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const spanPx = Math.abs(t2.clientX - t1.clientX);
        touchRef.current = {
          mode: "pinch",
          lastX: (t1.clientX + t2.clientX) / 2,
          lastSpan: spanPx,
          anchorBrush: { ...brush },
          hitType: null,
        };
        e.preventDefault();
      }
    },
    [brush, hitTestTouch, xToIdx, N, onBrushChange]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const state = touchRef.current;

      if (e.touches.length === 1 && state.mode === "single") {
        const t = e.touches[0];
        const usable = rect.width - OVERVIEW_PAD.l - OVERVIEW_PAD.r;
        const dIdx = ((t.clientX - state.lastX) / usable) * N;

        if (state.hitType === "left") {
          onBrushChange({ start: state.anchorBrush.start - dIdx, end: state.anchorBrush.end });
          state.anchorBrush = { start: state.anchorBrush.start - dIdx, end: state.anchorBrush.end };
        } else if (state.hitType === "right") {
          onBrushChange({ start: state.anchorBrush.start, end: state.anchorBrush.end + dIdx });
          state.anchorBrush = { start: state.anchorBrush.start, end: state.anchorBrush.end + dIdx };
        } else if (state.hitType === "pan") {
          const span = state.anchorBrush.end - state.anchorBrush.start;
          let start = state.anchorBrush.start - dIdx;
          let end = state.anchorBrush.end - dIdx;
          if (start < 0) { start = 0; end = span; }
          if (end > N) { end = N; start = N - span; }
          onBrushChange({ start, end });
          state.anchorBrush = { start, end };
        }
        state.lastX = t.clientX;
        e.preventDefault();
      } else if (e.touches.length === 2 && state.mode === "pinch") {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const midX = (t1.clientX + t2.clientX) / 2;
        const spanPx = Math.abs(t2.clientX - t1.clientX);
        const centerIdx = xToIdx(midX - rect.left, rect.width);
        if (state.lastSpan > 0) {
          const factor = state.lastSpan / Math.max(spanPx, 1);
          onZoom(centerIdx, factor);
        }
        state.lastSpan = spanPx;
        state.lastX = midX;
        e.preventDefault();
      }
    },
    [N, onBrushChange, onZoom, xToIdx]
  );

  const handleTouchEnd = useCallback(() => {
    touchRef.current.mode = null;
    touchRef.current.hitType = null;
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: 90, position: "relative", touchAction: "none" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onMouseMove={(e) => { e.currentTarget.style.cursor = getCursor(e); }}
        onMouseLeave={(e) => { e.currentTarget.style.cursor = "default"; }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}


interface DetailCanvasProps {
  data: PuzzleDataPoint[];
  brush: BrushState;
  fastest: number;
  slowest: number;
  height?: number;
  onPan?: (delta: number) => void;
}

function DetailCanvas({ data, brush, fastest, slowest, height = 260, onPan }: DetailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: PuzzleDataPoint } | null>(null);
  const swipeRef = useRef<{ lastX: number; anchorBrush: BrushState } | null>(null);

  const slice = useMemo(
    () => data.slice(Math.floor(brush.start), Math.min(Math.ceil(brush.end), data.length)),
    [data, brush]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !slice.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const chartW = w - DETAIL_PAD.l - DETAIL_PAD.r;
    const chartH = h - DETAIL_PAD.t - DETAIL_PAD.b;
    const maxT = Math.max(...slice.map((d) => d.time));
    const barW = chartW / slice.length;

    ctx.clearRect(0, 0, w, h);

    for (let i = 1; i <= 4; i++) {
      const f = i / 4;
      const y = DETAIL_PAD.t + chartH - f * chartH;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(DETAIL_PAD.l, y);
      ctx.lineTo(DETAIL_PAD.l + chartW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(fmtS(f * maxT), DETAIL_PAD.l - 5, y + 3.5);
    }

    slice.forEach((d, i) => {
      const bh = Math.max(1, (d.time / maxT) * chartH);
      const x = DETAIL_PAD.l + i * barW;
      const y = DETAIL_PAD.t + (chartH - bh);
      const gutter = barW > 3 ? 1 : 0;
      const bw = Math.max(barW - gutter, 0.5);
      const r = Math.min(3, bw * 0.25);
      ctx.fillStyle = getBarColor(d.time, fastest, slowest);
      if (bw > 6 && r > 0) {
        ctx.beginPath();
        ctx.moveTo(x + gutter / 2 + r, y);
        ctx.arcTo(x + gutter / 2 + bw, y, x + gutter / 2 + bw, y + r, r);
        ctx.lineTo(x + gutter / 2 + bw, DETAIL_PAD.t + chartH);
        ctx.lineTo(x + gutter / 2, DETAIL_PAD.t + chartH);
        ctx.arcTo(x + gutter / 2, y, x + gutter / 2 + r, y, r);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x + gutter / 2, y, bw, bh);
      }
    });

    const labelStep = Math.max(1, Math.ceil(slice.length / 10));
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    slice.forEach((d, i) => {
      if (i % labelStep === 0 || i === slice.length - 1) {
        ctx.fillText(String(d.puzzle), DETAIL_PAD.l + (i + 0.5) * barW, h - 6);
      }
    });
  }, [slice, fastest, slowest]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left - DETAIL_PAD.l;
      const barW = (rect.width - DETAIL_PAD.l - DETAIL_PAD.r) / slice.length;
      const i = Math.floor(relX / barW);
      if (i < 0 || i >= slice.length) { setTooltip(null); return; }
      const d = slice[i];
      const barCX = DETAIL_PAD.l + (i + 0.5) * barW;
      let tx = barCX + 14;
      if (tx + 155 > rect.width) tx = barCX - 169;
      setTooltip({ x: tx, y: Math.max(8, e.clientY - rect.top - 70), d });
    },
    [slice]
  );

  // Touch: swipe left/right pans the brush
  const handleDetailTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 1) {
        swipeRef.current = { lastX: e.touches[0].clientX, anchorBrush: { ...brush } };
      }
    },
    [brush]
  );

  const handleDetailTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (!swipeRef.current || !onPan || e.touches.length !== 1) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dx = e.touches[0].clientX - swipeRef.current.lastX;
      const span = brush.end - brush.start;
      const usable = canvas.clientWidth - DETAIL_PAD.l - DETAIL_PAD.r;
      // Swipe right → go left (negative delta), swipe left → go right
      const dIdx = -(dx / usable) * span;
      onPan(dIdx);
      swipeRef.current.lastX = e.touches[0].clientX;
      e.preventDefault();
    },
    [brush, onPan]
  );

  const handleDetailTouchEnd = useCallback(() => {
    swipeRef.current = null;
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height, position: "relative", touchAction: "none" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onTouchStart={handleDetailTouchStart}
        onTouchMove={handleDetailTouchMove}
        onTouchEnd={handleDetailTouchEnd}
      />
      {tooltip && (
        <div style={{
          position: "absolute", left: tooltip.x, top: tooltip.y,
          pointerEvents: "none", background: "#18181b",
          border: "1px solid rgba(255,255,255,0.13)", borderRadius: 10,
          padding: "8px 12px", fontSize: 13, color: "#fff",
          whiteSpace: "nowrap", zIndex: 10, lineHeight: 1.65,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>Puzzle {tooltip.d.puzzle}</div>
          <div style={{ color: "#4ade80" }}>Time: {fmtS(tooltip.d.time)}</div>
          <div style={{ color: "#60a5fa" }}>Total: {fmtS(tooltip.d.cumulative)}</div>
          {tooltip.d.time === fastest && <div style={{ color: "#4ade80", fontSize: 11, marginTop: 3 }}>⚡ fastest</div>}
          {tooltip.d.time === slowest && <div style={{ color: "#facc15", fontSize: 11, marginTop: 3 }}>🐢 slowest</div>}
        </div>
      )}
    </div>
  );
}


function StatCard({ icon, label, value, color, bg, border }: {
  icon: React.ReactNode; label: string; value: string;
  color: string; bg: string; border: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "14px 16px", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ color, opacity: 0.85 }}>{icon}</span>
        <span style={{ fontSize: 10, color, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}


const mobileBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, color: "#fff", fontSize: 13,
  padding: "0", cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center",
  width: 40, height: 40, flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
};

function MobileZoomBar({ brush, total, onZoom, onPan }: {
  brush: BrushState; total: number;
  onZoom: (c: number, f: number) => void;
  onPan: (d: number) => void;
}) {
  const center = (brush.start + brush.end) / 2;
  const span = brush.end - brush.start;
  const pct = Math.round((span / total) * 100);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: "8px 10px", marginTop: 8,
    }}>
      <button style={mobileBtnStyle} onPointerDown={() => onPan(-Math.max(1, span * 0.25))}>◀</button>
      <button style={mobileBtnStyle} onPointerDown={() => onZoom(center, 1.3)}><ZoomOut size={15} /></button>
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>
          #{Math.floor(brush.start) + 1} – #{Math.min(Math.ceil(brush.end), total)}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
          {span <= total ? `${pct}% visible` : "all puzzles"}
        </div>
      </div>
      <button style={mobileBtnStyle} onPointerDown={() => onZoom(center, 0.7)}><ZoomIn size={15} /></button>
      <button style={mobileBtnStyle} onPointerDown={() => onPan(Math.max(1, span * 0.25))}>▶</button>
    </div>
  );
}


function normalizeAttemptList(value: unknown): AttemptSummary[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const rawId = (item as { _id?: unknown })._id;
      const rawAttempt = (item as { attemptnumber?: unknown }).attemptnumber;
      const attemptnumber = Number(rawAttempt);

      if (typeof rawId !== "string" || !Number.isFinite(attemptnumber)) {
        return null;
      }

      return {
        _id: rawId,
        attemptnumber,
      };
    })
    .filter((item): item is AttemptSummary => item !== null);
}

function normalizeReport(value: unknown): ReportRecord | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Partial<ReportRecord>;
  if (typeof raw._id !== "string" || !Number.isFinite(Number(raw.attemptnumber))) {
    return null;
  }

  return {
    _id: raw._id,
    user_id: raw.user_id,
    set_id: raw.set_id,
    attemptnumber: Number(raw.attemptnumber),
    totaltimems: Number(raw.totaltimems ?? 0),
    solvedclean: Number(raw.solvedclean ?? 0),
    failed: Number(raw.failed ?? 0),
    timebucket: typeof raw.timebucket === "string" ? raw.timebucket : null,
    createdat: typeof raw.createdat === "string" ? raw.createdat : undefined,
  };
}

function decodeBucketFromBase64(encoded?: string | null): number[] {
  if (!encoded) return [];

  try {
    const decoded = window.atob(encoded);
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

function normalizeBucket(bucket: unknown, encodedBucket?: string | null): number[] {
  if (Array.isArray(bucket)) {
    return bucket
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  return decodeBucketFromBase64(encodedBucket);
}

function buildDataPoints(bucket: number[]): PuzzleDataPoint[] {
  return bucket.map((cumulative, index) => ({
    puzzle: index + 1,
    time: Math.max(0, cumulative - (bucket[index - 1] ?? 0)),
    cumulative,
  }));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as { error?: unknown; message?: unknown } | undefined;
    if (typeof responseData?.error === "string" && responseData.error.trim()) return responseData.error;
    if (typeof responseData?.message === "string" && responseData.message.trim()) return responseData.message;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function normalizeSessionReportsPayload(payload?: SessionReportsResponse): SessionReportsData {
  const attempts = normalizeAttemptList(payload?.list);
  const report = normalizeReport(payload?.report);

  return {
    attempts,
    latestReport: report
      ? {
        report,
        bucket: normalizeBucket(payload?.bucket, report.timebucket),
      }
      : null,
  };
}

function normalizeResultReportPayload(payload?: ResultReportResponse): ReportPayload {
  const report = normalizeReport(payload?.data);
  if (!report) {
    throw new Error("Invalid report payload.");
  }

  return {
    report,
    bucket: normalizeBucket(payload?.bucket, report.timebucket),
  };
}

async function fetchSessionReports(sessionId: string): Promise<SessionReportsData> {
  const response = await axios.get<SessionReportsResponse>(
    `http://localhost:3030/woodpeaker/session/${sessionId}/reports`,
    { withCredentials: true },
  );

  return normalizeSessionReportsPayload(response.data);
}

async function fetchResultReport(resultId: string): Promise<ReportPayload> {
  const response = await axios.get<ResultReportResponse>(
    `http://localhost:3030/woodpeaker/report/${resultId}`,
    { withCredentials: true },
  );

  return normalizeResultReportPayload(response.data);
}

export default function GraphPage() {
  const navigate = useNavigate();
  const params = useParams();
  const sessionId = params.sessionId ?? params.id ?? "";
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState("");
  const [displayReportData, setDisplayReportData] = useState<ReportPayload | null>(null);

  const sessionReportsQuery = useQuery({
    queryKey: ["woodpeaker-session-reports", sessionId],
    queryFn: () => fetchSessionReports(sessionId),
    enabled: Boolean(sessionId),
  });

  const attempts = sessionReportsQuery.data?.attempts ?? [];
  const latestReport = sessionReportsQuery.data?.latestReport ?? null;
  const fallbackSelectedReportId = latestReport?.report._id ?? attempts[0]?._id ?? "";

  useEffect(() => {
    setSelectedReportId("");
    setDisplayReportData(null);
  }, [sessionId]);

  useEffect(() => {
    if (!latestReport) return;
    queryClient.setQueryData(["woodpeaker-report", latestReport.report._id], latestReport);
  }, [latestReport, queryClient]);

  useEffect(() => {
    if (!fallbackSelectedReportId) return;

    const selectionStillExists = attempts.some((attempt) => attempt._id === selectedReportId);
    if (!selectedReportId || !selectionStillExists) {
      setSelectedReportId(fallbackSelectedReportId);
    }
  }, [attempts, fallbackSelectedReportId, selectedReportId]);

  const reportQuery = useQuery({
    queryKey: ["woodpeaker-report", selectedReportId],
    queryFn: () => fetchResultReport(selectedReportId),
    enabled: Boolean(selectedReportId),
    placeholderData: (previousData) => {
      if (previousData) return previousData;
      if (latestReport?.report._id === selectedReportId) return latestReport;
      return undefined;
    },
  });

  const resolvedReportData = useMemo(() => {
    if (reportQuery.data) return reportQuery.data;
    if (latestReport?.report._id === selectedReportId) return latestReport;
    return null;
  }, [latestReport, reportQuery.data, selectedReportId]);

  useEffect(() => {
    if (!resolvedReportData) return;
    setDisplayReportData(resolvedReportData);
  }, [resolvedReportData]);

  const activeReportData = resolvedReportData ?? displayReportData;
  const activeReport = activeReportData?.report ?? null;
  const bucket = activeReportData?.bucket ?? [];
  const isInitialLoading = Boolean(sessionId) && !activeReportData && (sessionReportsQuery.isLoading || reportQuery.isLoading);
  const isAttemptRefreshing = Boolean(activeReportData) && reportQuery.isFetching;
  const errorMessage = useMemo(() => {
    if (!sessionId) return "Missing session id in route.";
    if (sessionReportsQuery.isError && !sessionReportsQuery.data) {
      return getErrorMessage(sessionReportsQuery.error, "Failed to load session reports.");
    }
    if (reportQuery.isError) {
      return getErrorMessage(reportQuery.error, "Failed to load the selected attempt.");
    }
    return null;
  }, [reportQuery.error, reportQuery.isError, sessionId, sessionReportsQuery.data, sessionReportsQuery.error, sessionReportsQuery.isError]);

  const data = useMemo<PuzzleDataPoint[]>(() => {
    return buildDataPoints(bucket);
  }, [bucket]);

  const allTimes = useMemo(() => data.map((d) => d.time), [data]);
  const totalTime = data[data.length - 1]?.cumulative ?? 0;
  const avgTime = data.length > 0 ? Math.round(totalTime / data.length) : 0;
  const fastest = useMemo(() => (allTimes.length > 0 ? Math.min(...allTimes) : 0), [allTimes]);
  const slowest = useMemo(() => (allTimes.length > 0 ? Math.max(...allTimes) : 0), [allTimes]);

  const { brush, setBrush, zoom, pan } = useBrush(data.length, Math.min(50, data.length));

  useEffect(() => {
    if (data.length === 0 || !activeReport?._id) return;
    setBrush({ start: 0, end: Math.min(50, data.length) });
  }, [activeReport?._id, data.length, setBrush]);

  const sliceStart = data.length > 0 ? Math.floor(brush.start) + 1 : 0;
  const sliceEnd = data.length > 0 ? Math.min(Math.ceil(brush.end), data.length) : 0;
  const formattedCreatedAt = activeReport?.createdat
    ? new Date(activeReport.createdat).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : null;
  const backTarget = sessionId ? `/woodpeaker/${sessionId}` : "/wood";

  return (
    <div style={{
      minHeight: "100vh", background: "#09090b", color: "#fff",
      padding: isMobile ? "16px 12px 32px" : "24px 20px",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isMobile ? 16 : 28 }}>
          <button
            onClick={() => navigate(backTarget)}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "6px 10px",
              cursor: "pointer", color: "rgba(255,255,255,0.5)",
              display: "flex", alignItems: "center",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? 16 : 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart3 size={isMobile ? 16 : 20} color="#4ade80" />
                Puzzle Performance
              </h1>
              {activeReport && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: "rgba(96,165,250,0.15)", color: "#60a5fa",
                  padding: "4px 10px", borderRadius: 999,
                  border: "1px solid rgba(96,165,250,0.25)",
                }}>
                  Attempt {activeReport.attemptnumber}
                </span>
              )}
              {isAttemptRefreshing && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)",
                  padding: "4px 10px", borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.1)",
                }}>
                  Updating...
                </span>
              )}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(255,255,255,0.38)" }}>
              {sessionId ? `Session ${sessionId}` : "Session report"}
            </p>
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18,
          padding: isMobile ? "12px 10px" : "16px 18px",
          marginBottom: isMobile ? 12 : 18,
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 10,
            flexDirection: isMobile ? "column" : "row",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Attempt History
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                {attempts.length > 0 ? `${attempts.length} saved submissions` : "No saved submissions yet"}
              </div>
              <div style={{ marginTop: 12, minWidth: isMobile ? "100%" : 240 }}>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                    Attempt
                  </span>
                  <div style={{ position: "relative", marginTop: 8 }}>
                    <select
                      value={selectedReportId}
                      onChange={(event) => setSelectedReportId(event.target.value)}
                      disabled={!attempts.length || sessionReportsQuery.isLoading}
                      style={{
                        width: "100%",
                        appearance: "none",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 12,
                        padding: "11px 38px 11px 12px",
                        backgroundColor: "#18181b",
                        color: "#f4f4f5",
                        fontSize: 13,
                        fontWeight: 600,
                        outline: "none",
                        cursor: attempts.length > 0 ? "pointer" : "not-allowed",
                        colorScheme: "dark",
                      }}
                    >
                      {attempts.length === 0 && (
                        <option value="" style={{ backgroundColor: "#18181b", color: "#f4f4f5" }}>
                          No attempts
                        </option>
                      )}
                      {attempts.map((attempt) => (
                        <option
                          key={attempt._id}
                          value={attempt._id}
                          style={{ backgroundColor: "#18181b", color: "#f4f4f5" }}
                        >
                          Attempt {attempt.attemptnumber}
                        </option>
                      ))}
                    </select>
                    <span style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.42)",
                    }}>
                      ▼
                    </span>
                  </div>
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeReport && (
                <span style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "6px 10px",
                  borderRadius: 999,
                }}>
                  Solved {activeReport.solvedclean}
                </span>
              )}
              {activeReport && (
                <span style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "6px 10px",
                  borderRadius: 999,
                }}>
                  Failed {activeReport.failed}
                </span>
              )}
              {formattedCreatedAt && (
                <span style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "6px 10px",
                  borderRadius: 999,
                }}>
                  {formattedCreatedAt}
                </span>
              )}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.18)",
            borderRadius: 18,
            padding: "14px 16px",
            marginBottom: 18,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fca5a5" }}>
              {errorMessage}
            </div>
            <button
              type="button"
              onClick={() => {
                void sessionReportsQuery.refetch();
                if (selectedReportId) {
                  void reportQuery.refetch();
                }
              }}
              style={{
                marginTop: 10,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "8px 12px",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {isInitialLoading && (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
              gap: 8, marginBottom: isMobile ? 12 : 20,
            }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    padding: "14px 16px",
                    minHeight: 80,
                  }}
                />
              ))}
            </div>

            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              minHeight: 128,
              marginBottom: 10,
            }} />

            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              minHeight: isMobile ? 236 : 296,
            }} />
          </>
        )}

        {!isInitialLoading && data.length > 0 && (
          <>
        {/* Stats grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: 8, marginBottom: isMobile ? 12 : 20,
        }}>
          <StatCard icon={<Clock size={14} />} label="Total" value={fmtS(totalTime)} color="#4ade80" bg="linear-gradient(135deg,rgba(74,222,128,0.12),rgba(34,197,94,0.06))" border="rgba(74,222,128,0.25)" />
          <StatCard icon={<Zap size={14} />} label="Avg / Puzzle" value={fmtS(avgTime)} color="#60a5fa" bg="linear-gradient(135deg,rgba(96,165,250,0.12),rgba(59,130,246,0.06))" border="rgba(96,165,250,0.25)" />
          <StatCard icon={<Target size={14} />} label="Fastest" value={fmtS(fastest)} color="#4ade80" bg="linear-gradient(135deg,rgba(74,222,128,0.12),rgba(34,197,94,0.06))" border="rgba(74,222,128,0.25)" />
          <StatCard icon={<Clock size={14} />} label="Slowest" value={fmtS(slowest)} color="#facc15" bg="linear-gradient(135deg,rgba(250,204,21,0.12),rgba(234,179,8,0.06))" border="rgba(250,204,21,0.25)" />
        </div>

        {/* Overview card */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18, padding: isMobile ? "12px 10px 10px" : "16px 18px 12px",
          marginBottom: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              All {data.length} puzzles
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
              {isMobile ? "pinch · drag · tap to jump" : "drag handles · scroll to zoom · drag to pan"}
            </span>
          </div>
          <OverviewCanvas
            data={data}
            brush={brush}
            fastest={fastest}
            slowest={slowest}
            onBrushChange={setBrush}
            onZoom={zoom}
          />
        </div>

        {/* Mobile control bar — only on small screens */}
        {isMobile && (
          <MobileZoomBar brush={brush} total={data.length} onZoom={zoom} onPan={pan} />
        )}

        {/* Detail card */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18, padding: isMobile ? "12px 10px" : "16px 18px",
          marginTop: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 6 : 10 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Time per puzzle
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              background: "rgba(96,165,250,0.15)", color: "#60a5fa",
              padding: "3px 10px", borderRadius: 20,
              border: "1px solid rgba(96,165,250,0.2)",
            }}>
              #{sliceStart} – #{sliceEnd}
            </span>
          </div>
          {isMobile && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", margin: "0 0 6px", textAlign: "center" }}>
              swipe to pan
            </p>
          )}
          <DetailCanvas
            data={data}
            brush={brush}
            fastest={fastest}
            slowest={slowest}
            height={isMobile ? 200 : 260}
            onPan={pan}
          />
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14 }}>
          {[
            { color: "#4ade80", label: "fastest" },
            { color: "#22c55e", label: "normal" },
            { color: "#facc15", label: "slowest" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.38)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {label}
            </div>
          ))}
        </div>
          </>
        )}

        {!isInitialLoading && !errorMessage && data.length === 0 && (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 18,
            padding: "36px 18px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>No graph data available</div>
            <p style={{ margin: "8px auto 0", maxWidth: 420, fontSize: 13, color: "rgba(255,255,255,0.42)", lineHeight: 1.6 }}>
              This session does not have a saved report yet. Finish a submission first, then open this page again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
