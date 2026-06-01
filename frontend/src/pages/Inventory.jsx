import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const GRADE_COLORS = {
  'Grade A': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Grade B': 'bg-amber-50 text-amber-700 border-amber-200',
  'Grade C': 'bg-orange-50 text-orange-700 border-orange-200',
  'Grade D': 'bg-rose-50 text-rose-700 border-rose-200',
  DOA: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function Inventory() {
  const [phones, setPhones] = useState([])
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [models, setModels] = useState([])
  const fileRef = useRef()

  useEffect(() => {
    loadPhones()
    fetch('/api/atlas/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => {})
  }, [statusFilter])

  function loadPhones() {
    const url = statusFilter ? '/api/phones/with-margins?status=' + encodeURIComponent(statusFilter) : '/api/phones/with-margins'
    fetch(url).then((r) => r.json()).then(setPhones)
  }

  async function deletePhone(id) {
    if (!confirm('Delete this phone and all its sales?')) return
    await fetch('/api/phones/' + id, { method: 'DELETE' })
    loadPhones()
  }

  async function sellPhone(phone) {
    const price = prompt('Sale price for ' + phone.model + '?', phone.purchase_price || '')
    const fees = prompt('Fees? (optional)', '0') || '0'
    const platform = prompt('Platform (Atlas / eBay / Swappa / Other)?', phone.best_platform || 'Atlas') || 'Atlas'
    if (!price) return
    await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_id: phone.id,
        sale_price: parseFloat(price),
        fees: parseFloat(fees),
        platform,
      }),
    })
    loadPhones()
  }

  function startEdit(phone) {
    setEditingId(phone.id)
    setEditForm({
      model: phone.model,
      storage: phone.storage || '',
      condition: phone.condition,
      purchase_price: phone.purchase_price || '',
      status: phone.status,
      notes: phone.notes || '',
    })
  }

  async function saveEdit(id) {
    const body = {}
    for (const [key, value] of Object.entries(editForm)) {
      if (value !== '' && value != null) body[key] = key === 'purchase_price' ? parseFloat(value) : value
    }
    await fetch('/api/phones/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setEditingId(null)
    loadPhones()
  }

  function handleCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data
        let imported = 0
        let errors = 0
        for (const row of rows) {
          if (!row.imei || !row.model) {
            errors++
            continue
          }
          const payload = {
            imei: row.imei,
            model: row.model,
            storage: row.storage || null,
            condition: row.condition || 'Grade A',
            purchase_price: row.purchase_price ? parseFloat(row.purchase_price) : null,
            purchase_date: row.purchase_date || null,
            notes: row.notes || null,
          }
          const res = await fetch('/api/phones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (res.ok) imported++
          else errors++
        }
        alert('Import done: ' + imported + ' added, ' + errors + ' errors')
        loadPhones()
        fileRef.current.value = ''
      },
    })
  }

  const filtered = phones.filter((phone) => {
    const query = filter.toLowerCase()
    return (
      (((phone.model || '').toLowerCase().includes(query)) || (phone.imei || '').includes(filter)) &&
      (!statusFilter || phone.status === statusFilter)
    )
  })

  return (
    <div className="page-stack">
      <section className="surface surface-strong p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Inventory</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
              Inventory <span className="text-slate-500">({phones.length})</span>
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Search, edit, import CSVs, and move phones through the lifecycle.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fileRef.current.click()}
              className="app-button app-button-secondary"
            >
              Import CSV
            </button>
            <input type="file" ref={fileRef} accept=".csv" className="hidden" onChange={handleCSV} />
            <Link to="/inventory/add" className="app-button app-button-primary">
              Add Phone
            </Link>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body flex flex-col gap-3 md:flex-row">
          <input
            placeholder="Search IMEI or model..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400 md:w-48"
          >
            <option value="">All status</option>
            <option value="In Stock">In Stock</option>
            <option value="Sold">Sold</option>
            <option value="Returned">Returned</option>
          </select>
        </div>
      </section>

      <section className="table-shell">
        <div className="hidden md:block">
          <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="p-3 text-left font-semibold">IMEI</th>
              <th className="p-3 text-left font-semibold">Model</th>
              <th className="p-3 text-left font-semibold">Storage</th>
              <th className="p-3 text-left font-semibold">Condition</th>
              <th className="p-3 text-left font-semibold">Purchase Price</th>
              {phones.some((p) => p.atlas_margin !== undefined) && (
                <>
                  <th className="p-3 text-left font-semibold">Atlas Margin</th>
                  <th className="p-3 text-left font-semibold">eBay Margin</th>
                  <th className="p-3 text-left font-semibold">Best</th>
                </>
              )}
              <th className="p-3 text-left font-semibold">Status</th>
              <th className="p-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((phone) => (
              <tr key={phone.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                {editingId === phone.id ? (
                  <>
                    <td className="p-3 font-mono text-xs text-slate-500">{phone.imei}</td>
                    <td className="p-3">
                      <div className="relative">
                        <select
                          value={editForm.model}
                          onChange={(e) => setEditForm((current) => ({ ...current, model: e.target.value }))}
                          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                        >
                          <option value="">-- Select Model --</option>
                          {models.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input
                          type="text"
                          value={editForm.model || ''}
                          onChange={(e) => setEditForm((current) => ({ ...current, model: e.target.value }))}
                          placeholder="Filter or type..."
                          className="absolute inset-0 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 pl-10 text-sm outline-none"
                          style={{ background: 'transparent' }}
                          onFocus={(e) => { e.target.previousSibling.focus() }}
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <input
                        value={editForm.storage}
                        onChange={(e) => setEditForm((current) => ({ ...current, storage: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      />
                    </td>
                    <td className="p-3">
                      <select
                        value={editForm.condition}
                        onChange={(e) => setEditForm((current) => ({ ...current, condition: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      >
                        {Object.keys(GRADE_COLORS).map((grade) => <option key={grade}>{grade}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={editForm.purchase_price}
                        onChange={(e) => setEditForm((current) => ({ ...current, purchase_price: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      />
                    </td>
                    <td className="p-3">
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm((current) => ({ ...current, status: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      >
                        <option>In Stock</option>
                        <option>Sold</option>
                        <option>Returned</option>
                      </select>
                    </td>
                    {phone.atlas_margin !== undefined && (
                      <>
                        <td className={'p-3 font-medium ' + (phone.atlas_margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {money.format(phone.atlas_margin)}
                        </td>
                        <td className={'p-3 font-medium ' + (phone.ebay_margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {money.format(phone.ebay_margin)}
                        </td>
                        <td className="p-3">
                          {phone.best_platform === 'Atlas' ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Atlas</span>
                          ) : (
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">Retail</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(phone.id)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3 font-mono text-xs text-slate-500">{phone.imei}</td>
                    <td className="p-3 font-medium text-slate-900">{phone.model}</td>
                    <td className="p-3 text-slate-500">{phone.storage || '—'}</td>
                    <td className="p-3">
                      <span className={'rounded-full border px-2.5 py-1 text-xs font-medium ' + (GRADE_COLORS[phone.condition] || 'border-slate-200 bg-slate-50 text-slate-700')}>
                        {phone.condition}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">{phone.purchase_price != null ? money.format(phone.purchase_price) : '—'}</td>
                    <td className="p-3">
                      <span className={
                        'rounded-full border px-2.5 py-1 text-xs font-medium ' +
                        (phone.status === 'In Stock'
                          ? 'border-teal-200 bg-teal-50 text-teal-700'
                          : phone.status === 'Sold'
                            ? 'border-slate-200 bg-slate-50 text-slate-600'
                            : 'border-rose-200 bg-rose-50 text-rose-700')
                      }>
                        {phone.status}
                      </span>
                    </td>
                    {phone.atlas_margin !== undefined && (
                      <>
                        <td className={'p-3 font-medium ' + (phone.atlas_margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {money.format(phone.atlas_margin)}
                        </td>
                        <td className={'p-3 font-medium ' + (phone.ebay_margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {money.format(phone.ebay_margin)}
                        </td>
                        <td className="p-3">
                          {phone.best_platform === 'Atlas' ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Atlas</span>
                          ) : (
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">Retail</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => startEdit(phone)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-teal-200 hover:text-slate-900"
                        >
                          Edit
                        </button>
                        {phone.status === 'In Stock' && (
                          <button
                            onClick={() => sellPhone(phone)}
                            className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-100"
                          >
                            Sell
                          </button>
                        )}
                        <button
                          onClick={() => deletePhone(phone.id)}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  No phones found. Add one or adjust the search.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((phone) => (
            <article key={phone.id} className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              {editingId === phone.id ? (
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">IMEI</span>
                    <span className="font-mono text-xs text-slate-500">{phone.imei}</span>
                  </div>
                  <div>
                    <label className="field-label">Model</label>
                    <div className="relative">
                      <select
                        value={editForm.model}
                        onChange={(e) => setEditForm((current) => ({ ...current, model: e.target.value }))}
                        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      >
                        <option value="">-- Select Model --</option>
                        {models.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <input
                        type="text"
                        value={editForm.model || ''}
                        onChange={(e) => setEditForm((current) => ({ ...current, model: e.target.value }))}
                        placeholder="Filter or type..."
                        className="absolute inset-0 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 pl-10 text-sm outline-none"
                        style={{ background: 'transparent' }}
                        onFocus={(e) => { e.target.previousSibling.focus() }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Storage</label>
                      <input
                        value={editForm.storage}
                        onChange={(e) => setEditForm((current) => ({ ...current, storage: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      />
                    </div>
                    <div>
                      <label className="field-label">Condition</label>
                      <select
                        value={editForm.condition}
                        onChange={(e) => setEditForm((current) => ({ ...current, condition: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      >
                        {Object.keys(GRADE_COLORS).map((grade) => <option key={grade}>{grade}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Purchase Price</label>
                      <input
                        type="number"
                        value={editForm.purchase_price}
                        onChange={(e) => setEditForm((current) => ({ ...current, purchase_price: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      />
                    </div>
                    <div>
                      <label className="field-label">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm((current) => ({ ...current, status: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-400"
                      >
                        <option>In Stock</option>
                        <option>Sold</option>
                        <option>Returned</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => saveEdit(phone.id)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-slate-500">{phone.imei}</p>
                      <h3 className="mt-1 text-base font-semibold text-slate-950">{phone.model}</h3>
                    </div>
                    <span
                      className={
                        'rounded-full border px-2.5 py-1 text-xs font-medium ' +
                        (phone.status === 'In Stock'
                          ? 'border-teal-200 bg-teal-50 text-teal-700'
                          : phone.status === 'Sold'
                            ? 'border-slate-200 bg-slate-50 text-slate-600'
                            : 'border-rose-200 bg-rose-50 text-rose-700')
                      }
                    >
                      {phone.status}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Storage</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-700">{phone.storage || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Purchase</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-700">{phone.purchase_price != null ? money.format(phone.purchase_price) : '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Condition</dt>
                      <dd className="mt-1">
                        <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ' + (GRADE_COLORS[phone.condition] || 'border-slate-200 bg-slate-50 text-slate-700')}>
                          {phone.condition}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => startEdit(phone)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-teal-200 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    {phone.status === 'In Stock' && (
                      <button
                        onClick={() => sellPhone(phone)}
                        className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-100"
                      >
                        Sell
                      </button>
                    )}
                    <button
                      onClick={() => deletePhone(phone.id)}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 p-6 text-center text-slate-500">
              No phones found. Add one or adjust the search.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
