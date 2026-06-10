"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import type { AreaScore } from "@/types/dashboard";

interface ScoreChartProps {
  areaScores: AreaScore[];
}

function barColor(score: number): string {
  if (score >= 4.0) return "#16a34a";  // strong — green
  if (score >= 3.5) return "#6366f1";  // stable — indigo
  if (score >= 3.0) return "#ca8a04";  // watch  — amber
  return "#dc2626";                    // concern — red
}

function shortLabel(area: string): string {
  const map: Record<string, string> = {
    "Direction & Priorities":    "Direction",
    "Value & Focus":             "Value",
    "Ownership & Empowerment":   "Ownership",
    "Ways of Working":           "Ways",
    "Collaboration & Support":   "Collab",
    "Workload & Sustainability": "Workload",
    "Team Climate & Safety":     "Climate",
  };
  return map[area] ?? area;
}

const LEGEND = [
  { label: "Strong ≥ 4.0", color: "#16a34a" },
  { label: "Stable ≥ 3.5", color: "#6366f1" },
  { label: "Watch ≥ 3.0",  color: "#ca8a04" },
  { label: "Concern < 3.0", color: "#dc2626" },
];

export default function ScoreChart({ areaScores }: ScoreChartProps) {
  if (!areaScores.length) {
    return (
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-100/60 p-5 text-sm text-slate-500">
        No pulse area scores available yet.
      </div>
    );
  }

  const data = areaScores.map((d) => ({
    ...d,
    shortArea: shortLabel(d.area),
  }));

  return (
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-100/60 p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Pulse Area Scores</h3>
        <p className="text-xs text-slate-400 mt-0.5">Score out of 5 across pulse categories</p>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 8, left: -8, bottom: 0 }}
          barCategoryGap="32%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="shortArea"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 5]}
            tickCount={6}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={3.5} stroke="#94a3b850" strokeDasharray="3 3" />
          <Tooltip
            cursor={{ fill: "#f8fafc" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as AreaScore & { shortArea: string };
              return (
                <div className="bg-white border border-slate-200 rounded-md px-3 py-2 shadow-md text-xs">
                  <p className="font-semibold text-slate-700">{d.area}</p>
                  <p className="text-indigo-500 mt-0.5">{d.score.toFixed(1)} / 5</p>
                  {d.delta !== undefined && (
                    <p className="text-slate-400 mt-0.5">
                      {d.delta > 0 ? `↑ +${d.delta.toFixed(1)}` : d.delta < 0 ? `↓ ${d.delta.toFixed(1)}` : "→ 0.0"} vs last pulse
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="score" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 10, fill: "#94a3b8" }}>
            {data.map((entry) => (
              <Cell key={entry.area} fill={barColor(entry.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] text-slate-400">
        {LEGEND.map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
