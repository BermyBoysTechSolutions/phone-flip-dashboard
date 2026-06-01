import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const conditionRank = ['Grade A', 'Grade B', 'Grade C', 'Grade D', 'DOA', 'NEW']

export default function AtlasPhone() {
  const { slug } = useParams()
  const [phone, setPhone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCondition, setSelectedCondition] = useState('')
  const [selectedStorage, setSelectedStorage] = useState('')
  const [selectedCarrier, setSelectedCarrier] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/atlas/phones/' + slug)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) {
          setError(data.detail || data.error || 'Failed to load Atlas phone')
          return
        }
        setPhone(data)
        const firstCondition = data.default_condition || [...(data.condition_options || [])][0] || ''
        setSelectedCondition(firstCondition)
        setSelectedStorage(data.default_storage || [...(data.storage_options || [])][0] || '')
        setSelectedCarrier(data.default_carrier || [...(data.carrier_options || [])][0] || '')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load Atlas phone')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const inventory = phone?.inventory || []
  const variants = phone?.variants || []
  const storageOptions = phone?.storage_options || []
  const carrierOptions = phone?.carrier_options || []
  const conditionOptions = phone?.condition_options || []

  const selectedVariant = useMemo(() => {
    const exact = variants.find((item) =>
      item.condition === selectedCondition &&
      item.storage === selectedStorage &&
      item.carrier === selectedCarrier
    )
    if (exact) return exact
    const conditionOnly = variants.find((item) => item.condition === selectedCondition)
    if (conditionOnly) return conditionOnly
    return variants[0] || null
  }, [variants, selectedCondition, selectedStorage, selectedCarrier])

  const selectedInventory = inventory.filter((item) => {
    const storageOk = !selectedStorage || (item.storage || '') === selectedStorage
    const carrierOk = !selectedCarrier || (item.carrier || '') === selectedCarrier
    const conditionOk = !selectedCondition || (item.condition || '') === selectedCondition
    return storageOk && carrierOk && conditionOk
  })

  if (loading) {
    return (
      <div className="surface p-6">
        <p className="text-sm text-slate-500">Loading Atlas phone...</p>
      </div>
    )
  }

  if (error || !phone) {
    return (
      <div className="surface p-6">
        <p className="text-sm text-rose-700">{error || 'Atlas phone not found'}</p>
        <Link to="/atlas" className="mt-4 inline-flex app-button app-button-secondary">
          Back to Atlas
        </Link>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <section className="surface surface-strong p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">{phone.manufacturer}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{phone.display_name}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Use the selectors below to narrow the matching inventory rows. Atlas price varies by condition, while storage and lock help match the exact phone in stock.
            </p>
          </div>
          <Link to="/atlas" className="app-button app-button-secondary">
            Back to Atlas
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="metric-label">Phone</div>
          <div className="metric-value">{phone.display_name}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Atlas Range</div>
          <div className="metric-value">{phone.min_price != null && phone.max_price != null ? money.format(phone.min_price) + ' - ' + money.format(phone.max_price) : '—'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Matches</div>
          <div className="metric-value">{selectedInventory.length}</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body grid gap-4 md:grid-cols-3">
          <div>
            <label className="field-label">Condition</label>
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
            >
              {conditionOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Storage</label>
            <select
              value={selectedStorage}
              onChange={(e) => setSelectedStorage(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
            >
              {storageOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Unlock status</label>
            <select
              value={selectedCarrier}
              onChange={(e) => setSelectedCarrier(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
            >
              {carrierOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel">
          <div className="panel-body border-b border-slate-200/80">
            <h3 className="text-sm font-semibold text-slate-900">Atlas Price</h3>
            <p className="mt-1 text-sm text-slate-500">Price is driven by the selected condition.</p>
          </div>
          <div className="p-4 md:p-6">
            <div className="rounded-3xl border border-teal-100 bg-teal-50/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Selected</p>
              <div className="mt-2 text-2xl font-bold text-slate-950">{selectedCondition || '—'}</div>
              <div className="mt-3 text-4xl font-bold text-teal-800">
                {selectedVariant ? money.format(selectedVariant.price) : '—'}
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Storage and unlock status now come from the Atlas variants for this phone, so the selector reflects the actual sheet entries.
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body border-b border-slate-200/80">
            <h3 className="text-sm font-semibold text-slate-900">Matching Inventory</h3>
            <p className="mt-1 text-sm text-slate-500">{selectedInventory.length} inventory items match the current selectors.</p>
          </div>
          <div className="max-h-[28rem] overflow-auto p-4">
            {selectedInventory.length === 0 ? (
              <p className="text-sm text-slate-500">No inventory rows match these filters.</p>
            ) : (
              <div className="space-y-3">
                {selectedInventory.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.model}</p>
                        <p className="text-xs text-slate-500">{item.storage || '—'} · {item.carrier || '—'} · {item.condition || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Purchase</p>
                        <p className="text-sm font-semibold text-slate-900">{item.purchase_price != null ? money.format(item.purchase_price) : '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
