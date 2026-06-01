import { useLocation, Link } from 'react-router-dom'
import ChatPanel from './ChatPanel'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/inventory/add', label: 'Add Phone' },
  { to: '/sales', label: 'Sales' },
  { to: '/atlas', label: 'Atlas Prices' },
]

export default function Layout({ children, chatOpen, onToggleChat }) {
  const location = useLocation()
  const chatButtonClass = 'app-button w-full ' + (chatOpen ? 'app-button-primary' : 'app-button-secondary')
  const mainInnerClass = 'app-main-inner ' + (chatOpen ? 'xl:pr-[26rem]' : '')

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <h1 className="app-sidebar-title">Phone Flip</h1>
          <p className="app-sidebar-subtitle">Inventory, margins, and Atlas pricing in one place.</p>
        </div>

        <div className="app-sidebar-footer">
          <button onClick={onToggleChat} className={chatButtonClass}>
            {chatOpen ? 'Close chat' : 'Open chat'}
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className={mainInnerClass}>
          <div className="mb-6 flex flex-wrap gap-2 rounded-3xl border border-slate-200/70 bg-white/85 p-3 shadow-sm backdrop-blur">
            {NAV.map(({ to, label }) => {
              const active = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  data-active={active}
                  className={
                    'rounded-full border px-4 py-2 text-sm font-medium transition ' +
                    (active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')
                  }
                >
                  {label}
                </Link>
              )
            })}
          </div>
          {children}
        </div>
      </main>

      {chatOpen && (
        <div className="app-chat fixed right-0 top-0 z-20 h-[100dvh]">
          <ChatPanel onClose={onToggleChat} />
        </div>
      )}
    </div>
  )
}
