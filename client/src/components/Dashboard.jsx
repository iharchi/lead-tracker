import { useState, useEffect } from 'react'

const CHANNELS = ['Facebook Buyer Ad', 'Facebook Seller Ad', 'Zillow', 'Google Business', 'Facebook Groups', 'Website']

const STATUS_STYLES = {
  active:  { bg: '#e6f4ec', color: '#2d7a4f', dot: '#38a169', label: 'Live' },
  review:  { bg: '#fef9e7', color: '#b7791f', dot: '#d4af37', label: 'In Review' },
  pending: { bg: '#ebf4ff', color: '#2b6cb0', dot: '#4299e1', label: 'Pending' },
  paused:  { bg: '#fff5f5', color: '#c53030', dot: '#e53e3e', label: 'Paused' },
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 'var(--radius)',
      padding: '1.5rem',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function MetricCard({ label, value, sub, accent, icon }) {
  return (
    <Card style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 80, height: 80,
        background: accent ? 'rgba(212,175,55,0.06)' : 'rgba(30,58,95,0.04)',
        borderRadius: '0 12px 0 100%',
      }} />
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        marginBottom: '0.35rem',
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '2rem',
        color: accent ? 'var(--gold-dark)' : 'var(--navy)',
        lineHeight: 1,
        marginBottom: '0.3rem',
      }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </Card>
  )
}

function ProgressBar({ value, max, label, sublabel, color = 'var(--navy)' }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{value} / {max} {sublabel}</span>
      </div>
      <div style={{
        height: 10,
        background: 'var(--cream-dark)',
        borderRadius: 99,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct >= 100
            ? 'var(--success)'
            : `linear-gradient(90deg, ${color}, var(--gold))`,
          borderRadius: 99,
          transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }} />
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
        {pct.toFixed(0)}% complete
      </div>
    </div>
  )
}

function StatusPill({ channel, status, label, onEdit }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.active
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.65rem 0.85rem',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--cream)',
      border: '1px solid var(--border)',
      marginBottom: '0.5rem',
    }}>
      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
        {channel}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          background: s.bg, color: s.color,
          padding: '0.25rem 0.65rem', borderRadius: 99,
          fontSize: '0.75rem', fontWeight: 600,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: s.dot,
            display: 'inline-block',
            animation: status === 'active' ? 'pulse 2s ease infinite' : 'none',
          }} />
          {label}
        </span>
        <button onClick={() => onEdit(channel, status)} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: '0.75rem', cursor: 'pointer', padding: '0.1rem 0.3rem',
          borderRadius: 4,
        }}>✎</button>
      </div>
    </div>
  )
}

