import { useState, useEffect } from 'react'

const STATUS_MAP = {
  in_progress: { label: 'In Progress', color: '#2b6cb0', bg: '#ebf8ff' },
  closed: { label: 'Closed', color: '#2d7a4f', bg: '#e6f4ec' },
  lost: { label: 'Lost', color: '#c53030', bg: '#fff5f5' },
}

const empty = { client_name: '', deal_type: 'buyer', status: 'in_progress', notes: '' }

export default function DealsTracker({ onRefresh }) {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    fetch('/api/deals')
      .then(r => r.json())
      .then(d => { setDeals(d); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.client_name.trim()) return
    setSaving(true)
    if (editId) {
      await fetch(`/api/deals/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    setForm(empty)
    load()
    onRefresh()
  }

  const deleteDeal = async (id) => {
    if (!confirm('Delete this deal?')) return
    await fetch(`/api/deals/${id}`, { method: 'DELETE' })
    load()
    onRefresh()
  }

  const startEdit = (deal) => {
    setForm({ client_name: deal.client_name, deal_type: deal.deal_type, status: deal.status, notes: deal.notes || '' })
    setEditId(deal.id)
    setShowForm(true)
  }

  const closed = deals.filter(d => d.status === 'closed').length
  const inProgress = deals.filter(d => d.status === 'in_progress').length

  return (
    <div className="fade-up">
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '0.25rem' }}>Deals</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            {closed} closed · {inProgress} in progress · Goal: 2 closed this year
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(empty) }}
          style={{
            background: 'var(--navy)', color: 'white', border: 'none',
            padding: '0.7rem 1.25rem', borderRadius: 8,
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Add Deal
        </button>
      </div>

      {/* Progress toward goal */}
      <div style={{
        background: 'white', borderRadius: 'var(--radius)', padding: '1.5rem',
        border: '1px solid var(--border)', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Annual Closed Deal Goal</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{closed} / 2</span>
        </div>
        <div style={{ height: 10, background: 'var(--cream-dark)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(closed / 2 * 100, 100)}%`,
            background: closed >= 2 ? 'var(--success)' : 'linear-gradient(90deg, var(--navy), var(--gold))',
            borderRadius: 99,
            transition: 'width 0.8s ease',
          }} />
        </div>
      </div>

      {/* Deals list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading...</div>
      ) : deals.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 'var(--radius)', padding: '3rem',
          textAlign: 'center', border: '1px solid var(--border)', color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◇</div>
          <p>No deals yet. Add your first deal to track progress.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {deals.map(deal => {
            const s = STATUS_MAP[deal.status] || STATUS_MAP.in_progress
            return (
              <div key={deal.id} style={{
                background: 'white', borderRadius: 'var(--radius)',
                padding: '1.25rem 1.5rem', border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: deal.deal_type === 'buyer' ? 'rgba(30,58,95,0.08)' : 'rgba(212,175,55,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', flexShrink: 0,
                }}>
                  {deal.deal_type === 'buyer' ? '🏠' : '📊'}
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.95rem' }}>
                    {deal.client_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {deal.deal_type} · {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                {deal.notes && (
                  <div style={{
                    flex: 2, minWidth: 200, fontSize: '0.85rem',
                    color: 'var(--text-secondary)', fontStyle: 'italic',
                  }}>
                    {deal.notes}
                  </div>
                )}
                <span style={{
                  background: s.bg, color: s.color,
                  padding: '0.3rem 0.75rem', borderRadius: 99,
                  fontSize: '0.78rem', fontWeight: 600,
                }}>
                  {s.label}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => startEdit(deal)} style={{
                    background: 'var(--cream)', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)', padding: '0.35rem 0.7rem',
                    borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer',
                  }}>✎ Edit</button>
                  <button onClick={() => deleteDeal(deal.id)} style={{
                    background: 'none', border: '1px solid #fed7d7',
                    color: '#c53030', padding: '0.35rem 0.7rem',
                    borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer',
                  }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(13,31,60,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: '1rem',
        }}>
          <div style={{
            background: 'white', borderRadius: 'var(--radius)',
            padding: '2rem', width: '100%', maxWidth: 420,
            boxShadow: 'var(--shadow-lg)',
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--navy)', marginBottom: '1.5rem', fontSize: '1.3rem' }}>
              {editId ? 'Edit Deal' : 'New Deal'}
            </h3>

            {[
              { label: 'Client Name', key: 'client_name', type: 'text', placeholder: 'Jane & John Smith' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{
                    width: '100%', padding: '0.75rem',
                    border: '1.5px solid var(--border)', borderRadius: 8,
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              {[
                { label: 'Type', key: 'deal_type', options: [{ v: 'buyer', l: 'Buyer' }, { v: 'seller', l: 'Seller' }] },
                { label: 'Status', key: 'status', options: [{ v: 'in_progress', l: 'In Progress' }, { v: 'closed', l: 'Closed' }, { v: 'lost', l: 'Lost' }] },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>{f.label}</label>
                  <select
                    value={form[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem' }}
                  >
                    {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Notes</label>
              <textarea
                placeholder="Any notes about this deal..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '0.75rem', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={save} disabled={saving} style={{
                flex: 1, background: 'var(--navy)', color: 'white',
                border: 'none', borderRadius: 8, padding: '0.75rem',
                fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
              }}>
                {saving ? 'Saving...' : editId ? 'Update' : 'Add Deal'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null) }} style={{
                flex: 1, background: 'var(--cream)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem',
                fontSize: '0.9rem', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
