import { useState, useEffect } from 'react'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export default function Settings() {
  const [stats, setStats] = useState(null)
  const [atlasStatus, setAtlasStatus] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then(setStats)
  }, [])

  async function triggerSync() {
    setSyncing(true)
    setAtlasStatus('Syncing...')
    try {
      const r = await fetch('/api/atlas/sync', { method: 'POST' })
      const data = await r.json()
      if (r.ok) {
        setAtlasStatus('Synced ' + data.count + ' prices from ' + (data.tabs_synced || []).join(', '))
      } else {
        setAtlasStatus('Error: ' + (data.detail || data.error || 'unknown error'))
      }
    } catch (error) {
      setAtlasStatus('Failed: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="page-stack max-w-4xl">
      <section className="surface surface-strong p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">System</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Settings</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Sync Atlas pricing, review database totals, and keep the app aligned with the local stack.
        </p>
      </section>

      <section className="panel">
        <div className="panel-body space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Atlas Mobile Sync</h3>
            <p className="mt-1 text-sm text-slate-500">
              Pull the latest buyback prices from Atlas Mobile.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="app-button app-button-primary"
            >
              {syncing ? 'Syncing...' : 'Sync now'}
            </button>
            {atlasStatus && (
              <span className="text-sm text-slate-600">{atlasStatus}</span>
            )}
          </div>
          {stats?.last_atlas_sync && (
            <p className="text-xs text-slate-500">Last sync: {new Date(stats.last_atlas_sync).toLocaleString()}</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-body">
          <h3 className="text-sm font-semibold text-slate-900">Database totals</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              { label: 'Total Phones', value: stats?.total_phones ?? '—' },
              { label: 'In-Stock Value', value: money.format(stats?.in_stock_value ?? 0) },
              { label: 'Revenue', value: money.format(stats?.total_revenue ?? 0) },
              { label: 'Profit', value: money.format(stats?.total_profit ?? 0) },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                <div className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body">
          <h3 className="text-sm font-semibold text-slate-900">Quick links</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/" className="app-button app-button-secondary">Dashboard</a>
            <a href="/inventory" className="app-button app-button-secondary">Inventory</a>
            <a href="/sales" className="app-button app-button-secondary">Sales</a>
            <a href="/atlas" className="app-button app-button-secondary">Atlas Prices</a>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body">
          <h3 className="text-sm font-semibold text-slate-900">Bulk import template</h3>
          <p className="mt-1 text-sm text-slate-500">Download a CSV template to bulk-import your inventory.</p>
          <button
            onClick={() => {
              const headers = ['imei', 'model', 'storage', 'condition', 'purchase_price', 'purchase_date', 'notes']
              const example = ['356345678901234', 'iPhone 15 Pro Max', '256GB', 'Grade A', '650', '2026-05-19', 'T-Mobile']
              const csv = [headers.join(','), example.join(',')]
              const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'phone_inventory_template.csv'
              a.click()
            }}
            className="mt-4 app-button app-button-primary"
          >
            Download CSV template
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body">
          <h3 className="text-sm font-semibold text-slate-900">Server info</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>Backend: <span className="text-slate-900">http://localhost:3000</span></p>
            <p>Database: <span className="text-slate-900">inventory.db</span> (SQLite, local)</p>
            <p>AI: <span className="text-slate-900">MiniMax-M2.7</span> via Hermes on port 8080</p>
          </div>
        </div>
      </section>
    </div>
  )
}
