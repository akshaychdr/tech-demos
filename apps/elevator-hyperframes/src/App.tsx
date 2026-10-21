import { useCallback, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { ElevatorCutaway } from '@/features/cutaway/ElevatorCutaway'
import {
  computeElevatorParams,
  COUNTERWEIGHT_LOAD_FRACTION,
  FLOOR_HEIGHT_M,
  formatTravelTime,
} from '@/lib/elevatorPhysics'

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8787' : ''

export default function App() {
  const [floors, setFloors] = useState(12)
  const [speedMps, setSpeedMps] = useState(1.75)
  const [loadKg, setLoadKg] = useState(200)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const params = computeElevatorParams(floors, speedMps, loadKg)

  const handleRender = useCallback(async () => {
    setRendering(true)
    setRenderError(null)
    try {
      const res = await fetch(`${API_BASE}/api/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floors, speedMps, loadKg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Render failed')
      setVideoUrl(`${API_BASE}${data.url}`)
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : String(e))
    } finally {
      setRendering(false)
    }
  }, [floors, speedMps, loadKg])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">Elevator HyperFrames</h1>
            <p className="text-sm text-muted-foreground">
              Traction elevator explainer — live HTML cutaway + HyperFrames MP4 render
            </p>
          </div>
          <Badge variant="secondary">HeyGen HyperFrames</Badge>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Building & car</CardTitle>
            <CardDescription>Numbers drive captions and travel timing in the exported video.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Floors</Label>
                <span className="text-sm tabular-nums text-muted-foreground">{floors}</span>
              </div>
              <Slider
                min={3}
                max={40}
                step={1}
                value={[floors]}
                onValueChange={(v) => setFloors(v[0] ?? 12)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Car speed (m/s)</Label>
                <span className="text-sm tabular-nums text-muted-foreground">{speedMps.toFixed(2)}</span>
              </div>
              <Slider
                min={0.5}
                max={4}
                step={0.05}
                value={[speedMps]}
                onValueChange={(v) => setSpeedMps(v[0] ?? 1.75)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Passenger load (kg)</Label>
                <span className="text-sm tabular-nums text-muted-foreground">{loadKg}</span>
              </div>
              <Slider
                min={0}
                max={800}
                step={10}
                value={[loadKg]}
                onValueChange={(v) => setLoadKg(v[0] ?? 0)}
              />
            </div>

            <dl className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Shaft travel</dt>
                <dd className="tabular-nums font-medium">{params.travelM.toFixed(0)} m</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">One-way time</dt>
                <dd className="tabular-nums font-medium">{formatTravelTime(params.travelTimeS)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Counterweight (illustrative)</dt>
                <dd className="tabular-nums font-medium">{params.counterweightKg.toFixed(0)} kg</dd>
              </div>
            </dl>

            <p className="text-xs text-muted-foreground">
              Simplifications: {FLOOR_HEIGHT_M} m per floor; counterweight sized for empty car +
              {(COUNTERWEIGHT_LOAD_FRACTION * 100).toFixed(0)}% of rated load (not live passenger
              weight).
            </p>

            <Button
              className="w-full"
              onClick={handleRender}
              disabled={rendering}
              data-testid="render-video"
            >
              {rendering ? 'Rendering with HyperFrames…' : 'Render video'}
            </Button>
            {renderError && <p className="text-sm text-destructive">{renderError}</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live cutaway preview</CardTitle>
              <CardDescription>HTML/SVG preview — export uses the HyperFrames composition.</CardDescription>
            </CardHeader>
            <CardContent>
              <ElevatorCutaway floors={floors} speedMps={speedMps} loadKg={loadKg} />
            </CardContent>
          </Card>

          {videoUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Rendered MP4</CardTitle>
                <CardDescription>Encoded locally via `npx hyperframes render`.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <video src={videoUrl} controls className="w-full rounded-lg border border-border" />
                <Button variant="outline" asChild>
                  <a href={videoUrl} download>Download MP4</a>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
