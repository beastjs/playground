import type { ClassValue } from 'octane'
import type { ConversionDiagnostic } from '@/lib/tsx-btsx.ts'
import type { Metrics } from '@/lib/metrics'

export type PanelId = 'tsx' | 'btsx' | 'tsrx'

/** Which of the three desktop panels are shown. At least one always is. */
export type PanelVisibility = Record<PanelId, boolean>

/** Which panel's copy button last fired, so only that one shows "Copied". */
export type PanelSide = 'left' | 'right' | 'tsrx'

export interface Result {
  ok: boolean
  output: string
  diagnostics?: readonly ConversionDiagnostic[]
}

/** A pass/fail badge beside a panel's title, with the reason when it failed. */
export interface PanelCheck {
  ok: boolean
  label: string
  detail: string | null
}

export interface SourcePanelProps {
  source: string
  metrics: Metrics
  copied: boolean
  pasteBlocked: boolean
  onCopy: () => void
  onPaste: () => void
  onEdit: (event: Event) => void
}

export interface OutputPanelProps {
  eyebrow: string
  title: string
  lang: 'btsx' | 'tsrx'
  result: Result
  metrics: Metrics
  reduction: string | null
  copied: boolean
  onCopy: () => void
  check?: PanelCheck | null
  className?: ClassValue
}

/** Everything the three panels need; each layout arranges them its own way. */
export interface WorkspacePanels {
  source: SourcePanelProps
  btsx: OutputPanelProps
  tsrx: OutputPanelProps
}
