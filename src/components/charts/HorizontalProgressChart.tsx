import { BarChart, Bar, XAxis, YAxis, Cell, LabelList, ResponsiveContainer, Rectangle } from 'recharts'
import type { BarShapeProps } from 'recharts'

interface ProgressItem {
  label: string
  value: number
  color: string
}

const MIN_BAR_PX = 3

// Recharts computes bar width purely from the data value; a 0% (or near-0%)
// value would otherwise render an invisible sliver. Force a minimum pixel
// width so the bar — and its color — stays visible/inspectable at 0%.
function minWidthShape(props: BarShapeProps) {
  const width = Math.max(props.width ?? 0, MIN_BAR_PX)
  return <Rectangle {...props} width={width} />
}

export function HorizontalProgressChart({
  data, ariaLabel, height,
}: { data: ProgressItem[]; ariaLabel: string; height?: number }) {
  const chartHeight = height ?? data.length * 40 + 20

  return (
    <div role="img" aria-label={ariaLabel}>
      <div style={{ width: '100%', height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false} shape={minWidthShape}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              <LabelList dataKey="value" position="right" formatter={(v: React.ReactNode) => `${v}%`} style={{ fontSize: 12, fill: '#374151', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only">
        {data.map(d => <li key={d.label}>{d.label}: {d.value}%</li>)}
      </ul>
    </div>
  )
}
