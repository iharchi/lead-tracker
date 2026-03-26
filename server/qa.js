require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const META_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const AGENT_EMAIL = process.env.AGENT_EMAIL || 'harchi.isaak@gmail.com';

// Track sent alerts to avoid spamming (in-memory, resets on restart)
const sentAlerts = new Set();

function alertKey(type, detail) {
  const hour = new Date().toISOString().slice(0, 13); // unique per hour
  return `${type}:${detail}:${hour}`;
}

async function sendAlert(subject, body, severity = 'warning') {
  const icon = severity === 'critical' ? '🚨' : '⚠️';
  const color = severity === 'critical' ? '#c53030' : '#b7791f';
  const bg = severity === 'critical' ? '#fff5f5' : '#fef9e7';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:linear-gradient(135deg,#0d1f3c,#1e3a5f);border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
    <div style="font-size:32px;margin-bottom:8px;">${icon}</div>
    <h1 style="color:white;margin:0;font-size:18px;font-weight:600;">IH Lead Tracker Alert</h1>
    <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px;">Isaak Harchi Real Estate</p>
  </div>
  <div style="background:white;padding:28px 32px;border:1px solid #ddd6c0;border-top:none;">
    <div style="background:${bg};border:1px solid ${color};border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="color:${color};font-weight:700;margin:0 0 8px;font-size:15px;">${severity === 'critical' ? 'CRITICAL ISSUE' : 'WARNING'}</p>
      <p style="color:#4a5568;margin:0;font-size:14px;line-height:1.6;">${body}</p>
    </div>
    <a href="http://localhost:5173" style="display:inline-block;background:#1e3a5f;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open Dashboard</a>
    <a href="https://adsmanager.facebook.com" style="display:inline-block;margin-left:12px;background:#1877f2;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open Meta Ads</a>
  </div>
  <div style="background:#0d1f3c;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
    <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">© 2026 Isaak Harchi Real Estate · QA Monitor</p>
  </div>
</div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to: AGENT_EMAIL,
      subject: `${icon} ${subject}`,
      html,
    });
    console.log(`[QA] Alert sent: ${subject}`);
  } catch (e) {
    console.error('[QA] Failed to send alert:', e.message);
  }
}

// ─── Check 1: Meta Token Expiry ───────────────────────────────────────────────

async function checkTokenExpiry() {
  try {
    const url = `https://graph.facebook.com/debug_token?input_token=${META_TOKEN}&access_token=${META_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.data?.expires_at) {
      const expiresAt = new Date(data.data.expires_at * 1000);
      const daysLeft = Math.floor((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));

      if (daysLeft <= 3) {
        const key = alertKey('token_expiry', 'critical');
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendAlert(
            'Meta Access Token Expiring in ' + daysLeft + ' days',
            `Your Meta access token expires on ${expiresAt.toLocaleDateString()}. You need to generate a new token immediately or your ads sync and agent will stop working.`,
            'critical'
          );
        }
      } else if (daysLeft <= 7) {
        const key = alertKey('token_expiry', 'warning');
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendAlert(
            'Meta Access Token Expiring Soon',
            `Your Meta access token expires in ${daysLeft} days (${expiresAt.toLocaleDateString()}). Generate a new token soon to avoid interruption.`,
            'warning'
          );
        }
      }
    }
  } catch (e) {
    console.error('[QA] Token check failed:', e.message);
  }
}

// ─── Check 2: Ad Account Status ───────────────────────────────────────────────

async function checkAdAccount() {
  try {
    const url = `https://graph.facebook.com/v25.0/act_${META_AD_ACCOUNT_ID}?fields=account_status,disable_reason,amount_spent,spend_cap&access_token=${META_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      const key = alertKey('api_error', data.error.code);
      if (!sentAlerts.has(key)) {
        sentAlerts.add(key);
        await sendAlert(
          'Meta API Error',
          `Failed to connect to Meta Ads API: ${data.error.message}. Your ad data sync may be broken.`,
          'critical'
        );
      }
      return;
    }

    // Account status: 1=Active, 2=Disabled, 3=Unsettled, 7=Pending Review, 9=In Grace Period
    if (data.account_status !== 1) {
      const statusMap = { 2: 'Disabled', 3: 'Unsettled (payment issue)', 7: 'Pending Review', 9: 'In Grace Period' };
      const statusLabel = statusMap[data.account_status] || `Status ${data.account_status}`;
      const key = alertKey('account_status', data.account_status);
      if (!sentAlerts.has(key)) {
        sentAlerts.add(key);
        await sendAlert(
          'Meta Ad Account Issue: ' + statusLabel,
          `Your Meta ad account status is "${statusLabel}". This may prevent your ads from running. Check your billing and account settings immediately.`,
          'critical'
        );
      }
    }

    // Spend cap warning
    if (data.spend_cap && data.amount_spent) {
      const pctUsed = (parseFloat(data.amount_spent) / parseFloat(data.spend_cap)) * 100;
      if (pctUsed >= 90) {
        const key = alertKey('spend_cap', Math.floor(pctUsed));
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendAlert(
            'Ad Spend Cap Nearly Reached',
            `You've used ${pctUsed.toFixed(0)}% of your account spend cap ($${(parseFloat(data.amount_spent) / 100).toFixed(2)} of $${(parseFloat(data.spend_cap) / 100).toFixed(2)}). Your ads will stop running when the cap is hit.`,
            'critical'
          );
        }
      }
    }
  } catch (e) {
    console.error('[QA] Account check failed:', e.message);
  }
}

