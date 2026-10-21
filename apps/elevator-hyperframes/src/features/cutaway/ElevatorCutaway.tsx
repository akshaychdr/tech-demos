import { useEffect, useMemo, useState } from 'react'
import {
  computeElevatorParams,
  FLOOR_HEIGHT_M,
  formatTravelTime,
} from '@/lib/elevatorPhysics'

type Props = {
  floors: number
  speedMps: number
  loadKg: number
  playing?: boolean
}

export function ElevatorCutaway({ floors, speedMps, loadKg, playing = true }: Props) {
  const params = useMemo(
    () => computeElevatorParams(floors, speedMps, loadKg),
    [floors, speedMps, loadKg],
  )

  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!playing) return
    let start = performance.now()
    const loop = () => {
      const elapsed = (performance.now() - start) / 1000
      const cycle = 14 + Math.min(10, Math.max(4, params.travelTimeS))
      setPhase((elapsed % cycle) / cycle)
      requestAnimationFrame(loop)
    }
    const id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [playing, params.travelTimeS])

  const travelFrac = phase > 0.45 && phase < 0.75 ? (phase - 0.45) / 0.3 : phase >= 0.75 ? 1 : 0
  const carY = 380 - travelFrac * 180
  const cwY = 120 + travelFrac * 180
  const safety = phase > 0.82

  return (
    <div className="relative aspect-[12/7] w-full overflow-hidden rounded-lg border border-border bg-[#0c1118]">
      <svg viewBox="0 0 1200 700" className="h-full w-full">
        <rect x="0" y="0" width="1200" height="120" fill="#334155" rx="4" />
        <text x="24" y="36" fill="#e2e8f0" className="text-[18px] font-semibold">
          Machine room
        </text>
        <circle cx="600" cy="70" r="36" fill="#64748b" stroke="#cbd5e1" strokeWidth="3" />
        <rect x="720" y="40" width="120" height="60" rx="6" fill="#475569" />
        <text x="780" y="78" textAnchor="middle" fill="#f1f5f9" className="text-[18px] font-semibold">
          Motor
        </text>
        <rect x="860" y="48" width="70" height="44" rx="4" fill="#b45309" />
        <text x="895" y="76" textAnchor="middle" fill="#fff" className="text-[18px] font-semibold">
          Brake
        </text>

        <rect x="180" y="120" width="40" height="560" fill="#1e293b" stroke="#475569" strokeWidth="2" />
        <rect x="980" y="120" width="40" height="560" fill="#1e293b" stroke="#475569" strokeWidth="2" />

        <line x1="600" y1="106" x2="420" y2={280 - (380 - carY)} stroke="#94a3b8" strokeWidth="4" />
        <line x1="600" y1="106" x2="480" y2={280 - (380 - carY)} stroke="#94a3b8" strokeWidth="4" />
        <line x1="600" y1="106" x2="540" y2={280 - (380 - carY)} stroke="#94a3b8" strokeWidth="4" />
        <line x1="600" y1="106" x2="660" y2={280 - (380 - carY)} stroke="#94a3b8" strokeWidth="4" />
        <line x1="600" y1="106" x2="720" y2={280 - (380 - carY)} stroke="#94a3b8" strokeWidth="4" />
        <line x1="600" y1="106" x2="780" y2={280 - (380 - carY)} stroke="#94a3b8" strokeWidth="4" />

        <g transform={`translate(0, ${carY})`}>
          <rect x="260" y="0" width="200" height="140" rx="6" fill="#2563eb" />
          <text x="360" y="78" textAnchor="middle" fill="#fff" className="text-[18px] font-semibold">
            Car
          </text>
          <text x="360" y="110" textAnchor="middle" fill="#dbeafe" className="text-[15px]">
            {params.carWithLoadKg.toFixed(0)} kg
          </text>
        </g>

        <g transform={`translate(0, ${cwY})`}>
          <rect x="760" y="0" width="120" height="200" rx="4" fill="#64748b" />
          <text x="820" y="100" textAnchor="middle" fill="#f8fafc" className="text-[18px] font-semibold">
            CW
          </text>
          <text x="820" y="130" textAnchor="middle" fill="#64748b" className="text-[15px]">
            {params.counterweightKg.toFixed(0)} kg
          </text>
        </g>

        {safety && (
          <>
            <rect x="1000" y="200" width="24" height="80" fill="#dc2626" rx="2" />
            <rect x="188" y={carY + 20} width="24" height="50" fill="#f59e0b" />
            <rect x="988" y={carY + 20} width="24" height="50" fill="#f59e0b" />
          </>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0c1118] to-transparent p-3 text-xs text-muted-foreground">
        {params.travelM.toFixed(0)} m travel · {formatTravelTime(params.travelTimeS)} one-way · floor
        height {FLOOR_HEIGHT_M} m (simplified)
      </div>
    </div>
  )
}
