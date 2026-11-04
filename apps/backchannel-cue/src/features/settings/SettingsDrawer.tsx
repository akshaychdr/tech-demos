import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { defaultSettings, type PolicySettings } from "@/lib/policy"
import { SlidersHorizontal } from "lucide-react"

const FIELDS: {
  key: keyof PolicySettings
  label: string
  hint: string
  min: number
  max: number
  step: number
  digits: number
}[] = [
  { key: "clauseGateBar", label: "Clause-end gate", hint: "Card rule: 0.09.", min: 0.02, max: 0.3, step: 0.005, digits: 3 },
  { key: "openGateBar", label: "Mid-sentence gate", hint: "Unfinished clauses score lower.", min: 0.005, max: 0.08, step: 0.001, digits: 3 },
  { key: "echoBar", label: "Echo bar", hint: "Ask-back only at or above this.", min: 0.4, max: 0.95, step: 0.05, digits: 2 },
  { key: "minSpacingSec", label: "Seconds between cues", hint: "Card rule: at least 6.", min: 2, max: 12, step: 0.5, digits: 1 },
  { key: "maxCuesPerMinute", label: "Cues per minute", hint: "Raised so a long story can answer every pause. The card suggests about 4.", min: 1, max: 16, step: 1, digits: 0 },
  { key: "badMoodBlock", label: "Bad-mood block", hint: "No laugh, praise, or wow above this bad score.", min: 0.1, max: 0.8, step: 0.05, digits: 2 },
  { key: "pauseDelaySec", label: "Pause before scoring", hint: "Call the model this far into the silence.", min: 0.2, max: 1, step: 0.05, digits: 2 },
]

export function SettingsDrawer({
  settings,
  onChange,
}: {
  settings: PolicySettings
  onChange: (next: PolicySettings) => void
}) {
  return (
    <Sheet>
      <SheetTrigger
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
      >
        <SlidersHorizontal className="size-3.5" />
        Thresholds
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">Thresholds</SheetTitle>
          <SheetDescription>
            The model’s raw scores are not a policy. These are the gates the listener actually uses.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-4">
          {FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span>{field.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {settings[field.key].toFixed(field.digits)}
                </span>
              </span>
              <Slider
                className="mt-2"
                min={field.min}
                max={field.max}
                step={field.step}
                value={[settings[field.key]]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value
                  if (typeof next !== "number") return
                  onChange({ ...settings, [field.key]: next })
                }}
              />
              <span className="mt-1 block text-xs text-muted-foreground">{field.hint}</span>
            </label>
          ))}
          <Button variant="outline" onClick={() => onChange(defaultSettings)}>
            Reset to demo defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
