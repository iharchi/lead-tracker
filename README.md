# IH Lead Tracker

Lead generation tracking app for Isaak Harchi Real Estate — Twin Cities, Minneapolis.

## Quick Start

### 1. Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### 2. Set up environment
```bash
cp server/.env.example server/.env
# Edit server/.env and add your ANTHROPIC_API_KEY
```

### 3. Run the app (two terminals)
```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend
cd client && npm run dev
```

Open http://localhost:5173

## Features
- Weekly data entry per channel (impressions, clicks, leads, spend)
- Dashboard with goal progress bars (20 leads, 2 deals)
- Channel status pills (Live, In Review, Pending, Paused)
- Weekly history table with expandable rows
- Deals tracker for buyer/seller pipeline
- AI Analysis using Claude Sonnet — tactical recommendations

## Channels
- Facebook Buyer Ad
- Facebook Seller Ad
- Zillow
- Google Business
- Facebook Groups
- Website

## Budget
- Facebook Ads: $75/month
- Google LSA: $25/month

## Deploy to Vercel
1. Push to GitHub
2. Import repo in Vercel
3. Set ANTHROPIC_API_KEY in Vercel environment variables
4. Deploy
