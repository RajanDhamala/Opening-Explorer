import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Clock, Zap, Target } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const DUMMY_DATA = {
  sessionId: "0343ef9c-fd93-459d-aba8-420b41f8884f",
  bucket: [461, 2660, 4811, 7110, 9044, 10711, 13478, 16260, 18011, 19628],
};

const COLORS = {
  green: "#4ade80",
  greenDark: "#22c55e",
  blue: "#60a5fa",
  purple: "#a78bfa",
  yellow: "#facc15",
};

export default function GraphPage() {
  const navigate = useNavigate();

  const chartData = useMemo(() => {
    const { bucket } = DUMMY_DATA;
    return bucket.map((time, i) => ({
      puzzle: i + 1,
      time: i === 0 ? time : time - bucket[i - 1],
      cumulative: time,
    }));
  }, []);

  const totalTime = chartData[chartData.length - 1]?.cumulative || 0;
  const avgTime = Math.round(totalTime / chartData.length);
  const fastest = Math.min(...chartData.map((d) => d.time));
  const slowest = Math.max(...chartData.map((d) => d.time));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-zinc-900 border border-white/20 rounded-xl p-4 shadow-xl">
          <p className="text-white font-bold text-lg mb-2">Puzzle {label}</p>
          <div className="space-y-1 text-sm">
            <p className="text-green-400">
              Time: <span className="font-semibold">{data.time}ms</span>
            </p>
            <p className="text-blue-400">
              Cumulative: <span className="font-semibold">{data.cumulative}ms</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const getBarColor = (time: number) => {
    if (time === fastest) return COLORS.green;
    if (time === slowest) return COLORS.yellow;
    return COLORS.greenDark;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/wood")}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="text-green-400" />
            Puzzle Performance
          </h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-green-400" />
              <span className="text-xs text-green-400/70 uppercase tracking-wider">Total Time</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{(totalTime / 1000).toFixed(2)}s</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-blue-400" />
              <span className="text-xs text-blue-400/70 uppercase tracking-wider">Avg per Puzzle</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">{avgTime}ms</p>
          </div>
          <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-green-400" />
              <span className="text-xs text-green-400/70 uppercase tracking-wider">Fastest</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{fastest}ms</p>
          </div>
          <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-yellow-400" />
              <span className="text-xs text-yellow-400/70 uppercase tracking-wider">Slowest</span>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{slowest}ms</p>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 text-white/80">Time Taken per Puzzle (ms)</h2>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis
                    dataKey="puzzle"
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                    tickFormatter={(value) => `${value}ms`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.1)" }} />
                  <Bar dataKey="time" radius={[8, 8, 0, 0]} cursor="pointer" maxBarSize={60}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.time)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
            Puzzle Breakdown
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {chartData.map((d) => (
              <div
                key={d.puzzle}
                className={`group relative bg-white/5 rounded-xl p-4 text-center transition-all hover:bg-white/10 hover:scale-105 cursor-pointer ${
                  d.time === fastest ? "ring-2 ring-green-500/50" : d.time === slowest ? "ring-2 ring-yellow-500/50" : ""
                }`}
              >
                <p className="text-xl font-bold text-white">{d.time}</p>
                <p className="text-xs text-white/40">Puzzle {d.puzzle}</p>
                <span className="text-[10px] text-white/30">ms</span>
                {d.time === fastest && (
                  <span className="absolute -top-1 -right-1 text-[10px] bg-green-500 text-black px-1.5 py-0.5 rounded-full font-bold">Fast</span>
                )}
                {d.time === slowest && (
                  <span className="absolute -top-1 -right-1 text-[10px] bg-yellow-500 text-black px-1.5 py-0.5 rounded-full font-bold">Slow</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-4 justify-center">
          <div className="flex items-center gap-2 text-sm text-white/50">
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span>Fastest</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <div className="w-3 h-3 rounded-full bg-green-600" />
            <span>Normal</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <span>Slowest</span>
          </div>
        </div>
      </div>
    </div>
  );
}