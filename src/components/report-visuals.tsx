"use client";
import { useId } from "react";
import { chartDomain, chartSegments } from "@/lib/report-chart";
const palette = [
  "#21a9ef",
  "#42c9a1",
  "#f1ba65",
  "#ec6f85",
  "#9a8df1",
  "#8494a9",
];
export function ReportTrend({
  labels,
  series,
  unit = "count",
  compact = false,
  title,
  kind = "line",
}: {
  labels: string[];
  series: { label: string; values: (number | null)[]; color?: string }[];
  unit?: "count" | "INR";
  compact?: boolean;
  title: string;
  kind?: "line" | "bar";
}) {
  const id = useId().replaceAll(":", ""),
    domain = chartDomain(series);
  const format = (v: number, short = false) =>
    new Intl.NumberFormat("en-IN", {
      ...(unit === "INR" ? { style: "currency", currency: "INR" } : {}),
      maximumFractionDigits: short ? 1 : 2,
      ...(short ? { notation: "compact" } : {}),
    }).format(v);
  const ticks = Array.from(
    { length: 5 },
    (_, i) => domain.max - ((domain.max - domain.min) * i) / 4,
  );
  const labelIndices = [
    ...new Set(
      Array.from({ length: Math.min(6, labels.length) }, (_, i) =>
        Math.round(
          (i * (labels.length - 1)) /
            Math.max(1, Math.min(6, labels.length) - 1),
        ),
      ),
    ),
  ];
  if (!domain.available)
    return (
      <p className="chart-unavailable">
        {labels.length
          ? "Data unavailable"
          : "No recorded trend data for this period"}
      </p>
    );
  return (
    <div className={compact ? "report-trend compact" : "report-trend"}>
      <svg
        viewBox={compact ? "45 20 670 200" : "0 0 735 255"}
        role="img"
        aria-label={title}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient
              key={s.label}
              id={`${id}-${i}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={s.color || palette[i % palette.length]}
                stopOpacity=".22"
              />
              <stop
                offset="100%"
                stopColor={s.color || palette[i % palette.length]}
                stopOpacity="0"
              />
            </linearGradient>
          ))}
        </defs>
        {!compact &&
          ticks.map((t, i) => (
            <g key={i}>
              <line
                className="trend-grid"
                x1="54"
                x2="704"
                y1={32 + i * 44.5}
                y2={32 + i * 44.5}
              />
              <text
                className="trend-axis"
                x="44"
                y={36 + i * 44.5}
                textAnchor="end"
              >
                {format(t, true)}
              </text>
            </g>
          ))}
        {series.map((s, i) =>
          chartSegments(s.values, domain.min, domain.max).map((segment, j) => {
            const base =
              210 - ((0 - domain.min) / (domain.max - domain.min)) * 178;
            const points = segment.map((p) => `${p.x},${p.y}`).join(" ");
            if (kind === "bar")
              return (
                <g key={`${i}-${j}`}>
                  {segment.map((p) => (
                    <rect
                      key={p.index}
                      x={
                        54 +
                        ((p.index + 0.15) * 650) / Math.max(1, labels.length)
                      }
                      width={(650 / Math.max(1, labels.length)) * 0.7}
                      y={Math.min(p.y, base)}
                      height={Math.abs(base - p.y)}
                      fill={s.color || palette[i % palette.length]}
                      rx="2"
                    >
                      <title>
                        {labels[p.index]} · {s.label}: {format(p.value)}
                      </title>
                    </rect>
                  ))}
                </g>
              );
            return (
              <g key={`${i}-${j}`}>
                {segment.length > 1 && (
                  <polygon
                    points={`${segment[0].x},${base} ${points} ${segment.at(-1)!.x},${base}`}
                    fill={`url(#${id}-${i})`}
                  />
                )}
                <polyline
                  points={points}
                  fill="none"
                  stroke={s.color || palette[i % palette.length]}
                  strokeWidth={compact ? 3 : 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {!compact &&
                  segment.map((p) => (
                    <circle
                      key={p.index}
                      cx={p.x}
                      cy={p.y}
                      r="3.2"
                      fill={s.color || palette[i % palette.length]}
                    >
                      <title>
                        {labels[p.index]} · {s.label}: {format(p.value)}
                      </title>
                    </circle>
                  ))}
              </g>
            );
          }),
        )}
        {!compact &&
          labelIndices.map((index) => (
            <text
              key={index}
              className="trend-axis"
              x={
                kind === "bar"
                  ? 54 + ((index + 0.5) * 650) / Math.max(1, labels.length)
                  : labels.length === 1
                    ? 380
                    : 54 + (index * 650) / (labels.length - 1)
              }
              y="237"
              textAnchor="middle"
            >
              {labels[index]}
            </text>
          ))}
      </svg>
      {!compact && (
        <div className="report-chart-legend">
          {series.map((s, i) => (
            <span key={s.label}>
              <i
                style={{ background: s.color || palette[i % palette.length] }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
export function StageRing({
  items,
}: {
  items: { label: string; value: number }[];
}) {
  const total = items.reduce((n, x) => n + x.value, 0);
  let offset = 0;
  return (
    <div className="stage-ring-layout">
      <svg
        viewBox="0 0 160 160"
        role="img"
        aria-label={`Enquiry stage distribution, ${total} recorded enquiries`}
      >
        <circle
          className="ring-track"
          cx="80"
          cy="80"
          r="61"
          fill="none"
          strokeWidth="12"
        />
        {items.map((item, i) => {
          const length = total ? (item.value / total) * 100 : 0;
          const previous = offset;
          offset += length;
          return (
            <circle
              key={item.label}
              cx="80"
              cy="80"
              r="61"
              pathLength="100"
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth="12"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-previous}
              transform="rotate(-90 80 80)"
            >
              <title>
                {item.label}: {item.value}
              </title>
            </circle>
          );
        })}
        <text x="80" y="79" textAnchor="middle" className="ring-total">
          {total.toLocaleString("en-IN")}
        </text>
        <text x="80" y="99" textAnchor="middle" className="ring-caption">
          Enquiries
        </text>
      </svg>
      <dl>
        {items.map((item, i) => (
          <div key={item.label}>
            <dt>
              <i style={{ background: palette[i % palette.length] }} />
              {item.label}
            </dt>
            <dd>{item.value.toLocaleString("en-IN")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
