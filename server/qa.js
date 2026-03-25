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

// ─── Check 3: Active Ads Performance ─────────────────────────────────────────

async function checkAdPerformance(db) {
  try {
    const { query } = require('./db');

    // Get last 7 days of data
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const url = `https://graph.facebook.com/v25.0/act_${META_AD_ACCOUNT_ID}/insights` +
      `?fields=ad_name,impressions,clicks,spend,actions` +
      `&time_range={"since":"${weekAgo}","until":"${today}"}` +
      `&level=ad&access_token=${META_TOKEN}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.error || !data.data) return;

    const ads = data.data;
    const totalSpend = ads.reduce((s, a) => s + parseFloat(a.spend || 0), 0);
    const totalLeads = ads.reduce((s, a) => {
      const la = (a.actions || []).find(x => x.action_type === 'lead');
      return s + parseInt(la?.value || 0);
    }, 0);

    // Alert: spending but zero leads for 3+ days
    if (totalSpend > 15 && totalLeads === 0) {
      const key = alertKey('zero_leads', 'week');
      if (!sentAlerts.has(key)) {
        sentAlerts.add(key);
        await sendAlert(
          'Spending Money With Zero Leads',
          `You've spent $${totalSpend.toFixed(2)} in the last 7 days but generated 0 leads. Your ads may need new creative or targeting adjustments. Check your lead form and ad setup.`,
          'critical'
        );
      }
    }

    // Alert: high CPL
    if (totalLeads > 0) {
      const cpl = totalSpend / totalLeads;
      if (cpl > 30) {
        const key = alertKey('high_cpl', Math.floor(cpl));
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendAlert(
            'High Cost Per Lead: $' + cpl.toFixed(2),
            `Your cost per lead is $${cpl.toFixed(2)} this week, which is above the $30 threshold. Consider pausing underperforming ads and shifting budget to your best performer.`,
            'warning'
          );
        }
      }
    }

    // Alert: no active ads running
    const activeUrl = `https://graph.facebook.com/v25.0/act_${META_AD_ACCOUNT_ID}/ads?fields=name,status&access_token=${META_TOKEN}`;
    const activeRes = await fetch(activeUrl);
    const activeData = await activeRes.json();
    const activeAds = (activeData.data || []).filter(a => a.status === 'ACTIVE');

    if (activeAds.length === 0) {
      const key = alertKey('no_active_ads', 'daily');
      if (!sentAlerts.has(key)) {
        sentAlerts.add(key);
        await sendAlert(
          'No Active Ads Running',
          `You currently have no active ads running. Your lead generation has stopped. Go to Meta Ads Manager to reactivate your campaigns.`,
          'critical'
        );
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
