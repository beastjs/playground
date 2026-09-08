/**
 * TSX sources used to seed the converter playground.
 *
 * These are plain strings rather than real `.tsx` modules on purpose: they
 * reference components that do not exist here (`AdminPanel`) and exist only to
 * be fed to `convertTsxToBtsx`, so compiling them would fail typecheck for no
 * benefit. `docs/provider.expected.btsx` holds the expected output of the
 * "provider" sample and doubles as the converter's reference fixture.
 */

export interface Sample {
  id: string
  label: string
  tsx: string
}

const card = `export function Card({
  user,
  unreadCount,
  messages
}: {
  user: { name: string; id: string; isAdmin: boolean }
  unreadCount: number
  messages: { id: string; text: string }[]
}) {
  return (
    <div className='card'>
      <div className='header'>
        <h1>Welcome, {user.name}</h1>
      </div>
      <div className='body'>
        {user.isAdmin ? <AdminPanel userId={user.id} /> : <p>You have {unreadCount} new messages</p>}
        <ul className='messages'>
          {messages.map((message, i) => (
            <li className='message' key={message.id}>
              {message.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
`

const provider = `// PROVIDER
import { createContext, type ReactNode, use, useContext } from 'react'

type ThemeName = 'light' | 'dark'

interface ProviderProps {
  theme: ThemeName
  children: ReactNode
}

const Theme = createContext<ThemeName>('light')

function ThemeLabel() {
  const theme = use(Theme)
  return <p className='theme-label'>{'Current theme: ' + theme}</p>
}

function ThemeSwatch() {
  const theme = useContext(Theme)
  return <span aria-label={'Theme swatch: ' + theme} data-theme={theme} />
}

export default function Provider({ theme, children }: ProviderProps) {
  return (
    <Theme.Provider value={theme}>
      <section className='theme-shell' data-theme={theme}>
        <ThemeLabel />
        <ThemeSwatch />
        {children}
      </section>
    </Theme.Provider>
  )
}
`

const dashboard = `// DASHBOARD
import { useMemo, type ReactNode } from 'react'

type Range = '24h' | '7d' | '30d'

interface Metric {
  id: string
  label: string
  value: number
  delta: number
}

export default function Dashboard({ metrics, range, onRangeChange }: { metrics: Metric[]; range: Range; onRangeChange: (next: Range) => void }) {
  const ranges: Range[] = ['24h', '7d', '30d']
  const total = useMemo(() => metrics.reduce((sum, m) => sum + m.value, 0), [metrics])

  return (
    <main id='dashboard' className='shell'>
      <header className='flex items-center justify-between gap-6 border-b border-black/10 px-6 py-4'>
        <h1 id='dashboard-title' className='title'>Overview</h1>
        <nav role='tablist' aria-label='Time range' className='inline-flex items-center rounded-full bg-neutral-100 p-1'>
          {ranges.map((r) => (
            <button
              key={r}
              type='button'
              role='tab'
              aria-selected={r === range}
              onClick={() => onRangeChange(r)}
              className={r === range ? 'rounded-full bg-white px-4 py-2 text-sm' : 'text-neutral-500'}
            >
              {r}
            </button>
          ))}
        </nav>
      </header>
      <section className='grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4'>
        {metrics.map((metric) => (
          <article key={metric.id} className='rounded-2xl border border-black/10 bg-white p-5'>
            <p className='eyebrow'>{metric.label}</p>
            <strong className='value'>{metric.value}</strong>
            {metric.delta > 0 ? <span className='up'>+{metric.delta}%</span> : metric.delta < 0 ? <span className='down'>{metric.delta}%</span> : <span className='flat'>flat</span>}
          </article>
        ))}
      </section>
      {metrics.length === 0 && <p className='empty'>No metrics for this range.</p>}
      <footer className='total'>Total: {total}</footer>
    </main>
  )
}
`