// ─── Check 3: Lead Generation Performance ────────────────────────────────────

async function checkAdPerformance() {
  try {
    const { query } = require('./db');

    // Check if any leads came in this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const entries = query('SELECT * FROM weekly_entries WHERE week_start >= ?', [weekStartStr]);
    const totalLeads = entries.reduce((s, e) => s + e.leads, 0);
    const totalSpend = entries.reduce((s, e) => s + e.spend, 0);
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...

    // Alert: Wednesday or later with zero leads this week
    if (dayOfWeek >= 3 && totalLeads === 0) {
      const key = alertKey('zero_leads_week', weekStartStr);
      if (!sentAlerts.has(key)) {
        sentAlerts.add(key);
        await sendAlert(
          'No Leads Yet This Week',
          `It's ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]} and you have 0 leads logged this week. Make sure to:

1. Post in Twin Cities Facebook Groups today
2. Check your Google LSA dashboard for any pending leads
3. Follow up with anyone who visited your website

Consistency this week is key to hitting your 20-lead monthly goal.`,
          'warning'
        );
      }
    }

    // Alert: Google LSA spend with no leads (if LSA data exists)
    const lsaEntry = entries.find(e => e.channel === 'Google Business');
    if (lsaEntry && lsaEntry.spend > 10 && lsaEntry.leads === 0) {
      const key = alertKey('lsa_zero_leads', weekStartStr);
      if (!sentAlerts.has(key)) {
        sentAlerts.add(key);
        await sendAlert(
          'Google LSA Spending With No Leads',
          `Your Google LSA has spent $${lsaEntry.spend.toFixed(2)} this week with 0 leads. Check your LSA dashboard at ads.google.com/local-services-ads to make sure your profile is approved and your service area is correct.`,
          'warning'
        );
      }
    }

    // Weekly goal check — Friday alert if behind pace
    if (dayOfWeek === 5) {
      const weeklyGoal = 5; // 20 leads/month = ~5/week
      if (totalLeads < 2) {
        const key = alertKey('behind_weekly_goal', weekStartStr);
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendAlert(
            'Behind on Weekly Lead Goal',
            `It's Friday and you have ${totalLeads} lead${totalLeads !== 1 ? 's' : ''} this week (goal: ${weeklyGoal}). This weekend, post in Facebook Groups, ask a past client for a referral, and make sure your Google Business profile has a recent post to boost visibility.`,
            'warning'
          );
        }
      }
    }

  } catch (e) {
    console.error('[QA] Performance check failed:', e.message);
  }
}

// ─── Check 4: Database Health ─────────────────────────────────────────────────

async function checkDatabaseHealth() {
  try {
    const { query } = require('./db');
    const entries = query('SELECT COUNT(*) as count FROM weekly_entries');
    console.log(`[QA] DB health OK — ${entries[0].count} entries`);
  } catch (e) {
    const key = alertKey('db_error', 'daily');
    if (!sentAlerts.has(key)) {
      sentAlerts.add(key);
      await sendAlert(
        'Database Error',
        `The lead tracker database is not responding: ${e.message}. Your data may not be saving correctly.`,
        'critical'
      );
    }
  }
}

// ─── Main QA Run ──────────────────────────────────────────────────────────────

async function runQA() {
  console.log('[QA] Running health checks...');
  await checkTokenExpiry();
  await checkAdAccount();
  await checkAdPerformance();
  await checkDatabaseHealth();
  console.log('[QA] Health checks complete');
}

module.exports = { runQA };
