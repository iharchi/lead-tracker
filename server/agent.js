require('dotenv').config();
const cron = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run } = require('./db');
const { sendApprovalEmail } = require('./mailer');
const { publishTodaysPost } = require('./poster');

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

  const prompt = `You are a real estate lead generation expert and content strategist for Isaak Harchi, a real estate agent in Twin Cities, Minneapolis.

FIRST: Use web search to research the following before writing any content:
1. Search "Minneapolis St Paul real estate market ${new Date().toLocaleDateString('en-US', {month:'long', year:'numeric'})}" for current market conditions
2. Search "Twin Cities home prices 2026" for latest pricing trends
3. Search "Minnesota mortgage rates today" for current rate info
4. Search "Minneapolis real estate news this week" for any relevant local news

Use the real data you find to make the Facebook posts and Google Business post accurate, timely, and valuable to local buyers and sellers.

CONTEXT:
- Meta paid ads are paused. Focus is 100% organic.
- Only active channel: Facebook Groups.
- Activating this week: Google Business Profile, Zillow.
- Next week: Google LSA ($25/month).

GOALS: 20 leads/month, 2 closed deals/year

CURRENT PERFORMANCE:
- Total leads: ${totalLeads}
- Total spend: $${totalSpend.toFixed(2)}
- Closed deals: ${deals.filter(d => d.status === 'closed').length} / 2

Provide your full response in this exact format:

## LEAD GENERATION ANALYSIS
[2-3 direct sentences on current status and biggest opportunity.]

## THIS WEEK'S PRIORITY ACTIONS
1. [Google Business — exact step]
2. [Facebook Groups — exact group and post strategy]
3. [Zillow — exact optimization]

## FACEBOOK GROUPS — 3 POSTS THIS WEEK
(Use real market data you searched for. Posts should feel like a knowledgeable local agent sharing genuine insights, not marketing copy.)

**Monday Post:**
[Complete post. 3-4 sentences. Lead with a real market stat or insight you found. Soft CTA. No hashtags.]

**Wednesday Post:**
[Complete post. Market trend or tip based on real data. Reference a specific Twin Cities neighborhood.]

**Friday Post:**
[Complete post. Personal angle or buyer/seller story. Ends with a question to drive engagement.]

**Post In These Groups:**
- [Real Twin Cities Facebook group]
- [Real Twin Cities Facebook group]
- [Real Twin Cities Facebook group]
- [Real Twin Cities Facebook group]

## GOOGLE BUSINESS POST THIS WEEK
[Complete post based on real market data. Under 280 chars. Includes a neighborhood and CTA.]

## ZILLOW PROFILE TIP THIS WEEK
[One specific action to improve visibility or capture leads on Zillow.]

## GOOGLE LSA SETUP — NEXT WEEK
[3 exact steps to activate Google LSA with the $25/month budget.]

## WEEKLY LEAD TARGET
- Facebook Groups: [X] leads
- Google Business: [X] leads
- Zillow: [X] leads
- Total: [X] leads

<recommendations>
[]
</recommendations>

Neighborhoods to reference: Edina, Eden Prairie, Plymouth, Minnetonka, Maple Grove, Burnsville, Bloomington, Chaska, Shakopee, Woodbury, Eagan. Sound like a real local expert, not a marketer.`;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  // Handle tool use blocks — extract the final text response
  const fullText = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

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

      // Auto-post to Facebook Page on Mon/Wed/Fri
      const postResult = await publishTodaysPost(analysis);
      if (postResult) {
        console.log(`[Agent] Facebook Page post published for ${postResult.dayName}`);
      }
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
