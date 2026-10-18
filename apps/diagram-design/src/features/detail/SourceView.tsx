import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SourceView({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const area = document.createElement("textarea")
      area.value = code
      document.body.appendChild(area)
      area.select()
      document.execCommand("copy")
      area.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="relative rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">
          {label} · {code.split("\n").length} lines
        </span>
        <Button variant="outline" size="sm" onClick={copy} data-testid="copy-source">
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className="max-h-[70vh] overflow-auto p-4 font-mono text-xs leading-relaxed"
        data-testid="source-code"
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}
