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

async function saveWeeklyData(week_label, week_start, channelData) {
  console.log('[Agent] Saving weekly data to DB');
  run('DELETE FROM weekly_entries WHERE week_start = ?', [week_start]);
  const CHANNELS = ['Facebook Buyer Ad', 'Facebook Seller Ad', 'Zillow', 'Google Business', 'Facebook Groups', 'Website'];
  for (const channel of CHANNELS) {
    const d = channelData[channel] || { impressions: 0, clicks: 0, leads: 0, spend: 0 };
    run('INSERT INTO weekly_entries (week_label, week_start, channel, impressions, clicks, leads, spend) VALUES (?,?,?,?,?,?,?)',
      [week_label, week_start, channel, d.impressions, d.clicks, d.leads, d.spend]);
  }
}

async function getAdBudgets() {
  const url = `https://graph.facebook.com/v25.0/act_${META_AD_ACCOUNT_ID}/ads` +
    `?fields=id,name,status,adset{daily_budget,name}` +
    `&access_token=${META_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API budgets: ${data.error.message}`);
  return data.data || [];
}

async function analyzeAndRecommend(channelData, rawAds) {
  console.log('[Agent] Running Claude analysis');
  const allEntries = query('SELECT * FROM weekly_entries ORDER BY week_start DESC');
  const deals = query('SELECT * FROM deals');
  const totalLeads = allEntries.reduce((s, e) => s + e.leads, 0);
  const totalSpend = allEntries.reduce((s, e) => s + e.spend, 0);

  const byChannel = {};
  for (const e of allEntries) {
    if (!byChannel[e.channel]) byChannel[e.channel] = { leads: 0, spend: 0, clicks: 0, impressions: 0 };
    byChannel[e.channel].leads += e.leads;
    byChannel[e.channel].spend += e.spend;
    byChannel[e.channel].clicks += e.clicks;
    byChannel[e.channel].impressions += e.impressions;
  }

  const channelSummary = Object.entries(byChannel).map(([ch, d]) => ({
    channel: ch, leads: d.leads, spend: d.spend.toFixed(2),
    cpl: d.leads > 0 ? (d.spend / d.leads).toFixed(2) : 'N/A',
    ctr: d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) + '%' : 'N/A',
  }));

  let adBudgets = [];
  try { adBudgets = await getAdBudgets(); } catch (e) { console.warn('[Agent] Could not fetch ad budgets:', e.message); }

  const bestChannel = channelSummary.sort((a, b) => parseFloat(b.ctr) - parseFloat(a.ctr))[0];

  const prompt = `You are a real estate lead generation expert for Isaak Harchi, a real estate agent in Twin Cities, Minneapolis.

CONTEXT:
- Isaak spent $100 on Meta ads and got only 2 low-quality leads. Meta paid ads are paused.
- Focus is now on Google LSA, organic channels, and relationship-based lead gen.
- Budget: $25/month Google LSA only. All other channels are free/organic.

GOALS: 20 leads/month, 2 closed deals/year

PERFORMANCE THIS WEEK:
- Total leads: ${totalLeads} / 20 goal
- Total spend: $${totalSpend.toFixed(2)}
- CPL: ${totalLeads > 0 ? '$' + (totalSpend / totalLeads).toFixed(2) : 'N/A'}
- Closed deals: ${deals.filter(d => d.status === 'closed').length} / 2

CHANNEL DATA:
${JSON.stringify(channelSummary, null, 2)}

BEST PERFORMING CHANNEL: ${bestChannel?.channel || 'Google Business'} (CTR: ${bestChannel?.ctr || 'N/A'})

ACTIVE CHANNELS TO OPTIMIZE:
1. Google LSA ($25/month) - High intent buyers/sellers searching "realtor Minneapolis"
2. Google Business Profile (free) - Local SEO, reviews, posts
3. Facebook Groups (free) - Twin Cities real estate groups, community engagement
4. Website (free) - HubSpot lead capture forms, organic traffic
5. Zillow (free profile) - Profile optimization, reviews

Provide your response in this exact format:

## ANALYSIS
[2-3 sentences analyzing what channels are driving leads and what needs attention. Be specific to the data above.]

## THREE PRIORITY ACTIONS FOR THIS WEEK
1. [Specific action for Google LSA or Google Business — exact steps]
2. [Specific action for Facebook Groups — exact post idea or engagement tactic]
3. [Specific action for website or Zillow — exact optimization step]

## GOOGLE LSA OPTIMIZATION
**Current Status:** [assessment based on spend and leads]
**This Week's Focus:** [1 specific thing to improve LSA performance]
**Bid Strategy:** [recommendation on budget allocation]

## FACEBOOK GROUPS CONTENT PLAN
**Post 1 (Monday):**
[Exact post to write — topic, hook, 2-3 sentences, call to action. Reference Twin Cities neighborhoods.]

**Post 2 (Wednesday):**
[Exact post to write — different angle, educational or market update, Twin Cities specific.]

**Post 3 (Friday):**
[Exact post to write — personal/story based, builds trust and relatability.]

**Groups to Post In:**
- [Specific Twin Cities Facebook group name]
- [Specific Twin Cities Facebook group name]
- [Specific Twin Cities Facebook group name]

## GOOGLE BUSINESS POST THIS WEEK
[Exact text for a Google Business post — under 300 chars, includes a call to action, Twin Cities specific]

## WEEKLY GOAL
Based on current trajectory, Isaak should aim for [X] leads this week from these specific sources: [list sources and expected leads from each].

<recommendations>
[]
</recommendations>

Be hyper-specific to Twin Cities. Reference real neighborhoods: Edina, Eden Prairie, Plymouth, Minnetonka, Maple Grove, Burnsville, Bloomington, Chaska, Shakopee. No generic advice.`;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullText = message.content[0].text;

  let recommendations = [];
  const recoMatch = fullText.match(/<recommendations>([\s\S]*?)<\/recommendations>/);
  if (recoMatch) {
    try { recommendations = JSON.parse(recoMatch[1].trim()); } catch (e) { console.warn('[Agent] Could not parse recommendations'); }
  }

  const analysis = fullText.replace(/<recommendations>[\s\S]*?<\/recommendations>/, '').trim();
  console.log(`[Agent] Analysis complete. ${recommendations.length} budget changes recommended`);
  return { analysis, recommendations, totalLeads, totalSpend: totalSpend.toFixed(2) };
}

