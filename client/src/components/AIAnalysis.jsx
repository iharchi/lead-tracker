import { useState } from 'react'

export default function AIAnalysis() {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const res = await fetch('/api/analyze', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setAnalysis(data.analysis)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Parse the AI response into sections for better display
  const parseAnalysis = (text) => {
    const sections = []
    const lines = text.split('\n').filter(l => l.trim())
    let current = null

    for (const line of lines) {
      const isHeader = /^#{1,3}\s|^\d+\.|^[A-Z][^a-z]{0,5}:/.test(line.trim())
      if (isHeader || line.startsWith('**') && line.trim().length < 60) {
        if (current) sections.push(current)
        current = { header: line.replace(/^#{1,3}\s|^\*\*/g, '').replace(/\*\*$/, '').replace(/:/,'').trim(), body: [] }
      } else if (current) {
        current.body.push(line)
      } else {
        sections.push({ header: null, body: [line] })
      }
    }
    if (current) sections.push(current)
    return sections.length > 0 ? sections : [{ header: null, body: lines }]
  }

  const SECTION_ICONS = ['✦', '⚠', '✧', '◈']
  const SECTION_COLORS = ['var(--success)', 'var(--warning)', 'var(--navy)', 'var(--gold-dark)']

  return (
    <div className="fade-up">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '0.25rem' }}>
          AI Analysis
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Get tactical recommendations based on your actual lead data
        </p>
      </div>

      {/* Trigger card */}
      <div style={{
        background: `linear-gradient(135deg, var(--navy-dark) 0%, var(--navy) 100%)`,
        borderRadius: 'var(--radius)',
        padding: '2.5rem',
        marginBottom: '1.5rem',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -20, right: -20,
          width: 200, height: 200,
          background: 'rgba(212,175,55,0.08)',
          borderRadius: '50%',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✧</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.75rem' }}>
            AI Strategy Brief
          </h2>
          <p style={{ opacity: 0.75, fontSize: '0.9rem', marginBottom: '1.5rem', maxWidth: 480 }}>
            Analyzes all your weekly entries, channel performance, budget allocation, and progress toward your 20-lead and 2-deal goals. Returns specific actions for next week.
          </p>
          <button
            onClick={runAnalysis}
            disabled={loading}
            style={{
              background: loading ? 'rgba(212,175,55,0.5)' : 'var(--gold)',
              color: 'var(--navy-dark)',
              border: 'none',
              padding: '0.85rem 2rem',
              borderRadius: 8,
              fontSize: '1rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◈</span>
                Analyzing your data...
              </>
            ) : '✧ Run AI Analysis'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          background: 'white', borderRadius: 'var(--radius)', padding: '2rem',
          border: '1px solid var(--border)', textAlign: 'center',
          animation: 'pulse 1.5s ease infinite',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Claude is reviewing your channel data, spend, and lead performance...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: 'var(--radius)',
          padding: '1.5rem', color: 'var(--danger)',
        }}>
          <strong>Error:</strong> {error}
          {error.includes('ANTHROPIC_API_KEY') && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Make sure ANTHROPIC_API_KEY is set in your server/.env file.
            </p>
          )}
        </div>
      )}

      {/* Analysis result */}
      {analysis && !loading && (
        <div className="fade-in">
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '1rem',
          }}>
            <h2 style={{ color: 'var(--navy)', fontSize: '1.1rem' }}>Your Strategy Brief</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Generated {new Date().toLocaleTimeString()}
            </span>
          </div>

          {/* Raw text in styled card */}
          <div style={{
            background: 'white', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              background: 'var(--navy)', padding: '0.75rem 1.5rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>✧</span>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', fontWeight: 600 }}>
                Claude's Analysis
              </span>
            </div>
            <div style={{ padding: '2rem' }}>
              {analysis.split('\n').map((line, i) => {
                const isH2 = /^#{2}\s|^\d+\.\s/.test(line) || (line.startsWith('**') && line.endsWith('**'))
                const isH3 = /^#{3}\s/.test(line)
                const isBullet = /^[-•*]\s/.test(line.trim())
                const clean = line.replace(/^#{1,3}\s/, '').replace(/\*\*/g, '')

                if (!line.trim()) return <div key={i} style={{ height: '0.75rem' }} />

                if (isH2) return (
                  <h3 key={i} style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--navy)', fontSize: '1.15rem',
                    marginTop: i > 0 ? '1.5rem' : 0, marginBottom: '0.5rem',
                    paddingBottom: '0.4rem',
                    borderBottom: '2px solid var(--gold)',
                    display: 'inline-block',
                  }}>{clean}</h3>
                )

                if (isBullet) return (
                  <div key={i} style={{
                    display: 'flex', gap: '0.5rem', marginBottom: '0.4rem',
                    paddingLeft: '0.5rem',
                  }}>
                    <span style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '0.1rem' }}>✦</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {clean.replace(/^[-•*]\s/, '')}
                    </span>
                  </div>
                )

                return (
                  <p key={i} style={{
                    fontSize: '0.9rem', color: 'var(--text-secondary)',
                    lineHeight: 1.7, marginBottom: '0.4rem',
                  }}>{clean}</p>
                )
              })}
            </div>
          </div>

          <button
            onClick={runAnalysis}
            style={{
              marginTop: '1rem',
              background: 'none', border: '1.5px solid var(--border)',
              color: 'var(--text-secondary)', padding: '0.6rem 1.25rem',
              borderRadius: 8, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
            }}
          >
            ↺ Regenerate
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  )
}