export default function Dashboard({ onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [channelStatus, setChannelStatus] = useState([])
  const [editingChannel, setEditingChannel] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/summary').then(r => r.json()),
      fetch('/api/channel-status').then(r => r.json()),
    ]).then(([s, cs]) => {
      setSummary(s)
      setChannelStatus(cs)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleEditStatus = (channel, currentStatus) => {
    setEditingChannel({ channel, status: currentStatus, label: '' })
  }

  const saveStatus = async () => {
    if (!editingChannel) return
    await fetch(`/api/channel-status/${encodeURIComponent(editingChannel.channel)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: editingChannel.status,
        label: STATUS_STYLES[editingChannel.status]?.label || editingChannel.status
      }),
    })
    setEditingChannel(null)
    const cs = await fetch('/api/channel-status').then(r => r.json())
    setChannelStatus(cs)
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'pulse 1.5s ease infinite' }}>◈</div>
      Loading dashboard...
    </div>
  )

  const leads = summary?.totalLeads ?? 0
  const deals = summary?.closedDeals ?? 0
  const cpl = summary?.costPerLead ? `$${summary.costPerLead}` : '—'
  const best = summary?.bestChannel ?? '—'

  return (
    <div className="fade-up">
      {/* Page title */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '0.25rem' }}>
          Good day, Isaak
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Here's how your lead generation is performing
        </p>
      </div>

      {/* Metric cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <MetricCard icon="◎" label="Total Leads" value={leads} sub="this month" />
        <MetricCard icon="◇" label="Closed Deals" value={deals} sub="this year" />
        <MetricCard icon="✦" label="Cost Per Lead" value={cpl} sub="avg across channels" accent />
        <MetricCard icon="★" label="Best Channel" value={best !== '—' ? '' : '—'}
          sub={best !== '—' ? best : 'No data yet'} />
      </div>

      {/* Progress + Status */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        {/* Goals */}
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '1.5rem',
          }}>
            <h2 style={{ fontSize: '1.2rem', color: 'var(--navy)' }}>Goal Progress</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>March 2026</span>
          </div>
          <ProgressBar
            value={leads}
            max={20}
            label="Monthly Lead Goal"
            sublabel="leads"
            color="var(--navy)"
          />
          <ProgressBar
            value={deals}
            max={2}
            label="Annual Deal Goal"
            sublabel="closed deals"
            color="var(--navy-light)"
          />
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'var(--cream)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}>
            💡 {20 - leads > 0 ? `${20 - leads} more leads needed this month` : '🎉 Monthly goal achieved!'}
          </div>
        </Card>

        {/* Channel Status */}
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '1.25rem',
          }}>
            <h2 style={{ fontSize: '1.2rem', color: 'var(--navy)' }}>Channel Status</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>click ✎ to edit</span>
          </div>
          {channelStatus.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No channels found</p>
            : channelStatus.map(cs => (
              <StatusPill
                key={cs.channel}
                channel={cs.channel}
                status={cs.status}
                label={cs.label}
                onEdit={handleEditStatus}
              />
            ))
          }
        </Card>
      </div>

      {/* Budget snapshot */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>
          Budget Overview
        </h2>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Facebook Ads Budget', budget: 75, spent: summary?.byChannel?.['Facebook Buyer Ad']?.spend + summary?.byChannel?.['Facebook Seller Ad']?.spend || 0 },
            { label: 'Google LSA Budget', budget: 25, spent: summary?.byChannel?.['Google Business']?.spend || 0 },
          ].map(b => (
            <div key={b.label} style={{ flex: '1', minWidth: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{b.label}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  ${b.spent.toFixed(0)} / ${b.budget}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--cream-dark)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min((b.spent / b.budget) * 100, 100)}%`,
                  background: b.spent > b.budget ? 'var(--danger)' : 'var(--gold)',
                  borderRadius: 99,
                  transition: 'width 0.8s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => onNavigate('entry')}
          style={{
            background: 'var(--navy)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1.5rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.target.style.background = 'var(--navy-light)'}
          onMouseLeave={e => e.target.style.background = 'var(--navy)'}
        >
          ✦ Log This Week's Data
        </button>
        <button
          onClick={() => onNavigate('ai')}
          style={{
            background: 'var(--gold)',
            color: 'var(--navy-dark)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1.5rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            transition: 'all 0.2s',
          }}
        >
          ✧ Get AI Analysis
        </button>
      </div>

      {/* Edit Status Modal */}
      {editingChannel && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(13,31,60,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: '1rem',
        }}>
          <div style={{
            background: 'white', borderRadius: 'var(--radius)',
            padding: '2rem', width: '100%', maxWidth: 380,
            boxShadow: 'var(--shadow-lg)',
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--navy)', marginBottom: '1rem' }}>
              Edit Channel Status
            </h3>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              {editingChannel.channel}
            </p>
            <select
              value={editingChannel.status}
              onChange={e => setEditingChannel({ ...editingChannel, status: e.target.value })}
              style={{
                width: '100%', padding: '0.75rem',
                border: '2px solid var(--border)', borderRadius: 8,
                fontSize: '0.9rem', marginBottom: '1rem',
              }}
            >
              <option value="active">Live</option>
              <option value="review">In Review</option>
              <option value="pending">Verification Pending</option>
              <option value="paused">Paused</option>
            </select>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={saveStatus} style={{
                flex: 1, background: 'var(--navy)', color: 'white',
                border: 'none', borderRadius: 8, padding: '0.75rem',
                fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
              }}>Save</button>
              <button onClick={() => setEditingChannel(null)} style={{
                flex: 1, background: 'var(--cream)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem',
                fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