function storeApprovalToken(token, recommendations) {
  run(`CREATE TABLE IF NOT EXISTS approval_tokens (
    token TEXT PRIMARY KEY, recommendations TEXT,
    status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now'))
  )`, []);
  run('DELETE FROM approval_tokens WHERE created_at < datetime("now", "-2 days")', []);
  run('INSERT INTO approval_tokens (token, recommendations) VALUES (?, ?)', [token, JSON.stringify(recommendations)]);
}

async function applyBudgetChanges(recommendations) {
  console.log(`[Agent] Applying ${recommendations.length} budget changes`);
  const results = [];
  for (const rec of recommendations) {
    try {
      if (rec.action === 'pause') {
        const res = await fetch(`https://graph.facebook.com/v25.0/${rec.adId}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PAUSED', access_token: META_TOKEN }),
        });
        const data = await res.json();
        results.push({ ad: rec.adName, action: 'paused', success: !data.error });
      } else {
        const budgetCents = Math.round(rec.newBudget * 100);
        const adRes = await fetch(`https://graph.facebook.com/v25.0/${rec.adId}?fields=adset_id&access_token=${META_TOKEN}`);
        const adData = await adRes.json();
        if (adData.adset_id) {
          const res = await fetch(`https://graph.facebook.com/v25.0/${adData.adset_id}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ daily_budget: budgetCents, access_token: META_TOKEN }),
          });
          const data = await res.json();
          results.push({ ad: rec.adName, action: rec.action, newBudget: rec.newBudget, success: !data.error });
        }
      }
    } catch (e) {
      results.push({ ad: rec.adName, action: rec.action, success: false, error: e.message });
    }
  }
  return results;
}

async function runAgent() {
  console.log('\n[Agent] ========== Starting daily run ==========');
  const { week_start, week_end, week_label } = getWeekRange();
  try {
    // Meta ads are paused — skip Meta sync, use manually entered data only
    const channelData = {};
    const rawAds = [];
    const { analysis, recommendations, totalLeads, totalSpend } = await analyzeAndRecommend(channelData, rawAds);
    const token = uuidv4();
    storeApprovalToken(token, recommendations);
    if (process.env.RESEND_API_KEY) {
      await sendApprovalEmail({
        to: AGENT_EMAIL, weekLabel: week_label, analysis, recommendations,
        approvalToken: token, totalSpend, totalLeads, baseUrl: BASE_URL,
      });
      console.log(`[Agent] Email sent to ${AGENT_EMAIL}`);
    } else {
      console.log('[Agent] Analysis:\n', analysis);
    }
    console.log('[Agent] ========== Daily run complete ==========\n');
  } catch (err) {
    console.error('[Agent] Run failed:', err.message);
  }
}

// Only auto-start if run directly (node agent.js), not when required by server
if (require.main === module) {
  initDb().then(() => {
    run(`CREATE TABLE IF NOT EXISTS approval_tokens (
      token TEXT PRIMARY KEY, recommendations TEXT,
      status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now'))
    )`, []);
    runAgent();
    cron.schedule('0 8 * * *', () => { console.log('[Agent] Scheduled run'); runAgent(); });
    console.log('[Agent] Scheduled daily at 8:00 AM');
  }).catch(err => { console.error('[Agent] DB init failed:', err); process.exit(1); });
}

module.exports = { runAgent, applyBudgetChanges };
