require('dotenv').config();
const cron = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run } = require('./db');
const { sendApprovalEmail } = require('./mailer');

const AGENT_EMAIL = process.env.AGENT_EMAIL || 'harchi.isaak@gmail.com';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const META_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = d => d.toISOString().split('T')[0];
  const label = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    week_start: fmt(weekStart),
    week_end: fmt(weekEnd),
    week_label: `${label(weekStart)} – ${label(weekEnd)}, ${weekEnd.getFullYear()}`,
  };
}

function channelFromAdName(adName = '') {
  const name = adName.toLowerCase();
  if (name.includes('sell')) return 'Facebook Seller Ad';
  if (name.includes('buy') || name.includes('buying')) return 'Facebook Buyer Ad';
  if (name.includes('website') || name.includes('visitor')) return 'Website';
  if (name.includes('group')) return 'Facebook Groups';
  return 'Facebook Buyer Ad';
}

// ─── Step 1: Pull Meta Ads Data ───────────────────────────────────────────────

async function pullMetaData(week_start, week_end) {
  console.log(`[Agent] Pulling Meta data for ${week_start} to ${week_end}`);

  const url = `https://graph.facebook.com/v25.0/act_${META_AD_ACCOUNT_ID}/insights` +
    `?fields=ad_id,ad_name,campaign_name,impressions,clicks,spend,actions` +
    `&time_range={"since":"${week_start}","until":"${week_end}"}` +
    `&level=ad` +
    `&access_token=${META_TOKEN}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) throw new Error(`Meta API: ${data.error.message}`);

  const ads = data.data || [];
  console.log(`[Agent] Pulled ${ads.length} ads from Meta`);

  // Aggregate by channel
  const channelData = {};
  for (const ad of ads) {
    const channel = channelFromAdName(ad.ad_name || ad.campaign_name);
    if (!channelData[channel]) channelData[channel] = { impressions: 0, clicks: 0, leads: 0, spend: 0 };
    channelData[channel].impressions += parseInt(ad.impressions || 0);
    channelData[channel].clicks += parseInt(ad.clicks || 0);
    channelData[channel].spend += parseFloat(ad.spend || 0);
    const leadAction = (ad.actions || []).find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    if (leadAction) channelData[channel].leads += parseInt(leadAction.value || 0);
  }

  return { channelData, rawAds: ads };
}

// ─── Step 2: Save to DB ───────────────────────────────────────────────────────

async function saveWeeklyData(week_label, week_start, channelData) {
  console.log('[Agent] Saving weekly data to DB');
  run('DELETE FROM weekly_entries WHERE week_start = ?', [week_start]);

  const CHANNELS = ['Facebook Buyer Ad', 'Facebook Seller Ad', 'Zillow', 'Google Business', 'Facebook Groups', 'Website'];
  for (const channel of CHANNELS) {
    const d = channelData[channel] || { impressions: 0, clicks: 0, leads: 0, spend: 0 };
    run(
      'INSERT INTO weekly_entries (week_label, week_start, channel, impressions, clicks, leads, spend) VALUES (?,?,?,?,?,?,?)',
      [week_label, week_start, channel, d.impressions, d.clicks, d.leads, d.spend]
    );
  }
  console.log('[Agent] Weekly data saved');
}

// ─── Step 3: Pull Ad Budgets from Meta ────────────────────────────────────────

async function getAdBudgets() {
  const url = `https://graph.facebook.com/v25.0/act_${META_AD_ACCOUNT_ID}/ads` +
    `?fields=id,name,status,adset{daily_budget,name}` +
    `&access_token=${META_TOKEN}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API budgets: ${data.error.message}`);
  return data.data || [];
}

// ─── Step 4: Claude Analysis + Budget Recommendations ─────────────────────────

async function analyzeAndRecommend(channelData, rawAds) {
  console.log('[Agent] Running Claude analysis');

  const allEntries = query('SELECT * FROM weekly_entries ORDER BY week_start DESC');
  const deals = query('SELECT * FROM deals');
  const totalLeads = allEntries.reduce((s, e) => s + e.leads, 0);
  const totalSpend = allEntries.reduce((s, e) => s + e.spend, 0);

  // Build channel summary
  const byChannel = {};
  for (const e of allEntries) {
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
    ctr: d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) + '%' : 'N/A',
  }));

  // Get current ad budgets
  let adBudgets = [];
  try {
    adBudgets = await getAdBudgets();
  } catch (e) {
    console.warn('[Agent] Could not fetch ad budgets:', e.message);
  }

  const prompt = `You are an expert real estate marketing analyst and agent for Isaak Harchi, Twin Cities real estate agent.

GOALS: 20 leads/month, 2 closed deals/year
BUDGET: $75 Facebook/month ($2.50/day), $25 Google LSA/month

OVERALL PERFORMANCE:
- Total leads: ${totalLeads} / 20 goal
- Total spend: $${totalSpend.toFixed(2)}
- CPL: ${totalLeads > 0 ? '$' + (totalSpend / totalLeads).toFixed(2) : 'N/A'}
- Closed deals: ${deals.filter(d => d.status === 'closed').length} / 2

CHANNEL DATA:
${JSON.stringify(channelSummary, null, 2)}

CURRENT META ADS & BUDGETS:
${JSON.stringify(adBudgets.map(a => ({ id: a.id, name: a.name, status: a.status, daily_budget: a.adset?.daily_budget })), null, 2)}

Provide:
1. What's working (be specific)
2. What needs fixing (biggest issue + exact fix)
3. Three priority actions for next week

Then provide budget recommendations as a JSON array at the end in this exact format:
<recommendations>
[
  {
    "adId": "ad_id_here",
    "adName": "Ad name here",
    "currentBudget": 5.00,
    "newBudget": 10.00,
    "action": "increase",
    "reason": "Short reason"
  }
]
</recommendations>

Only include ads that need changes. Use "increase", "decrease", or "pause" for action.
Keep analysis under 300 words. Be specific to Twin Cities real estate.`;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullText = message.content[0].text;

  // Extract recommendations JSON
  let recommendations = [];
  const recoMatch = fullText.match(/<recommendations>([\s\S]*?)<\/recommendations>/);
  if (recoMatch) {
    try {
      recommendations = JSON.parse(recoMatch[1].trim());
    } catch (e) {
      console.warn('[Agent] Could not parse recommendations JSON');
    }
  }

  // Clean analysis text (remove the JSON block)
  const analysis = fullText.replace(/<recommendations>[\s\S]*?<\/recommendations>/, '').trim();

  console.log(`[Agent] Analysis complete. ${recommendations.length} budget changes recommended`);
  return { analysis, recommendations };
}

