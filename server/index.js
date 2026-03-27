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
  // Create approval_tokens table
  run(`CREATE TABLE IF NOT EXISTS approval_tokens (
    token TEXT PRIMARY KEY,
    recommendations TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`, []);

  app.listen(PORT, () => {
    console.log(`Lead Tracker API running on http://localhost:${PORT}`);
  });

  // Start agent inside same process so they share the DB instance
  try {
    const cron = require('node-cron');
    const { runAgent } = require('./agent');
    const { runQA } = require('./qa');

    // Daily agent at 8am
    cron.schedule('0 8 * * *', () => {
      console.log('[Agent] Scheduled run at 8am');
      runAgent();
    });
    console.log('[Agent] Scheduled daily at 8:00 AM');

    // QA checks every hour
    cron.schedule('0 * * * *', () => {
      console.log('[QA] Hourly check triggered');
      runQA();
    });
    // Run QA once on startup
    setTimeout(() => runQA(), 5000);
    console.log('[QA] Scheduled hourly health checks');
  } catch (e) {
    console.warn('[Agent] Could not start schedulers:', e.message);
  }
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

// ─── Meta Ads Sync ────────────────────────────────────────────────────────────

app.post('/api/meta-sync', async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    if (!token || !adAccountId) {
      return res.status(400).json({ error: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set' });
    }

    const { week_start, week_end } = req.body;

    const url = `https://graph.facebook.com/v25.0/act_${adAccountId}/insights` +
      `?fields=ad_name,campaign_name,impressions,clicks,spend,actions` +
      `&time_range={"since":"${week_start}","until":"${week_end}"}` +
      `&level=ad` +
      `&access_token=${token}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    const ads = data.data || [];

    // Map ad names to channels
    const channelMap = (adName) => {
      const name = adName.toLowerCase();
      if (name.includes('sell')) return 'Facebook Seller Ad';
      if (name.includes('buy') || name.includes('buying')) return 'Facebook Buyer Ad';
      if (name.includes('website') || name.includes('visitor')) return 'Website';
      if (name.includes('group')) return 'Facebook Groups';
      return 'Facebook Buyer Ad'; // default
    };

    // Aggregate by channel
    const channelData = {};
    for (const ad of ads) {
      const channel = channelMap(ad.ad_name || ad.campaign_name || '');
      if (!channelData[channel]) {
        channelData[channel] = { impressions: 0, clicks: 0, leads: 0, spend: 0 };
      }
      channelData[channel].impressions += parseInt(ad.impressions || 0);
      channelData[channel].clicks += parseInt(ad.clicks || 0);
      channelData[channel].spend += parseFloat(ad.spend || 0);

      // Count lead form submissions from actions
      const actions = ad.actions || [];
      const leadAction = actions.find(a =>
        a.action_type === 'lead' ||
        a.action_type === 'onsite_conversion.lead_grouped'
      );
      if (leadAction) {
        channelData[channel].leads += parseInt(leadAction.value || 0);
      }
    }

    res.json({ channelData, rawAds: ads });
  } catch (err) {
    console.error('Meta sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent Approval Endpoint ──────────────────────────────────────────────────

app.get('/api/agent/approve/:token', async (req, res) => {
  try {
    // Ensure table exists
    run(`CREATE TABLE IF NOT EXISTS approval_tokens (
      token TEXT PRIMARY KEY,
      recommendations TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )`, []);

    const rows = query('SELECT * FROM approval_tokens WHERE token = ?', [req.params.token]);
    if (rows.length === 0) {
      return res.send(buildPage('Invalid or expired link', 'This approval link is invalid or has already been used.', false));
    }

    const row = rows[0];
    if (row.status === 'approved') {
      return res.send(buildPage('Already Applied', 'These budget changes have already been applied.', true));
    }

    const recommendations = JSON.parse(row.recommendations || '[]');

    // Apply changes
    const { applyBudgetChanges } = require('./agent');
    const results = await applyBudgetChanges(recommendations);

    // Mark token as used
    run('UPDATE approval_tokens SET status = ? WHERE token = ?', ['approved', req.params.token]);

    const summary = results.map(r =>
      `${r.ad}: ${r.action}${r.newBudget ? ' to $' + r.newBudget + '/day' : ''} — ${r.success ? '✓ Applied' : '✕ Failed'}`
    ).join('\n');

    res.send(buildPage('Changes Applied!', summary || 'No changes were needed.', true));
  } catch (err) {
    console.error('Approval error:', err);
    res.send(buildPage('Error', err.message, false));
  }
});

function buildPage(title, message, success) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:40px;background:#f4f1eb;font-family:Arial,sans-serif;text-align:center;">
  <div style="max-width:500px;margin:80px auto;background:white;border-radius:12px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="font-size:48px;margin-bottom:16px;">${success ? '✅' : '❌'}</div>
    <h1 style="color:#1e3a5f;font-size:24px;margin-bottom:12px;">${title}</h1>
    <pre style="color:#4a5568;font-size:14px;white-space:pre-wrap;text-align:left;background:#f8f6f0;padding:16px;border-radius:8px;">${message}</pre>
    <a href="http://localhost:5173" style="display:inline-block;margin-top:20px;background:#1e3a5f;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open Dashboard</a>
  </div>
</body>
</html>`;
}

// ─── Manual Agent Trigger ─────────────────────────────────────────────────────

app.post('/api/agent/run', async (req, res) => {
  try {
    const { runAgent } = require('./agent');
    res.json({ message: 'Agent started' });
    runAgent();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Manual QA Trigger ────────────────────────────────────────────────────────

app.post('/api/qa/run', async (req, res) => {
  try {
    const { runQA } = require('./qa');
    res.json({ message: 'QA checks started' });
    runQA();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Test Facebook Post ───────────────────────────────────────────────────────

app.post('/api/poster/test', async (req, res) => {
  try {
    const { postToFacebookPage } = require('./poster');
    const message = req.body.message || 'Test post from IH Lead Tracker — Twin Cities real estate market update coming soon!';
    const postId = await postToFacebookPage(message);
    if (postId) {
      res.json({ success: true, postId, message });
    } else {
      res.status(500).json({ error: 'Post failed — check FB_PAGE_TOKEN and FB_PAGE_ID in .env' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
