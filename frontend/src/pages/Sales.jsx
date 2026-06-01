import { useState, useEffect } from 'react'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export default function Sales() {
  const [sales, setSales] = useState([])

  useEffect(() => {
    load()
  }, [])

  function load() {
    fetch('/api/sales').then((r) => r.json()).then(setSales)
  }

  async function deleteSale(id) {
    if (!confirm('Delete this sale?')) return
    await fetch('/api/sales/' + id, { method: 'DELETE' })
    load()
  }

  const totalRevenue = sales.reduce((sum, sale) => sum + (sale.sale_price || 0), 0)
  const totalFees = sales.reduce((sum, sale) => sum + (sale.fees || 0), 0)
  const totalProfit = sales.reduce((sum, sale) => sum + (sale.sale_price || 0) - (sale.fees || 0) - (sale.purchase_price || 0), 0)

  return (
    <div className="page-stack">
      <section className="surface surface-strong p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Sales ledger</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Sales</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Review completed flips, fees, and margin.
        </p>
      </section>

      <section className="metric-grid">
        {[
          { label: 'Revenue', value: money.format(totalRevenue) },
          { label: 'Fees Paid', value: money.format(totalFees) },
          { label: 'Net Profit', value: money.format(totalProfit) },
        ].map((metric) => (
          <div key={metric.label} className="metric-card">
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value}</div>
          </div>
        ))}
      </section>

      <section className="table-shell">
        <div className="hidden md:block">
          <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="p-3 text-left font-semibold">Date</th>
              <th className="p-3 text-left font-semibold">Model</th>
              <th className="p-3 text-left font-semibold">IMEI</th>
              <th className="p-3 text-left font-semibold">Condition</th>
              <th className="p-3 text-left font-semibold">Sale Price</th>
              <th className="p-3 text-left font-semibold">Fees</th>
              <th className="p-3 text-left font-semibold">Platform</th>
              <th className="p-3 text-left font-semibold">Margin</th>
              <th className="p-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => {
              const margin = (sale.sale_price || 0) - (sale.fees || 0) - (sale.purchase_price || 0)
              return (
                <tr key={sale.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                  <td className="p-3 text-slate-500">{sale.sale_date}</td>
                  <td className="p-3 font-medium text-slate-900">{sale.model}</td>
                  <td className="p-3 font-mono text-xs text-slate-500">{sale.imei}</td>
                  <td className="p-3 text-slate-600">{sale.condition}</td>
                  <td className="p-3 text-slate-900">{money.format(sale.sale_price || 0)}</td>
                  <td className="p-3 text-slate-500">{money.format(sale.fees || 0)}</td>
                  <td className="p-3 text-slate-600">{sale.platform}</td>
                  <td className={'p-3 font-semibold ' + (margin >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                    {money.format(margin)}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => deleteSale(sale.id)}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
            {sales.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-500">
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {sales.map((sale) => {
            const margin = (sale.sale_price || 0) - (sale.fees || 0) - (sale.purchase_price || 0)
            return (
              <article key={sale.id} className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{sale.sale_date}</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">{sale.model}</h3>
                    <p className="mt-1 font-mono text-xs text-slate-500">{sale.imei}</p>
                  </div>
                  <button
                    onClick={() => deleteSale(sale.id)}
                    className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Condition</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-700">{sale.condition}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Platform</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-700">{sale.platform}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Sale Price</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{money.format(sale.sale_price || 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Fees</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-700">{money.format(sale.fees || 0)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Margin</dt>
                    <dd className={'mt-1 text-sm font-semibold ' + (margin >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                      {money.format(margin)}
                    </dd>
                  </div>
                </dl>
              </article>
            )
          })}

          {sales.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 p-6 text-center text-slate-500">
              No sales recorded yet.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
