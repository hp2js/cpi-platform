import type { Oversight, TrendPoint } from '@cpi/contracts';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const rate = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

const percent = (value: number | null) =>
  value === null ? 'Not applicable' : `${value}%`;

/**
 * On-time reporting and review coverage per quarter. The SVG is decorative: the table beside it
 * carries every value, and a quarter not yet due is marked rather than drawn as zero (PRD §4.3).
 */
function TrendChart({ points }: { points: TrendPoint[] }) {
  const width = 520;
  const height = 180;
  const top = 12;
  const bottom = 30;
  const plot = height - top - bottom;
  const group = (width - 40) / points.length;
  const bar = Math.min(28, group / 3);
  const series = [
    { key: 'on-time', label: 'On time', className: 'fill-primary' },
    {
      key: 'finalized',
      label: 'Finalized',
      className: 'fill-base-dark',
    },
  ] as const;
  return (
    <figure className="grid gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-tablet"
        aria-hidden="true"
        focusable="false"
      >
        {[0, 50, 100].map((tick) => {
          const y = top + plot - (plot * tick) / 100;
          return (
            <g key={tick}>
              <line
                x1={36}
                x2={width}
                y1={y}
                y2={y}
                className="stroke-base-lighter"
              />
              <text
                x={30}
                y={y + 4}
                textAnchor="end"
                className="fill-base-dark text-[10px]"
              >
                {tick}%
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const x = 40 + index * group + group / 2;
          const values = [
            rate(point.onTime, point.due),
            rate(point.finalized, point.submitted),
          ];
          return (
            <g key={point.periodId}>
              {point.due === 0 ? (
                <text
                  x={x}
                  y={top + plot - 6}
                  textAnchor="middle"
                  className="fill-base-dark text-[10px]"
                >
                  Not due
                </text>
              ) : (
                series.map((item, seriesIndex) => {
                  const value = values[seriesIndex] ?? 0;
                  const barHeight = (plot * value) / 100;
                  return (
                    <rect
                      key={item.key}
                      x={x - bar + seriesIndex * bar}
                      y={top + plot - barHeight}
                      width={bar - 2}
                      height={Math.max(barHeight, 1)}
                      rx={2}
                      className={item.className}
                    />
                  );
                })
              )}
              <text
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="fill-ink text-[11px]"
              >
                {point.periodLabel}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex gap-4 text-xs text-base-dark">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-2">
            <svg className="size-3" aria-hidden="true" focusable="false">
              <rect width="12" height="12" rx="2" className={item.className} />
            </svg>
            {item.label === 'On time'
              ? 'On time (of reports due)'
              : 'Finalized (of reports received)'}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function Trends({
  data,
  headingId = 'trends-heading',
  title = 'Quarter by quarter',
}: {
  data: Pick<Oversight, 'trends' | 'reviewTarget'>;
  headingId?: string;
  title?: string;
}) {
  const unit = data.reviewTarget.unit === 'working' ? 'working days' : 'days';
  const anyDue = data.trends.some((point) => point.due > 0);
  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <div>
        <h2 id={headingId} className="text-lg font-bold">
          {title}
        </h2>
        <p className="text-sm text-base-dark">
          Reporting and review across the cycle. The officer review target is{' '}
          {data.reviewTarget.days} {unit} from receipt to a final decision.
        </p>
      </div>
      <div
        className={cn(
          'grid gap-6 rounded-lg border border-base-lighter bg-white p-5',
          anyDue && 'widescreen:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]',
        )}
      >
        {/* Until a quarter is due the chart would only draw empty axes; the table says so. */}
        {anyDue && <TrendChart points={data.trends} />}
        {/* The table's own container scrolls and joins the tab order when it overflows. */}
        <div className="min-w-0">
          <Table className="min-w-[40rem]">
            {anyDue && (
              <TableCaption className="text-left">
                The chart shows the on-time and finalized rates from this table.
              </TableCaption>
            )}
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Quarter</TableHead>
                <TableHead scope="col">Reports due</TableHead>
                <TableHead scope="col">On time</TableHead>
                <TableHead scope="col">Finalized</TableHead>
                <TableHead scope="col">Awaiting officer</TableHead>
                <TableHead scope="col">Past review target</TableHead>
                <TableHead scope="col">Average reviewed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trends.map((point) => (
                <TableRow key={point.periodId}>
                  <TableHead scope="row">{point.periodLabel}</TableHead>
                  <TableCell className="tabular-nums">
                    {point.due === 0 ? 'Not yet due' : point.due}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {point.due === 0
                      ? 'Not applicable'
                      : `${point.onTime} (${percent(rate(point.onTime, point.due))})`}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {point.submitted === 0
                      ? 'Not applicable'
                      : `${point.finalized} of ${point.submitted} (${percent(rate(point.finalized, point.submitted))})`}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {point.awaitingOfficer}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {point.reviewOverdue}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {point.averagePoints ?? 'Not applicable'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
