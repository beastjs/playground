import { createHighlighter, type Highlighter, type LanguageRegistration } from 'shiki'
import btsxGrammar from './btsx.tmLanguage.json'

let highlighterPromise: Promise<Highlighter> | null = null

// tsrx is TSX + Octane directives (@if, @for, @switch, @try etc)
// We register a tiny wrapper that includes tsx plus extra keywords.
const tsrxGrammar = {
  scopeName: 'source.tsrx',
  name: 'TSRX',
  fileTypes: ['tsrx'],
  patterns: [
    { include: '#octaneDirective' },
    { include: 'source.tsx' }
  ],
  repository: {
    octaneDirective: {
      name: 'keyword.control.octane.tsrx',
      match: '@\\b(if|else|for|empty|switch|case|default|try|pending|catch)\\b'
    }
  }
} as unknown as { scopeName: string; patterns: unknown[] }

// Shiki expects a LanguageRegistration: the TextMate grammar's own fields at the
// top level, not nested under a `grammar` key. Nesting it registers a language
// with no patterns, which loads fine and highlights nothing.
const btsxLang = {
  ...(btsxGrammar as Record<string, unknown>),
  name: 'btsx',
  scopeName: 'source.btsx',
  aliases: ['beast']
} as unknown as LanguageRegistration

const tsrxLang = {
  ...tsrxGrammar,
  name: 'tsrx',
  scopeName: 'source.tsrx'
} as unknown as LanguageRegistration

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      // `btsx` embeds source.ts and `tsrx` embeds source.tsx, so both bases
      // have to be loaded for the embedded scopes to resolve.
      langs: ['typescript', 'tsx', btsxLang, tsrxLang]
    })
  }
  return highlighterPromise
}

/** Highlights `code`, falling back to escaped plain text if the language is unknown. */
export async function highlight(code: string, lang: string, theme: string): Promise<string> {
  const hl = await getHighlighter()
  const resolved = normalizeLanguage(lang)
  const known = hl.getLoadedLanguages().includes(resolved)
  return hl.codeToHtml(code, { lang: known ? resolved : 'text', theme })
}

export function normalizeLanguage(lang?: string): string {
  if (!lang) return 'text'
  const l = lang.toLowerCase()
  if (l === 'btsx' || l === 'beast') return 'btsx'
  if (l === 'tsrx') return 'tsrx'
  if (l === 'shell' || l === 'bash' || l === 'sh') return 'bash'
  if (l === 'js' || l === 'javascript') return 'javascript'
  if (l === 'ts' || l === 'typescript') return 'typescript'
  if (l === 'tsx') return 'tsx'
  if (l === 'css') return 'css'
  if (l === 'json') return 'json'
  return l
}
