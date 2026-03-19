import { useState, useEffect } from 'react'

const CHANNELS = ['Facebook Buyer Ad', 'Facebook Seller Ad', 'Zillow', 'Google Business', 'Facebook Groups', 'Website']

export default function HistoryTable({ onRefresh }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const load = () => {
    setLoading(true)
    fetch('/api/entries')
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Group entries by week_start
  const weeks = entries.reduce((acc, e) => {
    if (!acc[e.week_start]) acc[e.week_start] = { label: e.week_label, channels: [] }
    acc[e.week_start].channels.push(e)
    return acc
  }, {})

  const weekList = Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0]))

  const deleteWeek = async (week_start) => {
    if (!confirm('Delete all entries for this week?')) return
    setDeleting(week_start)
    await fetch(`/api/entries/${week_start}`, { method: 'DELETE' })
    setDeleting(null)
    load()
    onRefresh()
  }

  const weekTotals = (channels) => ({
    leads: channels.reduce((s, c) => s + c.leads, 0),
    spend: channels.reduce((s, c) => s + c.spend, 0),
    clicks: channels.reduce((s, c) => s + c.clicks, 0),
    impressions: channels.reduce((s, c) => s + c.impressions, 0),
  })

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'pulse 1.5s ease infinite' }}>◎</div>
      Loading history...
    </div>
  )

  return (
    <div className="fade-up">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '0.25rem' }}>
          Weekly History
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          {weekList.length} week{weekList.length !== 1 ? 's' : ''} logged
        </p>
      </div>

      {weekList.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 'var(--radius)', padding: '3rem',
          textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◎</div>
          <p style={{ fontSize: '1rem' }}>No weekly data logged yet.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Use Weekly Entry to add your first week.</p>
        </div>
      ) : (
        weekList.map(([week_start, week]) => {
          const totals = weekTotals(week.channels)
          const isOpen = expanded === week_start
          return (
            <div key={week_start} style={{
              background: 'white',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              marginBottom: '1rem',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}>
              {/* Week header */}
              <div
                onClick={() => setExpanded(isOpen ? null : week_start)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '1rem 1.5rem',
                  cursor: 'pointer',
                  background: isOpen ? 'rgba(30,58,95,0.03)' : 'white',
                  borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '1rem', color: isOpen ? 'var(--gold)' : 'var(--text-muted)' }}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.95rem' }}>
                      {week.label}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {week.channels.length} channels
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  {[
                    { label: 'Leads', value: totals.leads, highlight: true },
                    { label: 'Spend', value: `$${totals.spend.toFixed(0)}` },
                    { label: 'Clicks', value: totals.clicks },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <div style={{
                        fontWeight: 700, fontSize: '1.1rem',
                        color: m.highlight ? 'var(--gold-dark)' : 'var(--navy)',
                      }}>{m.value}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                    </div>
                  ))}

                  <button
                    onClick={e => { e.stopPropagation(); deleteWeek(week_start) }}
                    disabled={deleting === week_start}
                    style={{
                      background: 'none', border: '1px solid #fed7d7',
                      color: '#c53030', padding: '0.35rem 0.65rem',
                      borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer',
                    }}
                  >
                    {deleting === week_start ? '...' : '✕ Delete'}
                  </button>
                </div>
              </div>

              {/* Expanded channel detail */}
              {isOpen && (
                <div style={{ padding: '1rem 1.5rem', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        {['Channel', 'Impressions', 'Clicks', 'CTR', 'Leads', 'Spend', 'CPL'].map(h => (
                          <th key={h} style={{
                            padding: '0.5rem 0.75rem', textAlign: h === 'Channel' ? 'left' : 'right',
                            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.07em',
                            color: 'var(--text-muted)', textTransform: 'uppercase',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {week.channels.map((ch, i) => {
                        const ctr = ch.impressions > 0 ? ((ch.clicks / ch.impressions) * 100).toFixed(1) + '%' : '—'
                        const cpl = ch.leads > 0 ? '$' + (ch.spend / ch.leads).toFixed(2) : '—'
                        return (
                          <tr key={ch.channel} style={{
                            background: i % 2 === 0 ? 'var(--cream)' : 'white',
                          }}>
                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: 'var(--navy)' }}>{ch.channel}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{ch.impressions.toLocaleString()}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{ch.clicks.toLocaleString()}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{ctr}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 700, color: ch.leads > 0 ? 'var(--gold-dark)' : 'var(--text-muted)' }}>{ch.leads}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>${ch.spend.toFixed(2)}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{cpl}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
