import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Selective collective elevator
            </h1>
            <p className="text-sm text-muted-foreground">
              Phase 1 — HyperFrames composition & storyboard stills (see{' '}
              <code className="text-xs">STORYBOARD.md</code>)
            </p>
          </div>
          <Badge variant="secondary">HyperFrames</Badge>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Composition in progress</CardTitle>
            <CardDescription>
              Premium reel lives in <code>composition/index.html</code>. Interactive app and full
              60&nbsp;fps render land in Phase&nbsp;2 after still approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Preview locally:{' '}
            <code className="text-foreground">npx hyperframes preview composition</code>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
