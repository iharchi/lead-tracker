import { useState } from 'react'

const CHANNELS = [
  'Facebook Buyer Ad',
  'Facebook Seller Ad',
  'Zillow',
  'Google Business',
  'Facebook Groups',
  'Website',
]

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00')
  const end = new Date(d)
  end.setDate(d.getDate() + 6)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const empty = () => CHANNELS.reduce((acc, ch) => ({
  ...acc,
  [ch]: { impressions: '', clicks: '', leads: '', spend: '' }
}), {})

export default function WeeklyForm({ onSaved }) {
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [data, setData] = useState(empty())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [focusedRow, setFocusedRow] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)

  const update = (channel, field, value) => {
    setData(d => ({ ...d, [channel]: { ...d[channel], [field]: value } }))
  }

  const syncFromMeta = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const weekEnd = new Date(weekStart + "T00:00:00")
      weekEnd.setDate(weekEnd.getDate() + 6)
      const week_end = weekEnd.toISOString().split("T")[0]
      const res = await fetch("/api/meta-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, week_end }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setData(prev => {
        const next = { ...prev }
        for (const [channel, values] of Object.entries(result.channelData)) {
          if (next[channel]) {
            next[channel] = {
              impressions: values.impressions || "",
              clicks: values.clicks || "",
              leads: values.leads || "",
              spend: values.spend ? values.spend.toFixed(2) : "",
            }
          }
        }
        return next
      })
      setSyncMsg("✓ Synced " + Object.keys(result.channelData).length + " channels from Meta")
    } catch (err) {
      setSyncMsg("✕ " + err.message)
    } finally {
      setSyncing(false)
    }
  }

  const totalLeads = Object.values(data).reduce((s, r) => s + (parseFloat(r.leads) || 0), 0)
  const totalSpend = Object.values(data).reduce((s, r) => s + (parseFloat(r.spend) || 0), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const entries = CHANNELS.map(ch => ({
        channel: ch,
        impressions: parseInt(data[ch].impressions) || 0,
        clicks: parseInt(data[ch].clicks) || 0,
        leads: parseInt(data[ch].leads) || 0,
        spend: parseFloat(data[ch].spend) || 0,
      }))

      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_label: formatWeekLabel(weekStart),
          week_start: weekStart,
          entries,
        }),
      })

      if (!res.ok) throw new Error('Save failed')
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    border: '1.5px solid var(--border)',
    borderRadius: 8,
    fontSize: '0.9rem',
    background: 'var(--cream)',
    color: 'var(--text-primary)',
    transition: 'border-color 0.2s',
    outline: 'none',
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '0.25rem' }}>
          Weekly Entry
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Log impressions, clicks, leads, and spend for each channel
        </p>
      </div>

      <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '2rem', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
        {/* Week picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>
              Week of
            </label>
            <input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              style={{ ...inputStyle, maxWidth: 200 }}
            />
          </div>
          <div style={{
            flex: 2,
            background: 'var(--cream)',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}>
            📅 {formatWeekLabel(weekStart)}
          </div>
        </div>

        {/* Meta Sync Button */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={syncFromMeta}
            disabled={syncing}
            style={{
              background: syncing ? '#e2e8f0' : 'linear-gradient(135deg, #1877f2, #0d5dbf)',
              color: syncing ? '#999' : 'white',
              border: 'none', borderRadius: 8,
              padding: '0.65rem 1.25rem', fontSize: '0.9rem',
              fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}
          >
            <span>f</span>
            {syncing ? 'Syncing from Meta...' : 'Sync from Meta Ads'}
          </button>
          {syncMsg && (
            <span style={{
              fontSize: '0.85rem',
              color: syncMsg.startsWith('✓') ? '#2d7a4f' : '#c53030',
              fontWeight: 500,
            }}>
              {syncMsg}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr repeat(4, 1fr)',
            gap: '0.5rem',
            marginBottom: '0.5rem',
            padding: '0 0.25rem',
          }}>
            {['Channel', 'Impressions', 'Clicks', 'Leads', 'Spend ($)'].map(h => (
              <div key={h} style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.07em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}>{h}</div>
            ))}
          </div>

          {/* Channel rows */}
          {CHANNELS.map((ch, i) => (
            <div
              key={ch}
              onFocus={() => setFocusedRow(i)}
              onBlur={() => setFocusedRow(null)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr repeat(4, 1fr)',
                gap: '0.5rem',
                marginBottom: '0.6rem',
                padding: '0.75rem 0.75rem',
                borderRadius: 10,
                background: focusedRow === i ? 'rgba(30,58,95,0.03)' : i % 2 === 0 ? 'var(--cream)' : 'white',
                border: focusedRow === i ? '1.5px solid rgba(30,58,95,0.15)' : '1.5px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center',
                fontSize: '0.9rem', fontWeight: 600, color: 'var(--navy)',
              }}>
                {ch}
              </div>
              {['impressions', 'clicks', 'leads', 'spend'].map(field => (
                <input
                  key={field}
                  type="number"
                  min="0"
                  step={field === 'spend' ? '0.01' : '1'}
                  placeholder="0"
                  value={data[ch][field]}
                  onChange={e => update(ch, field, e.target.value)}
                  style={{
                    ...inputStyle,
                    background: 'white',
                    textAlign: 'right',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--navy)'; setFocusedRow(i) }}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              ))}
            </div>
          ))}

          {/* Totals row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr repeat(4, 1fr)',
            gap: '0.5rem',
            marginTop: '0.5rem',
            padding: '0.75rem 0.75rem',
            background: 'var(--navy)',
            borderRadius: 10,
            color: 'white',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
              Week Total
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.85rem', opacity: 0.6 }}>—</div>
            <div style={{ textAlign: 'right', fontSize: '0.85rem', opacity: 0.6 }}>—</div>
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: 'var(--gold)' }}>
              {totalLeads}
            </div>
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: 'var(--gold)' }}>
              ${totalSpend.toFixed(2)}
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              borderRadius: 8,
              color: 'var(--danger)',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setData(empty())}
              style={{
                background: 'none',
                border: '1.5px solid var(--border)',
                color: 'var(--text-secondary)',
                padding: '0.75rem 1.5rem',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: saving ? 'var(--text-muted)' : 'var(--navy)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 2rem',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}
            >
              {saving ? '⌛ Saving...' : '✦ Save Week'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
