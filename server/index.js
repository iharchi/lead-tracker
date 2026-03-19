require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { initDb, query, run } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Weekly Entries ───────────────────────────────────────────────────────────

app.get('/api/entries', (req, res) => {
  try {
    const entries = query('SELECT * FROM weekly_entries ORDER BY week_start DESC, channel ASC');
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/entries', (req, res) => {
  try {
    const { week_label, week_start, entries } = req.body;
    if (!week_label || !week_start || !Array.isArray(entries))
      return res.status(400).json({ error: 'week_label, week_start, and entries array required' });

    run('DELETE FROM weekly_entries WHERE week_start = ?', [week_start]);

    for (const row of entries) {
      run(
        'INSERT INTO weekly_entries (week_label, week_start, channel, impressions, clicks, leads, spend) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [week_label, week_start, row.channel, row.impressions || 0, row.clicks || 0, row.leads || 0, row.spend || 0]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/entries/:week_start', (req, res) => {
  try {
    run('DELETE FROM weekly_entries WHERE week_start = ?', [req.params.week_start]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Deals ────────────────────────────────────────────────────────────────────

app.get('/api/deals', (req, res) => {
  try {
    res.json(query('SELECT * FROM deals ORDER BY created_at DESC'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/deals', (req, res) => {
  try {
    const { client_name, deal_type, status, notes } = req.body;
    const result = run(
      'INSERT INTO deals (client_name, deal_type, status, notes) VALUES (?, ?, ?, ?)',
      [client_name, deal_type, status || 'in_progress', notes || '']
    );
    res.json({ id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/deals/:id', (req, res) => {
  try {
    const { client_name, deal_type, status, notes } = req.body;
    run('UPDATE deals SET client_name=?, deal_type=?, status=?, notes=? WHERE id=?',
      [client_name, deal_type, status, notes, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/deals/:id', (req, res) => {
  try {
    run('DELETE FROM deals WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Channel Status ───────────────────────────────────────────────────────────

app.get('/api/channel-status', (req, res) => {
  try {
    res.json(query('SELECT * FROM channel_status ORDER BY channel'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/channel-status/:channel', (req, res) => {
  try {
    const { status, label } = req.body;
    run('UPDATE channel_status SET status=?, label=? WHERE channel=?',
      [status, label, req.params.channel]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Summary ──────────────────────────────────────────────────────────────────

app.get('/api/summary', (req, res) => {
  try {
    const entries = query('SELECT * FROM weekly_entries');
    const deals = query('SELECT * FROM deals');

    const totalLeads = entries.reduce((s, e) => s + e.leads, 0);
    const totalSpend = entries.reduce((s, e) => s + e.spend, 0);
    const totalClicks = entries.reduce((s, e) => s + e.clicks, 0);
    const totalImpressions = entries.reduce((s, e) => s + e.impressions, 0);

    const byChannel = {};
    for (const e of entries) {
      if (!byChannel[e.channel]) byChannel[e.channel] = { leads: 0, spend: 0 };
      byChannel[e.channel].leads += e.leads;
      byChannel[e.channel].spend += e.spend;
    }

    const bestChannel = Object.entries(byChannel).sort((a, b) => b[1].leads - a[1].leads)[0];

    res.json({
      totalLeads,
      totalSpend: totalSpend.toFixed(2),
      totalClicks,
      totalImpressions,
      costPerLead: totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : null,
      bestChannel: bestChannel ? bestChannel[0] : null,
      closedDeals: deals.filter(d => d.status === 'closed').length,
      totalDeals: deals.length,
      byChannel
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AI Analysis ──────────────────────────────────────────────────────────────

app.post('/api/analyze', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set in environment' });

    const entries = query('SELECT * FROM weekly_entries ORDER BY week_start DESC');
    const deals = query('SELECT * FROM deals');

    const totalLeads = entries.reduce((s, e) => s + e.leads, 0);
    const totalSpend = entries.reduce((s, e) => s + e.spend, 0);

    const byChannel = {};
    for (const e of entries) {
      if (!byChannel[e.channel]) byChannel[e.channel] = { leads: 0, spend: 0, clicks: 0, impressions: 0 };
      byChannel[e.channel].leads += e.leads;
      byChannel[e.channel].spend += e.spend;
      byChannel[e.channel].clicks += e.clicks;
      byChannel[e.channel].impressions += e.impressions;
    }

    const channelSummary = Object.entries(byChannel).map(([ch, d]) => ({
      channel: ch,
      leads: d.leads,
      spend: d.spend.toFixed(2),
      cpl: d.leads > 0 ? (d.spend / d.leads).toFixed(2) : 'N/A',
      ctr: d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) + '%' : 'N/A'
    }));

    const prompt = `You are an expert real estate marketing analyst. Analyze the following lead generation data for Isaak Harchi, a real estate agent in Twin Cities, Minneapolis.

GOALS: 20 leads this month, 2 closed deals this year
BUDGET: $75 Facebook ads/month, $25 Google LSA/month

OVERALL METRICS:
- Total leads: ${totalLeads} / 20 goal
- Total spend: $${totalSpend.toFixed(2)}
- Cost per lead: ${totalLeads > 0 ? '$' + (totalSpend / totalLeads).toFixed(2) : 'N/A'}
- Closed deals: ${deals.filter(d => d.status === 'closed').length} / 2 goal

CHANNEL PERFORMANCE:
${JSON.stringify(channelSummary, null, 2)}

Provide:
1. What's working (top 1-2 channels and why)
2. What needs fixing (biggest problem and exact fix)
3. Three priority actions for next week (be very specific, e.g. "Increase Facebook Buyer Ad budget by $15 and test a video creative showing a home walkthrough in Eden Prairie")

Be direct and tactical. Real estate specific. No generic advice. Under 350 words.`;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({ analysis: message.content[0].text });
  } catch (err) {
    console.error('AI error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Lead Tracker API running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
