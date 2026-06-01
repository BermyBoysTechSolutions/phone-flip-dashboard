import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const compact = new Intl.NumberFormat('en-US')

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [marginData, setMarginData] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [dashboardResult, salesResult, marginsResult] = await Promise.allSettled([
        fetch('/api/dashboard').then((r) => r.json()),
        fetch('/api/sales').then((r) => r.json()),
        fetch('/api/atlas/prices/with-margin').then((r) => r.json()),
      ])

      if (cancelled) return

      if (dashboardResult.status === 'fulfilled') {
        setStats(dashboardResult.value)
      }
      if (salesResult.status === 'fulfilled') {
        setRecentSales(salesResult.value.slice(0, 7))
      }
      if (marginsResult.status === 'fulfilled') {
        setMarginData(marginsResult.value)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!stats) {
    return (
      <div className="space-y-4">
        <div className="surface p-6">
          <div className="h-7 w-64 animate-pulse rounded bg-slate-200/80" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-slate-200/70" />
        </div>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="metric-card animate-pulse">
              <div className="h-3 w-20 rounded bg-slate-200/80" />
              <div className="mt-3 h-8 w-24 rounded bg-slate-200/70" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const positive = marginData.filter((item) => item.margin != null && item.margin > 0)
  const negative = marginData.filter((item) => item.margin != null && item.margin < 0)
  const noMargin = marginData.filter((item) => item.margin == null)
  const totalUnrealized = marginData.reduce((sum, item) => sum + (item.margin || 0), 0)

  return (
    <div className="page-stack">
      <section className="surface surface-strong p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Phone Flip Dashboard</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
              Inventory, pricing, and profit in one view.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Track stock, measure spread against Atlas buyback pricing, and keep the business moving without
              bouncing between tabs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fetch('/api/atlas/sync', { method: 'POST' }).then(() => location.reload())}
              className="app-button app-button-primary"
            >
              Sync Atlas
            </button>
            <Link to="/inventory/add" className="app-button app-button-secondary">
              Add Phone
            </Link>
          </div>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Last Atlas sync: {stats.last_atlas_sync ? new Date(stats.last_atlas_sync).toLocaleString() : 'never'}
        </p>
      </section>

      <section className="metric-grid">
        {[
          { label: 'In Stock', value: compact.format(stats.total_phones) },
          { label: 'In-Stock Value', value: money.format(stats.in_stock_value) },
          { label: 'Revenue', value: money.format(stats.total_revenue) },
          { label: 'Profit', value: money.format(stats.total_profit) },
          { label: 'Atlas Prices', value: compact.format(stats.atlas_count || 0) },
          { label: 'Unrealized Margin', value: money.format(totalUnrealized) },
        ].map((metric) => (
          <div key={metric.label} className="metric-card">
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value}</div>
          </div>
        ))}
      </section>

      {recentSales.length > 0 && (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="panel">
            <div className="panel-body border-b border-slate-200/80">
              <h3 className="text-sm font-semibold text-slate-900">Recent Sales</h3>
              <p className="mt-1 text-sm text-slate-500">Latest seven recorded sales.</p>
            </div>
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recentSales} margin={{ top: 4, right: 6, left: -10, bottom: 0 }}>
                  <XAxis dataKey="sale_date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => '$' + v} />
                  <Tooltip
                    formatter={(value) => [money.format(value), 'Sale Price']}
                    contentStyle={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: '16px' }}
                  />
                  <Bar dataKey="sale_price" radius={[8, 8, 0, 0]}>
                    {recentSales.map((entry, index) => (
                      <Cell key={'sale-' + index} fill="#2563eb" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="panel-body border-b border-slate-200/80">
              <h3 className="text-sm font-semibold text-slate-900">Margin per Phone</h3>
              <p className="mt-1 text-sm text-slate-500">The first ten inventory items with Atlas matchups.</p>
            </div>
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marginData.slice(0, 10)} margin={{ top: 4, right: 6, left: -10, bottom: 0 }}>
                  <XAxis dataKey="model" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => '$' + v} />
                  <Tooltip
                    formatter={(value) => [money.format(value || 0), 'Margin']}
                    contentStyle={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: '16px' }}
                  />
                  <Bar dataKey="margin" radius={[8, 8, 0, 0]}>
                    {marginData.slice(0, 10).map((entry, index) => (
                      <Cell key={'margin-' + index} fill={(entry.margin || 0) >= 0 ? '#0f766e' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel">
          <div className="panel-body border-b border-slate-200/80">
            <h3 className="text-sm font-semibold text-emerald-800">Positive Margin</h3>
            <p className="mt-1 text-sm text-slate-500">{positive.length} phones above purchase price.</p>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto p-4">
            {positive.length === 0 ? (
              <p className="text-sm text-slate-500">No positive spreads yet.</p>
            ) : (
              positive.map((item) => (
                <div key={item.phone_id} className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                  <span className="text-sm font-medium text-slate-800">
                    {item.display_name || item.model} {item.storage || ''}
                  </span>
                  <span className="text-sm font-semibold text-emerald-700">{money.format(item.margin || 0)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-body border-b border-slate-200/80">
            <h3 className="text-sm font-semibold text-rose-800">Weak or Missing Margin</h3>
            <p className="mt-1 text-sm text-slate-500">{negative.length + noMargin.length} phones need attention.</p>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto p-4">
            {negative.concat(noMargin).length === 0 ? (
              <p className="text-sm text-slate-500">Everything in stock is covered by Atlas data.</p>
            ) : (
              negative.concat(noMargin).map((item) => (
                <div key={item.phone_id} className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3">
                  <span className="text-sm font-medium text-slate-800">
                    {item.display_name || item.model} {item.storage || ''}
                  </span>
                  <span className="text-sm font-semibold text-rose-700">
                    {item.margin == null ? 'No Atlas price' : money.format(item.margin)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body flex flex-wrap gap-3">
          <Link to="/inventory" className="app-button app-button-secondary">Inventory</Link>
          <Link to="/sales" className="app-button app-button-secondary">Sales</Link>
          <Link to="/atlas" className="app-button app-button-secondary">Atlas Prices</Link>
          <Link to="/settings" className="app-button app-button-secondary">Settings</Link>
        </div>
      </section>
    </div>
  )
}
