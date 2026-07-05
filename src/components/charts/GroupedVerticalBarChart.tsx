import { BarChart, Bar, XAxis, YAxis, LabelList, ResponsiveContainer, Rectangle } from 'recharts'
import type { BarShapeProps } from 'recharts'

interface GroupedItem {
  label: string
  enviados: number
  total: number
}

const COLOR_ENVIADOS = '#0E7C86'
const COLOR_TOTAL = '#d1d5db'
const MIN_BAR_PX = 3

// Bars grow upward from the baseline (y + height = baseline). Enforcing a
// minimum height also means nudging y up so the bar still sits on the
// baseline instead of floating — this keeps a 0-value bar visible/inspectable
// instead of collapsing to nothing.
function minHeightShape(props: BarShapeProps) {
  const height = Math.max(props.height ?? 0, MIN_BAR_PX)
  const y = (props.y ?? 0) + (props.height ?? 0) - height
  return <Rectangle {...props} y={y} height={height} />
}

export function GroupedVerticalBarChart({
  data, ariaLabel,
}: { data: GroupedItem[]; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel}>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 4, left: 4 }} barGap={4} barCategoryGap="28%">
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Bar dataKey="total" fill={COLOR_TOTAL} radius={[4, 4, 0, 0]} barSize={18} isAnimationActive={false} shape={minHeightShape}>
              <LabelList dataKey="total" position="top" style={{ fontSize: 11, fill: '#9ca3af' }} />
            </Bar>
            <Bar dataKey="enviados" fill={COLOR_ENVIADOS} radius={[4, 4, 0, 0]} barSize={18} isAnimationActive={false} shape={minHeightShape}>
              <LabelList dataKey="enviados" position="top" style={{ fontSize: 11, fill: '#0E7C86', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 justify-center mt-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_ENVIADOS }} /> Enviados em dia</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_TOTAL }} /> Total de membros</span>
      </div>
      <ul className="sr-only">
        {data.map(d => <li key={d.label}>{d.label}: {d.enviados} de {d.total} membros enviaram em dia</li>)}
      </ul>
    </div>
  )
}
