import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'

// Register base languages
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('js', typescript)
hljs.registerLanguage('javascript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sh', bash)

// Beast BTSX — derived from beast.ext/languages/beast/highlights.scm + injections.scm
// Keywords match Zed: import module component props setup if elseif else each in key empty switch case default try pending catch
hljs.registerLanguage('btsx', () => ({
  name: 'BTSX',
  case_insensitive: false,
  keywords: {
    keyword: 'import module component props setup if elseif else each in key empty switch case default try pending catch',
    built_in: 'use useContext createContext'
  },
  contains: [
    hljs.COMMENT('//', '$'),
    // Strings — double and single quoted
    {
      className: 'string',
      begin: '"',
      end: '"',
      contains: [{ begin: '\\\\.' }]
    },
    {
      className: 'string',
      begin: "'",
      end: "'",
      contains: [{ begin: '\\\\.' }]
    },
    // Interpolations #{ ... } — highlight inside as TypeScript
    {
      begin: '#\\{',
      end: '\\}',
      subLanguage: 'typescript',
      contains: []
    },
    // Expressions { ... } — attribute values
    {
      begin: '\\{',
      end: '\\}',
      subLanguage: 'typescript',
      contains: []
    },
    // Punctuation for pipe text
    {
      className: 'punctuation',
      begin: '^\\s*\\|'
    },
    // Component names — Capitalized, not keywords
    {
      className: 'title.class',
      begin: '\\b[A-Z][A-Za-z0-9_]*\\b',
      relevance: 0
    },
    // Tag names — lowercase, exclude keywords via negative lookahead
    {
      className: 'tag',
      begin: '\\b(?!import|module|component|props|setup|if|elseif|else|each|in|key|empty|switch|case|default|try|pending|catch\\b)[a-z][a-z0-9-]*\\b',
      relevance: 0
    },
    // Class and id selectors
    {
      className: 'attr',
      begin: '\\.[A-Za-z0-9_-]+'
    },
    {
      className: 'attr',
      begin: '#[A-Za-z0-9_-]+'
    },
    // Attribute names before =
    {
      className: 'attr',
      begin: '\\b[A-Za-z_][A-Za-z0-9_-]*\\b(?=\\s*=)'
    }
  ]
}))

// TSRX — TSX + Octane directives @if, @for, @empty, @switch, @case, @default, @try, @pending, @catch
hljs.registerLanguage('tsrx', (hljsInstance: any) => {
  const base = (typescript as any)(hljsInstance)
  return {
    ...base,
    name: 'TSRX',
    aliases: ['tsrx'],
    contains: [
      {
        className: 'keyword',
        begin: '@\\b(if|else|for|empty|switch|case|default|try|pending|catch)\\b'
      },
      ...(base.contains || [])
    ]
  }
})

export default hljs