// ─── Step 5: Store Approval Token ─────────────────────────────────────────────

function storeApprovalToken(token, recommendations) {
  run(`CREATE TABLE IF NOT EXISTS approval_tokens (
    token TEXT PRIMARY KEY,
    recommendations TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`, []);

  run('DELETE FROM approval_tokens WHERE created_at < datetime("now", "-2 days")', []);
  run('INSERT INTO approval_tokens (token, recommendations) VALUES (?, ?)',
    [token, JSON.stringify(recommendations)]);
}

// ─── Step 6: Apply Budget Changes ─────────────────────────────────────────────

async function applyBudgetChanges(recommendations) {
  console.log(`[Agent] Applying ${recommendations.length} budget changes to Meta`);
  const results = [];

  for (const rec of recommendations) {
    try {
      if (rec.action === 'pause') {
        // Pause the ad
        const res = await fetch(`https://graph.facebook.com/v25.0/${rec.adId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'PAUSED',
            access_token: META_TOKEN,
          }),
        });
        const data = await res.json();
        results.push({ ad: rec.adName, action: 'paused', success: !data.error });
      } else {
        // Update adset daily budget (in cents)
        const budgetCents = Math.round(rec.newBudget * 100);
        // Get adset ID first
        const adRes = await fetch(`https://graph.facebook.com/v25.0/${rec.adId}?fields=adset_id&access_token=${META_TOKEN}`);
        const adData = await adRes.json();

        if (adData.adset_id) {
          const res = await fetch(`https://graph.facebook.com/v25.0/${adData.adset_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              daily_budget: budgetCents,
              access_token: META_TOKEN,
            }),
          });
          const data = await res.json();
          results.push({ ad: rec.adName, action: rec.action, newBudget: rec.newBudget, success: !data.error });
        }
      }
    } catch (e) {
      console.error(`[Agent] Failed to update ${rec.adName}:`, e.message);
      results.push({ ad: rec.adName, action: rec.action, success: false, error: e.message });
    }
  }

  return results;
}

// ─── Main Agent Run ───────────────────────────────────────────────────────────

async function runAgent() {
  console.log('\n[Agent] ========== Starting daily run ==========');
  const { week_start, week_end, week_label } = getWeekRange();

  try {
    // 1. Pull Meta data
    const { channelData, rawAds } = await pullMetaData(week_start, week_end);

    // 2. Save to DB
    await saveWeeklyData(week_label, week_start, channelData);

    // 3. Analyze
    const entries = query('SELECT * FROM weekly_entries');
    const totalLeads = entries.reduce((s, e) => s + e.leads, 0);
    const totalSpend = entries.reduce((s, e) => s + e.spend, 0);
    const { analysis, recommendations } = await analyzeAndRecommend(channelData, rawAds);

    // 4. Store approval token
    const token = uuidv4();
    storeApprovalToken(token, recommendations);

    // 5. Send email
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'your_resend_api_key_here') {
      await sendApprovalEmail({
        to: AGENT_EMAIL,
        weekLabel: week_label,
        analysis,
        recommendations,
        approvalToken: token,
        totalSpend: totalSpend.toFixed(2),
        totalLeads,
        baseUrl: BASE_URL,
      });
      console.log(`[Agent] Email sent to ${AGENT_EMAIL}`);
    } else {
      console.log('[Agent] No Resend key set — skipping email');
      console.log('[Agent] Analysis:', analysis);
    }

    console.log('[Agent] ========== Daily run complete ==========\n');
  } catch (err) {
    console.error('[Agent] Run failed:', err.message);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

initDb().then(() => {
  console.log('[Agent] DB initialized');

  // Create approval_tokens table
  run(`CREATE TABLE IF NOT EXISTS approval_tokens (
    token TEXT PRIMARY KEY,
    recommendations TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`, []);

  // Run immediately on start
  runAgent();

  // Then schedule daily at 8:00 AM
  cron.schedule('0 8 * * *', () => {
    console.log('[Agent] Scheduled run triggered');
    runAgent();
  });

  console.log('[Agent] Scheduled to run daily at 8:00 AM');
}).catch(err => {
  console.error('[Agent] DB init failed:', err);
  process.exit(1);
});

module.exports = { runAgent, applyBudgetChanges };
