import type { Metric } from '@cpi/contracts';

/**
 * Horizontal bar chart of percentage metrics. Decorative for sighted users; the adjacent
 * table carries the same values, so the SVG is hidden from assistive technology (FR12).
 */
export function MetricChart({ metrics }: { metrics: Metric[] }) {
  const rowHeight = 34;
  const labelWidth = 190;
  const width = 560;
  const barWidth = width - labelWidth - 60;
  return (
    <svg
      viewBox={`0 0 ${width} ${metrics.length * rowHeight + 10}`}
      className="w-full max-w-2xl"
      aria-hidden="true"
      focusable="false"
    >
      {metrics.map((metric, index) => {
        const y = index * rowHeight + 6;
        return (
          <g key={metric.id}>
            <text x={0} y={y + 16} className="fill-foreground text-[12px]">
              {metric.label}
            </text>
            <rect
              x={labelWidth}
              y={y + 4}
              width={barWidth}
              height={16}
              rx={3}
              className="fill-muted"
            />
            {metric.percent !== null && (
              <rect
                x={labelWidth}
                y={y + 4}
                width={(barWidth * metric.percent) / 100}
                height={16}
                rx={3}
                className="fill-primary"
              />
            )}
            <text
              x={labelWidth + barWidth + 8}
              y={y + 16}
              className="fill-foreground text-[12px] tabular-nums"
            >
              {metric.percent === null ? 'N/A' : `${metric.percent}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
