import { CODE_THEME_NAMES, CODE_THEMES, themed } from '@/lib/code-theme'
import { createHighlighter } from 'shiki'
import { CodeFrame, CodeLine } from './code-frame'

const highlighter = createHighlighter({
  langs: ['tsx'],
  themes: [CODE_THEMES.light, CODE_THEMES.dark]
})

export async function CodeBlock({ code }: { code: string }) {
  const { tokens } = (await highlighter).codeToTokens(code, {
    defaultColor: false,
    lang: 'tsx',
    themes: CODE_THEME_NAMES
  })

  return (
    <CodeFrame text={code}>
      {tokens.map((line, index) => (
        <CodeLine key={`${index}:${line.map(({ content }) => content).join('')}`}>
          {line.length === 0
            ? ' '
            : line.map(({ content, htmlStyle, offset }) => {
                const { '--shiki-dark': dark = 'inherit', '--shiki-light': light = 'inherit' } = htmlStyle ?? {}
                return (
                  <span key={offset} style={themed(light, dark)}>
                    {content}
                  </span>
                )
              })}
        </CodeLine>
      ))}
    </CodeFrame>
  )
}
