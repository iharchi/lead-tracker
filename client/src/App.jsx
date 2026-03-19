import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard.jsx'
import WeeklyForm from './components/WeeklyForm.jsx'
import HistoryTable from './components/HistoryTable.jsx'
import AIAnalysis from './components/AIAnalysis.jsx'
import DealsTracker from './components/DealsTracker.jsx'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'entry', label: 'Weekly Entry', icon: '✦' },
  { id: 'history', label: 'History', icon: '◎' },
  { id: 'deals', label: 'Deals', icon: '◇' },
  { id: 'ai', label: 'AI Analysis', icon: '✧' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const refresh = () => setRefreshKey(k => k + 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        background: `linear-gradient(135deg, var(--navy-dark) 0%, var(--navy) 100%)`,
        color: 'white',
        padding: '0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 20px rgba(13,31,60,0.3)',
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 64,
        }}>
          {/* Logo + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36,
              height: 36,
              background: 'var(--gold)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              color: 'var(--navy-dark)',
              fontSize: '1.1rem',
              fontWeight: 700,
              flexShrink: 0,
            }}>IH</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', lineHeight: 1.1 }}>
                Lead Tracker
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6, fontWeight: 300, letterSpacing: '0.05em' }}>
                ISAAK HARCHI REAL ESTATE
              </div>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', gap: '0.25rem' }} className="desktop-nav">
            {NAV.map(n => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                style={{
                  background: tab === n.id ? 'rgba(212,175,55,0.15)' : 'transparent',
                  border: tab === n.id ? '1px solid rgba(212,175,55,0.4)' : '1px solid transparent',
                  color: tab === n.id ? 'var(--gold)' : 'rgba(255,255,255,0.7)',
                  padding: '0.45rem 0.9rem',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span style={{ fontSize: '0.75rem' }}>{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              fontSize: '1.2rem',
              display: 'none',
            }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div style={{
            background: 'var(--navy-dark)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            padding: '0.75rem 1.5rem',
          }}>
            {NAV.map(n => (
              <button
                key={n.id}
                onClick={() => { setTab(n.id); setMenuOpen(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: tab === n.id ? 'rgba(212,175,55,0.1)' : 'transparent',
                  border: 'none',
                  color: tab === n.id ? 'var(--gold)' : 'rgba(255,255,255,0.8)',
                  padding: '0.75rem 1rem',
                  borderRadius: 8,
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                {n.icon} {n.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <main style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: '2rem 1.5rem' }}>
        {tab === 'dashboard' && <Dashboard key={refreshKey} onNavigate={setTab} />}
        {tab === 'entry' && <WeeklyForm onSaved={() => { refresh(); setTab('dashboard'); }} />}
        {tab === 'history' && <HistoryTable key={refreshKey} onRefresh={refresh} />}
        {tab === 'deals' && <DealsTracker key={refreshKey} onRefresh={refresh} />}
        {tab === 'ai' && <AIAnalysis />}
      </main>

      {/* Footer */}
      <footer style={{
        background: 'var(--navy-dark)',
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        padding: '1rem',
        fontSize: '0.75rem',
      }}>
        © 2026 Isaak Harchi Real Estate · Twin Cities, Minneapolis
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