const palette = `// COMMAND PALETTE
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

interface Command {
  id: string
  title: string
  group: string
  shortcut?: string
  disabled?: boolean
}

export function CommandPalette({ commands, recent, onRun }: { commands: Command[]; recent: string[]; onRun: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => commands.filter((command) => command.title.toLowerCase().includes(query.toLowerCase())), [commands, query])
  const groups = useMemo(() => [...new Set(matches.map((command) => command.group))], [matches])
  const run = useCallback((command: Command) => {
    if (command.disabled) return
    onRun(command.id)
  }, [onRun])

  return (
    <div id='palette' role='dialog' aria-modal='true' aria-labelledby='palette-label' className='fixed inset-0 z-50 grid place-items-start p-4'>
      <div className='w-full max-w-xl rounded-sm bg-neutral-900 text-neutral-100'>
        <label id='palette-label' className='sr-only'>Run a command</label>
        <input
          ref={inputRef}
          type='search'
          value={query}
          placeholder='Type a command...'
          autoFocus
          aria-controls='palette-results'
          onInput={(event) => setQuery(event.currentTarget.value)}
          className='w-full bg-transparent px-5 py-4 text-base outline-none'
        />
        <div id='palette-results' role='listbox' className='max-h-80 overflow-auto py-2'>
          {groups.map((group) => (
            <section key={group} className='py-1'>
              <h2 className='p-2 font-bold uppercase text-neutral-500'>{group}</h2>
              {matches.filter((command) => command.group === group).map((command, index) => (
                <button
                  key={command.id}
                  type='button'
                  role='option'
                  aria-selected={index === cursor}
                  aria-disabled={command.disabled}
                  onClick={() => run(command)}
                  onMouseEnter={() => setCursor(index)}
                  className={index === cursor ? 'grid place-items-center gap-4 bg-white/10 p-2' : 'p-5 text-neutral-300'}
                >
                  <span>{command.title}</span>
                  {command.shortcut && <kbd className='rounded border border-white/15 p-1'>{command.shortcut}</kbd>}
                </button>
              ))}
            </section>
          ))}
          {matches.length === 0 && <p className='px-5 py-8 text-center text-sm text-neutral-500'>No commands match "{query}"</p>}
        </div>
        <footer className='flex items-center justify-between p-3 text-neutral-500'>
          <span>{matches.length} of {commands.length}</span>
          <span>Recent: {recent.length}</span>
        </footer>
      </div>
    </div>
  )
}
`

const feed = `// FEED
import { createContext, use, useState, type ReactNode } from 'react'

type Status = 'idle' | 'loading' | 'error'

interface Post {
  id: string
  author: { name: string; avatar: string }
  body: string
  tags: string[]
  likes: number
}

const Locale = createContext<string>('en')

function Avatar({ user }: { user: Post['author'] }) {
  return <img className='avatar' src={user.avatar} alt={user.name} loading='lazy' />
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <ul className='tags'>
      {tags.map((tag) => (
        <li key={tag} className='tag'>#{tag}</li>
      ))}
    </ul>
  )
}

const Empty = () => <p className='empty'>Nothing to read yet.</p>

export default function Feed({ posts, status, onRetry }: { posts: Post[]; status: Status; onRetry: () => void }) {
  const locale = use(Locale)
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <section id='feed' className='feed' aria-busy={status === 'loading'} lang={locale}>
      {status === 'loading' ? (
        <p className='skeleton'>Loading...</p>
      ) : status === 'error' ? (
        <div className='error' role='alert'>
          <p>Something went wrong.</p>
          <button type='button' onClick={onRetry}>Retry</button>
        </div>
      ) : posts.length === 0 ? (
        <Empty />
      ) : (
        <ol className='posts'>
          {posts.map((post) => (
            <li key={post.id} className='post'>
              <Avatar user={post.author} />
              <h3 className='author'>{post.author.name}</h3>
              <p className='body'>{expanded === post.id ? post.body : post.body.slice(0, 140)}</p>
              <Tags tags={post.tags} />
              <footer className='meta'>
                <button type='button' aria-expanded={expanded === post.id} onClick={() => setExpanded(expanded === post.id ? null : post.id)}>
                  {expanded === post.id ? 'Show less' : 'Show more'}
                </button>
                <span className='likes'>{post.likes} likes</span>
              </footer>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
`

export const SAMPLES: Sample[] = [
  { id: 'card', label: 'Card', tsx: card },
  { id: 'provider', label: 'Provider', tsx: provider },
  { id: 'dashboard', label: 'Dashboard', tsx: dashboard },
  { id: 'palette', label: 'Palette', tsx: palette },
  { id: 'feed', label: 'Feed', tsx: feed }
]
