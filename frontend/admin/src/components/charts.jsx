import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Charts for the console. Dark surface only (the console is dark-locked).
 * Categorical slots 1–3 of the reference palette, dark steps, validated against
 * the console surface (#141416): CVD ΔE ≥ 9.4, contrast ≥ 3:1. Colour follows
 * the series, never its rank; ≥2 series always get a legend.
 */
export const SERIES = ['#3987e5', '#d95926', '#199e70'];

const AXIS = { stroke: '#52525b', fontSize: 11, tickLine: false, axisLine: false };

const shortDate = (key) => {
  const [, m, d] = String(key).split('-');
  return `${Number(d)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`;
};

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-zinc-400">{shortDate(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-zinc-100">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-zinc-400">{p.name}</span>
          <span className="ml-auto tabular font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Daily bars. `series`: [{ key, label }] — one series renders without a legend
 * (the card title names it); two or three stack with a legend.
 */
export function DailyBars({ data, series, height = 200, stacked = true }) {
  const total = data.reduce((sum, d) => sum + series.reduce((s, x) => s + (Number(d[x.key]) || 0), 0), 0);
  if (!data.length || total === 0) {
    return <div className="flex items-center justify-center text-sm text-zinc-600" style={{ height }}>No events in this period</div>;
  }
  return (
    <div style={{ height }} role="img" aria-label={`Daily ${series.map((s) => s.label).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="#27272a" />
          <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} minTickGap={16} />
          <YAxis allowDecimals={false} {...AXIS} width={44} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {series.length > 1 && <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SERIES[i]}
              stackId={stacked ? 'a' : undefined}
              stroke="#141416"
              strokeWidth={stacked && series.length > 1 ? 1 : 0}
              radius={i === series.length - 1 || !stacked ? [3, 3, 0, 0] : 0}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A horizontal proportion bar with a text label per part (identity never colour-only). */
export function RatioBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-sm text-zinc-600">No data</p>;
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts.filter((p) => p.value > 0).map((p, i) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color || SERIES[i] }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color || SERIES[i] }} aria-hidden />
            {p.label} <span className="tabular text-zinc-200">{p.value}</span>
            <span className="text-zinc-600">({Math.round((p.value / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
