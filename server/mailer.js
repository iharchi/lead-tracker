require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

function generateApprovalEmail({ weekLabel, analysis, recommendations, approvalUrl, totalSpend, totalLeads }) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IH Lead Tracker - Weekly Strategy Brief</title>
</head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0d1f3c,#1e3a5f);border-radius:12px 12px 0 0;padding:32px;text-align:center;">
      <div style="display:inline-block;background:#d4af37;border-radius:8px;width:44px;height:44px;line-height:44px;text-align:center;font-weight:700;color:#0d1f3c;font-size:18px;margin-bottom:12px;">IH</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:600;">Daily Strategy Brief</h1>
      <p style="color:rgba(255,255,255,0.6);margin:6px 0 0;font-size:14px;">Isaak Harchi Real Estate · ${weekLabel}</p>
    </div>

    <!-- Metrics Bar -->
    <div style="background:#1e3a5f;padding:20px 32px;display:flex;justify-content:space-around;">
      <div style="text-align:center;">
        <div style="color:#d4af37;font-size:24px;font-weight:700;">${totalLeads}</div>
        <div style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Total Leads</div>
      </div>
      <div style="text-align:center;">
        <div style="color:#d4af37;font-size:24px;font-weight:700;">$${totalSpend}</div>
        <div style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Total Spend</div>
      </div>
      <div style="text-align:center;">
        <div style="color:#d4af37;font-size:24px;font-weight:700;">${totalLeads > 0 ? '$' + (parseFloat(totalSpend) / totalLeads).toFixed(2) : '—'}</div>
        <div style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Cost Per Lead</div>
      </div>
    </div>

    <!-- Analysis -->
    <div style="background:white;padding:32px;border-left:1px solid #ddd6c0;border-right:1px solid #ddd6c0;">
      <h2 style="color:#1e3a5f;font-size:16px;margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #d4af37;display:inline-block;">Claude's Analysis</h2>
      <div style="color:#4a5568;font-size:14px;line-height:1.8;white-space:pre-wrap;">${analysis}</div>
    </div>

    <!-- Recommended Budget Changes -->
    ${recommendations && recommendations.length > 0 ? `
    <div style="background:#f8f6f0;padding:32px;border:1px solid #ddd6c0;border-top:none;">
      <h2 style="color:#1e3a5f;font-size:16px;margin:0 0 16px;">Recommended Budget Changes</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1e3a5f;color:white;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;">Ad</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;">Current</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;">Recommended</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;">Reason</th>
          </tr>
        </thead>
        <tbody>
          ${recommendations.map((r, i) => `
          <tr style="background:${i % 2 === 0 ? 'white' : '#f8f6f0'};">
            <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#1e3a5f;">${r.adName}</td>
            <td style="padding:10px 12px;text-align:right;font-size:13px;color:#718096;">$${r.currentBudget}/day</td>
            <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:700;color:${r.newBudget > r.currentBudget ? '#2d7a4f' : '#c53030'};">$${r.newBudget}/day</td>
            <td style="padding:10px 12px;font-size:12px;color:#718096;">${r.reason}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- Approve Button -->
    <div style="background:white;padding:32px;text-align:center;border:1px solid #ddd6c0;border-top:none;">
      <p style="color:#4a5568;font-size:14px;margin:0 0 20px;">Click below to apply all recommended budget changes to your Meta ads automatically.</p>
      <a href="${approvalUrl}" style="display:inline-block;background:#d4af37;color:#0d1f3c;padding:16px 40px;border-radius:8px;font-weight:700;font-size:16px;text-decoration:none;letter-spacing:0.02em;">
        ✓ Apply Changes to Meta Ads
      </a>
      <p style="color:#a0aec0;font-size:12px;margin:16px 0 0;">This link expires in 48 hours. If you don't approve, no changes will be made.</p>
    </div>
    ` : `
    <div style="background:white;padding:32px;text-align:center;border:1px solid #ddd6c0;border-top:none;">
      <p style="color:#4a5568;font-size:14px;">No budget changes recommended this week. Keep running current campaigns.</p>
    </div>
    `}

    <!-- Footer -->
    <div style="background:#0d1f3c;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
      <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">
        © 2026 Isaak Harchi Real Estate · Twin Cities, Minneapolis<br>
        <a href="http://localhost:5173" style="color:#d4af37;text-decoration:none;">Open Dashboard</a>
      </p>
    </div>

  </div>
</body>
</html>`;

  return html;
}

async function sendApprovalEmail({ to, weekLabel, analysis, recommendations, approvalToken, totalSpend, totalLeads, baseUrl }) {
  const approvalUrl = `${baseUrl}/api/agent/approve/${approvalToken}`;

  const html = generateApprovalEmail({
    weekLabel,
    analysis,
    recommendations,
    approvalUrl,
    totalSpend,
    totalLeads,
  });

  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to,
    subject: `📊 Daily Strategy Brief — ${weekLabel}`,
    html,
  });

  return result;
}

module.exports = { sendApprovalEmail };
