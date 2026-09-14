import { createScope } from 'octane/signals'
import { useSignal$ } from 'octane/signals/client'

// Shared state lives outside the component. Derived values track their reads.
const scope = createScope({ scopeKey: 'playground-signals' })
const shared$ = scope.signal$('count', 0)
const doubled$ = scope.derived$('doubled', () => shared$.get() * 2)

export default function App() {
  // Each component instance owns its local signal, disposed on unmount.
  const local$ = useSignal$(10)

  return (
    <div style={{ display: 'grid', gap: '1rem', justifyItems: 'start' }}>
      <section>
        <h2>Shared signal</h2>
        <button onClick={() => shared$.set((count) => count + 1)}>{'Shared: ' + shared$.get()}</button>
        <p>{'Doubled: ' + doubled$.get()}</p>
      </section>
      <section>
        <h2>Local signal</h2>
        <button onClick={() => local$.set((count) => count + 1)}>{'Local: ' + local$.get()}</button>
      </section>
    </div>
  )
}
