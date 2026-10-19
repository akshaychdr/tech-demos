import { useCallback, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

type RunKind = 'baseline' | 'airllm'

type MemoryPoint = { t_s: number; baseline?: number; airllm?: number }

type RunStats = {
  success?: boolean
  peakRssMb?: number
  tokensPerSec?: number
  totalS?: number
  output?: string
  error?: string
  exitCode?: number
}

type LayerCell = { index: number; label: string; phase: 'idle' | 'load' | 'run' | 'free' }

const DEFAULT_PROMPT = 'The capital of France is'
const LAYER_COUNT = 27

function _layerLabel(layerName: string): string {
  if (layerName.includes('embed')) return 'embed'
  if (layerName.endsWith('norm')) return 'norm'
  if (layerName.includes('lm_head')) return 'head'
  const m = layerName.match(/layers\.(\d+)/)
  return m ? m[1] : layerName
}

function layerPhaseClass(phase: LayerCell['phase']) {
  if (phase === 'load') return 'bg-amber-400/80'
  if (phase === 'run') return 'bg-emerald-500'
  if (phase === 'free') return 'bg-sky-400/60'
  return 'bg-muted'
}

export default function App() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [memoryCapMb, setMemoryCapMb] = useState(3800)
  const [compression, setCompression] = useState('none')
  const [running, setRunning] = useState(false)
  const [memorySeries, setMemorySeries] = useState<MemoryPoint[]>([])
  const [layers, setLayers] = useState<LayerCell[]>(
    Array.from({ length: LAYER_COUNT }, (_, i) => ({
      index: i,
      label: i === 0 ? 'embed' : i === LAYER_COUNT - 2 ? 'norm' : i === LAYER_COUNT - 1 ? 'head' : String(i - 1),
      phase: 'idle' as const,
    })),
  )
  const [stats, setStats] = useState<Record<RunKind, RunStats>>({ baseline: {}, airllm: {} })
  const [activeRun, setActiveRun] = useState<RunKind | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const compressionHelp = useMemo(
    () =>
      'Block-wise 4-bit/8-bit compression needs bitsandbytes GPU kernels. This demo runs on CPU, so only None is enabled.',
    [],
  )

  const resetRunState = useCallback(() => {
    setMemorySeries([])
    setStats({ baseline: {}, airllm: {} })
    setLayers(
      Array.from({ length: LAYER_COUNT }, (_, i) => ({
        index: i,
        label: i === 0 ? 'embed' : i === LAYER_COUNT - 2 ? 'norm' : i === LAYER_COUNT - 1 ? 'head' : String(i - 1),
        phase: 'idle' as const,
      })),
    )
  }, [])

  const appendMemory = useCallback((run: RunKind, t_s: number, rss_mb: number) => {
    setMemorySeries((prev) => {
      const last = prev[prev.length - 1]
      if (last && Math.abs(last.t_s - t_s) < 0.001) {
        const merged = { ...last, [run]: rss_mb }
        return [...prev.slice(0, -1), merged]
      }
      const point: MemoryPoint = { t_s }
      point[run] = rss_mb
      return [...prev, point]
    })
  }, [])

  const startCompare = useCallback(() => {
    if (running) return
    esRef.current?.close()
    resetRunState()
    setRunning(true)

    const params = new URLSearchParams({
      prompt,
      memory_cap_mb: String(memoryCapMb),
      max_new_tokens: '24',
      compression,
    })
    const es = new EventSource(`/api/compare/stream?${params.toString()}`)
    esRef.current = es

    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as Record<string, unknown>
      const type = data.type as string
      const run = data.run as RunKind | undefined

      if (type === 'run_start' && run) {
        setActiveRun(run)
      }
      if (type === 'memory' && run && typeof data.rss_mb === 'number' && typeof data.t_s === 'number') {
        appendMemory(run, data.t_s, data.rss_mb)
      }
      if (type === 'meta' && run === 'airllm' && typeof data.layer_count === 'number') {
        const count = data.layer_count as number
        const names = (data.layer_names as string[]) ?? []
        setLayers(
          Array.from({ length: count }, (_, i) => ({
            index: i,
            label: _layerLabel(names[i] ?? String(i)),
            phase: 'idle' as const,
          })),
        )
      }
      if (type === 'layer' && run === 'airllm') {
        const index = data.index as number
        const phase = data.phase as LayerCell['phase']
        const label = (data.label as string) ?? String(index)
        setLayers((prev) =>
          prev.map((cell) => (cell.index === index ? { ...cell, label, phase } : cell)),
        )
      }
      if (type === 'result' && run) {
        setStats((prev) => ({
          ...prev,
          [run]: {
            ...prev[run],
            success: Boolean(data.success),
            output: (data.output_text as string) ?? '',
            tokensPerSec: data.tokens_per_sec as number,
            totalS: data.total_s as number,
            error: data.error as string | undefined,
          },
        }))
      }
      if (type === 'done' && run) {
        setStats((prev) => ({
          ...prev,
          [run]: { ...prev[run], peakRssMb: data.peak_rss_mb as number },
        }))
      }
      if (type === 'run_end' && run) {
        setStats((prev) => ({
          ...prev,
          [run]: { ...prev[run], exitCode: data.exit_code as number },
        }))
        if (run === 'airllm') setActiveRun(null)
      }
      if (type === 'all_done') {
        setRunning(false)
        setActiveRun(null)
        es.close()
      }
    }

    es.onerror = () => {
      setRunning(false)
      setActiveRun(null)
      es.close()
    }
  }, [appendMemory, compression, memoryCapMb, prompt, resetRunState, running])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">AirLLM memory budget demo</h1>
            <Badge variant="secondary">CPU · layer-wise inference</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Same prompt and hard <code className="text-xs">RLIMIT_AS</code> cap: a full{' '}
            <code className="text-xs">transformers</code> load usually dies while{' '}
            <a className="underline" href="https://github.com/lyogavin/airllm" rel="noreferrer" target="_blank">
              AirLLM
            </a>{' '}
            streams one layer at a time.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>Model: Qwen2.5-0.5B-Instruct (ungated)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <Label>Memory cap (RLIMIT_AS)</Label>
                <span className="font-mono text-muted-foreground">{memoryCapMb} MB</span>
              </div>
              <Slider
                min={2800}
                max={5200}
                step={100}
                value={[memoryCapMb]}
                onValueChange={(v) => setMemoryCapMb(v[0] ?? 3800)}
                disabled={running}
              />
              <p className="text-xs text-muted-foreground">
                Try ~3800 MB: baseline fails while AirLLM completes on this machine.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Layer compression</Label>
              <ToggleGroup
                type="single"
                value={compression}
                onValueChange={(v) => v && setCompression(v)}
                className="justify-start"
              >
                <ToggleGroupItem value="none" disabled={running}>None</ToggleGroupItem>
                <ToggleGroupItem value="8bit" disabled title={compressionHelp}>
                  8-bit
                </ToggleGroupItem>
                <ToggleGroupItem value="4bit" disabled title={compressionHelp}>
                  4-bit
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">{compressionHelp}</p>
            </div>
            <Button className="w-full" onClick={startCompare} disabled={running || !prompt.trim()}>
              {running ? 'Running comparison…' : 'Run side-by-side'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live RSS (worker process)</CardTitle>
              <CardDescription>
                {activeRun ? `Active: ${activeRun}` : running ? 'Waiting…' : 'Idle'}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={memorySeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="t_s" tickFormatter={(v) => `${v}s`} />
                  <YAxis unit=" MB" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="baseline" stroke="var(--color-chart-1)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="airllm" stroke="var(--color-chart-2)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AirLLM layer strip</CardTitle>
              <CardDescription>Load → run → free per streamed module</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-9 gap-1 sm:grid-cols-12 md:grid-cols-14">
                {layers.map((layer) => (
                  <div
                    key={layer.index}
                    title={`${layer.label} (${layer.phase})`}
                    className={cn(
                      'h-6 min-w-[10px] rounded-sm border border-border/60 transition-colors duration-150',
                      layerPhaseClass(layer.phase),
                      layer.phase === 'run' && 'ring-2 ring-emerald-700/50',
                    )}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {(['baseline', 'airllm'] as RunKind[]).map((run) => {
              const s = stats[run]
              const ok = s.success
              return (
                <Card key={run} className={run === 'baseline' ? 'border-destructive/30' : 'border-emerald-600/30'}>
                  <CardHeader>
                    <CardTitle className="capitalize">{run === 'baseline' ? 'Full transformers' : 'AirLLM'}</CardTitle>
                    <CardDescription>
                      {ok === true && <Badge className="mr-2">success</Badge>}
                      {ok === false && <Badge variant="destructive">failed / OOM</Badge>}
                      {s.peakRssMb != null && <span className="font-mono text-xs">peak {s.peakRssMb} MB</span>}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>Tokens/sec</div>
                      <div className="font-mono text-foreground">{s.tokensPerSec?.toFixed(2) ?? '—'}</div>
                      <div>Total time</div>
                      <div className="font-mono text-foreground">{s.totalS != null ? `${s.totalS}s` : '—'}</div>
                    </div>
                    {s.error && <p className="text-xs text-destructive">{s.error}</p>}
                    <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                      {s.output || (running && activeRun === run ? '…' : '—')}
                    </pre>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
