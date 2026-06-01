import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Model A-Z' },
  { value: 'name-desc', label: 'Model Z-A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'manufacturer-asc', label: 'Manufacturer A-Z' },
  { value: 'newest-sync', label: 'Newest Sync First' },
]

function matchesSearch(phone, query) {
  if (!query) return true
  const parts = [
    phone.display_name || '',
    phone.manufacturer || '',
    phone.device_name || '',
  ]
  for (const item of phone.conditions || []) {
    parts.push(item.condition + ' ' + item.price)
  }
  return parts.join(' ').toLowerCase().includes(query)
}

function sortPhones(rows, sortBy) {
  const copy = [...rows]
  copy.sort((a, b) => {
    const aName = (a.display_name || '').toLowerCase()
    const bName = (b.display_name || '').toLowerCase()
    const aManufacturer = (a.manufacturer || '').toLowerCase()
    const bManufacturer = (b.manufacturer || '').toLowerCase()
    const aPrice = Number(a.min_price ?? 0)
    const bPrice = Number(b.min_price ?? 0)
    const aSynced = a.synced_at ? new Date(a.synced_at).getTime() : 0
    const bSynced = b.synced_at ? new Date(b.synced_at).getTime() : 0

    switch (sortBy) {
      case 'name-desc':
        return bName.localeCompare(aName)
      case 'price-asc':
        return aPrice - bPrice || aName.localeCompare(bName)
      case 'price-desc':
        return bPrice - aPrice || aName.localeCompare(bName)
      case 'manufacturer-asc':
        return aManufacturer.localeCompare(bManufacturer) || aName.localeCompare(bName)
      case 'newest-sync':
        return bSynced - aSynced || aName.localeCompare(bName)
      case 'name-asc':
      default:
        return aName.localeCompare(bName)
    }
  })
  return copy
}

export default function AtlasPrices() {
  const [atlasPhones, setAtlasPhones] = useState([])
  const [marginData, setMarginData] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [manufacturer, setManufacturer] = useState('All')
  const [sortBy, setSortBy] = useState('name-asc')

  useEffect(() => {
    load()
  }, [])

  function load() {
    Promise.all([
      fetch('/api/atlas/phones').then((r) => r.json()),
      fetch('/api/atlas/prices/with-margin').then((r) => r.json()),
    ]).then(([phones, margins]) => {
      setAtlasPhones(phones)
      setMarginData(margins)
    })
  }

  async function sync() {
    setLoading(true)
    try {
      const r = await fetch('/api/atlas/sync', { method: 'POST' })
      const data = await r.json()
      if (r.ok) {
        load()
      } else {
        alert('Sync failed: ' + (data.detail || data.error || 'unknown error'))
      }
    } finally {
      setLoading(false)
    }
  }

  const manufacturers = useMemo(() => {
    return ['All', ...Array.from(new Set(atlasPhones.map((item) => item.manufacturer).filter(Boolean))).sort()]
  }, [atlasPhones])

  const profitable = marginData.filter((item) => item.margin != null && item.margin > 0)
  const normalizedSearch = search.trim().toLowerCase()
  const filteredPhones = useMemo(() => {
    return sortPhones(
      atlasPhones.filter((phone) => {
        const manufacturerOk = manufacturer === 'All' || phone.manufacturer === manufacturer
        return manufacturerOk && matchesSearch(phone, normalizedSearch)
      }),
      sortBy,
    )
  }, [atlasPhones, manufacturer, normalizedSearch, sortBy])

  return (
    <div className="page-stack">
      <section className="surface surface-strong p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Pricing table</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Atlas Phones</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Browse one entry per phone, filter it down, then open the detail page for condition, storage, and unlock matching.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFiltersOpen((value) => !value)}
              className="app-button app-button-secondary"
            >
              {filtersOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button
              onClick={sync}
              disabled={loading}
              className="app-button app-button-primary"
            >
              {loading ? 'Syncing...' : 'Sync Atlas'}
            </button>
          </div>
        </div>
      </section>

      {profitable.length > 0 && (
        <section className="panel">
          <div className="panel-body">
            <h3 className="text-sm font-semibold text-emerald-800">{profitable.length} profitable inventory rows</h3>
            <p className="mt-1 text-sm text-slate-500">
              Atlas buyback is higher than your purchase price on these matched inventory items.
            </p>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="metric-label">Phones</div>
          <div className="metric-value">{atlasPhones.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Inventory Matches</div>
          <div className="metric-value">{marginData.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Profitable</div>
          <div className="metric-value">{profitable.length}</div>
        </div>
      </section>

      {filtersOpen && (
        <section className="panel">
          <div className="panel-body grid gap-4 md:grid-cols-3">
            <div>
              <label className="field-label">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Model, manufacturer, or condition"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400"
              />
            </div>
            <div>
              <label className="field-label">Manufacturer</label>
              <select
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
              >
                {manufacturers.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Sort</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      <section className="table-shell">
        <div className="hidden md:block">
          <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="p-3 text-left font-semibold">Phone</th>
              <th className="p-3 text-left font-semibold">Manufacturer</th>
              <th className="p-3 text-left font-semibold">Variants</th>
              <th className="p-3 text-left font-semibold">Atlas Range</th>
              <th className="p-3 text-left font-semibold">Synced</th>
              <th className="p-3 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPhones.map((phone) => (
              <tr key={phone.slug} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                <td className="p-3 font-medium text-slate-900">{phone.display_name}</td>
                <td className="p-3 text-slate-600">{phone.manufacturer}</td>
                <td className="p-3 text-slate-700">{phone.variants?.length || 0}</td>
                <td className="p-3 text-slate-700">
                  {phone.min_price != null && phone.max_price != null
                    ? phone.min_price === phone.max_price
                      ? money.format(phone.min_price)
                      : money.format(phone.min_price) + ' - ' + money.format(phone.max_price)
                    : '—'}
                </td>
                <td className="p-3 text-slate-500">{phone.synced_at ? new Date(phone.synced_at).toLocaleString() : '—'}</td>
                <td className="p-3">
                  <Link to={'/atlas/' + phone.slug} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {filteredPhones.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  {atlasPhones.length === 0 ? 'No Atlas phones cached yet. Sync Atlas first.' : 'No Atlas phones match your filters.'}
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {filteredPhones.map((phone) => (
            <article key={phone.slug} className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{phone.display_name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{phone.manufacturer}</p>
                </div>
                <Link
                  to={'/atlas/' + phone.slug}
                  className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
                >
                  Open
                </Link>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Variants</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-700">{phone.variants?.length || 0}</dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Atlas Range</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-700">
                    {phone.min_price != null && phone.max_price != null
                      ? phone.min_price === phone.max_price
                        ? money.format(phone.min_price)
                        : money.format(phone.min_price) + ' - ' + money.format(phone.max_price)
                      : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Synced</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-700">{phone.synced_at ? new Date(phone.synced_at).toLocaleString() : '—'}</dd>
                </div>
              </dl>
            </article>
          ))}

          {filteredPhones.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 p-6 text-center text-slate-500">
              {atlasPhones.length === 0 ? 'No Atlas phones cached yet. Sync Atlas first.' : 'No Atlas phones match your filters.'}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
