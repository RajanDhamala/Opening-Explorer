import DetailedCanvas from "../test/DetailedCanvas";
import OverviewCanvas from "../test/OverviewCanvas";
import { useBrush } from "../test/useBrush";

const BUCKET = [461, 2660, 4811, 7110, 9044, 10711, 13478, 16260, 18011, 19628];
const DATA = BUCKET.map((time, i) => ({
  puzzle: i + 1,
  time: i === 0 ? time : time - BUCKET[i - 1],
  cumulative: time,
}));
const FASTEST = Math.min(...DATA.map((d) => d.time));
const SLOWEST = Math.max(...DATA.map((d) => d.time));

export default function CanvasPage() {
  const { brush, setBrush, zoom } = useBrush({ total: DATA.length });

  return (
    <div>
      <DetailedCanvas
        data={DATA}
        brush={brush}
        fastest={FASTEST}
        slowest={SLOWEST}
        onBrushChange={setBrush}
        onZoom={zoom}
      />
      <OverviewCanvas
        data={DATA}
        brush={brush}
        fastest={FASTEST}
        slowest={SLOWEST}
        onBrushChange={setBrush}
        onZoom={zoom}
      />
    </div>
  );
}
