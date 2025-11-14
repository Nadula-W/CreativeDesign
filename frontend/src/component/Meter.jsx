import React, { useId } from "react";
import GaugeChart from "react-gauge-chart";

function toPercent(value, min, max) {
  if (value == null || Number.isNaN(value)) return null;
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export default function Meter({
  title,
  value,
  unit = "",
  min = 0,
  max = 100,
  ranges = ["#ef4444", "#f59e0b", "#22c55e", "#e5e7eb"],
  compact = false,
  showRange = true,
  className = "",
  idPrefix = "",
}) {
  const pct = toPercent(value, min, max);
  const gaugeWidth = compact ? 200 : 280;
  const uid = useId(); // unique ID
  const safeTitle = (title || "").replace(/\s+/g, "_");
  const chartId = `${idPrefix}_${safeTitle}_${uid}`;

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {/* Display value */}
      <div className="mb-1 text-center text-xl font-bold text-slate-900">
        {value == null ? "--" : `${value}${unit}`}
      </div>

      {/* Gauge */}
      <div style={{ width: "100%", maxWidth: gaugeWidth, margin: "0 auto" }}>
        <GaugeChart
          id={chartId}
          nrOfLevels={24}
          arcsLength={[0.25, 0.25, 0.25, 0.25]}
          colors={ranges}
          percent={pct ?? 0}
          arcPadding={0.006}
          needleColor="#111827"
          textColor="#111827"
          formatTextValue={() => ""}
          animate={false}
          cornerRadius={3}
          style={{ width: "100%" }}
        />
      </div>

      {/* Title */}
      <div className="mt-1 text-center font-semibold text-slate-700">{title}</div>

      {/* Range */}
      {showRange && (
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>Min: {min}{unit}</span>
          <span>Max: {max}{unit}</span>
        </div>
      )}
    </div>
  );
}