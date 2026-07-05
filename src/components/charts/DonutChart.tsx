import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface DonutItem {
  label: string
  value: number
  color: string
}

export function DonutChart({
  data, ariaLabel, centerLabel,
}: { data: DonutItem[]; ariaLabel: string; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex items-center gap-5" role="img" aria-label={ariaLabel}>
      <div className="relative shrink-0" style={{ width: 144, height: 144 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="65%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-gray-900">{total}</span>
            <span className="text-[11px] text-gray-400 text-center leading-tight">{centerLabel}</span>
          </div>
        )}
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map(d => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-gray-600">{d.label}</span>
            <span className="font-semibold text-gray-900">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
