import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const CONDITIONS = ['Grade A', 'Grade B', 'Grade C', 'Grade D', 'DOA']
const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB']
const CARRIER_OPTIONS = ['Unlocked', 'AT&T', 'T-Mobile', 'Verizon', 'Boost', 'Metro', 'Cricket', 'Straight Talk', 'Other']

export default function AddPhone() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    imei: '',
    model: '',
    storage: '',
    carrier: '',
    condition: 'Grade A',
    purchase_price: '',
    purchase_date: '',
    notes: '',
  })
  const [lookingUp, setLookingUp] = useState(false)
  const [imeiError, setImeiError] = useState('')
  const [lookupStatus, setLookupStatus] = useState('')

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function lookupImei() {
    if (!form.imei || form.imei.length < 14) {
      setImeiError('Enter a valid IMEI (15 digits).')
      return
    }
    setLookingUp(true)
    setImeiError('')
    setLookupStatus('')
    try {
      const r = await fetch('/api/imei/' + form.imei)
      const data = await r.json()
      if (!r.ok) {
        throw new Error(data.detail || data.error || 'IMEI lookup failed')
      }

      const next = {}
      if (data.model && !String(data.model).startsWith('Unknown')) {
        next.model = data.model
      }
      if (data.storage) {
        next.storage = data.storage
      }
      if (data.carrier) {
        next.carrier = data.carrier
      }

      if (Object.keys(next).length > 0) {
        setForm((current) => ({ ...current, ...next }))
        setLookupStatus('Lookup found device data.')
      } else {
        setLookupStatus('No useful lookup data returned for this IMEI.')
      }
    } catch (error) {
      setLookupStatus(error.message || 'Lookup failed.')
    } finally {
      setLookingUp(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.imei || !form.model) return alert('IMEI and model are required.')
    const payload = {
      ...form,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
    }
    try {
      const r = await fetch('/api/phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok) {
        navigate('/inventory')
      } else {
        alert('Error: ' + (data.detail || data.error || 'unknown error'))
      }
    } catch (error) {
      alert('Network error: ' + error.message)
    }
  }

  return (
    <div className="max-w-3xl">
      <section className="surface surface-strong p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Inventory intake</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Add Phone</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Enter the IMEI, auto-fill what you can, and push the phone into inventory.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="form-shell mt-4 space-y-5 p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label className="field-label">IMEI</label>
            <input
              value={form.imei}
              onChange={(e) => set('imei', e.target.value)}
              placeholder="15-digit IMEI"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400"
            />
            {imeiError && <p className="mt-2 text-sm text-rose-600">{imeiError}</p>}
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={lookupImei}
              disabled={lookingUp}
              className="app-button app-button-secondary"
            >
              {lookingUp ? 'Looking up...' : 'Lookup IMEI'}
            </button>
          </div>
        </div>

        <div>
          <label className="field-label">Model</label>
          <input
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="e.g. iPhone 15 Pro Max"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">Storage</label>
            <select
              value={form.storage}
              onChange={(e) => set('storage', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
            >
              <option value="">Select storage</option>
              {STORAGE_OPTIONS.map((storage) => (
                <option key={storage} value={storage}>{storage}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Carrier / lock</label>
            <select
              value={form.carrier}
              onChange={(e) => set('carrier', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
            >
              <option value="">Select carrier / lock</option>
              {CARRIER_OPTIONS.map((carrier) => (
                <option key={carrier} value={carrier}>{carrier}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">Condition</label>
            <select
              value={form.condition}
              onChange={(e) => set('condition', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
            >
              {CONDITIONS.map((condition) => <option key={condition}>{condition}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">Purchase price</label>
            <input
              type="number"
              value={form.purchase_price}
              onChange={(e) => set('purchase_price', e.target.value)}
              placeholder="0.00"
              step="0.01"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400"
            />
          </div>
          <div>
            <label className="field-label">Purchase date</label>
            <input
              type="date"
              value={form.purchase_date}
              onChange={(e) => set('purchase_date', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400"
            />
          </div>
        </div>

        {lookupStatus && (
          <p className="text-sm text-slate-600">{lookupStatus}</p>
        )}

        <div>
          <label className="field-label">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            placeholder="Carrier, color, any issues..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400"
          />
        </div>

        <button type="submit" className="app-button app-button-primary w-full">
          Add to inventory
        </button>
      </form>
    </div>
  )
}
