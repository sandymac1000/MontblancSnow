# 🏔️ Mont Blanc Valley — Snow Dashboard

Self-updating snow conditions dashboard for the Chamonix / Mont Blanc valley.

**Live data** scraped from [montblancnaturalresort.com/en/info-live](https://www.montblancnaturalresort.com/en/info-live) via a Vercel serverless function. Falls back to a hardcoded snapshot if the scrape fails.

## Architecture

```
Browser (React)  →  /api/snow  →  montblancnaturalresort.com
   (Vite SPA)      (Vercel       (server-side fetch,
                   serverless)    no CORS issues)
```

- **Frontend**: React + Vite, dark alpine UI
- **API**: Single serverless function (`/api/snow.js`) that fetches MBNR, strips HTML, parses snow data with regex, returns JSON
- **Caching**: Vercel edge caches the API response for 30 minutes (`s-maxage=1800`)
- **Fallback**: Hardcoded Feb 16 2026 snapshot if API fails

## Resorts Covered

| Resort | Source | Live? |
|--------|--------|-------|
| Chamonix (Brévent, Flégère, Grands Montets, Aiguille du Midi) | MBNR | ✅ |
| Vallorcine (Balme/Le Tour) | MBNR | ✅ |
| Saint-Gervais (Les Houches, Tramway) | MBNR | ✅ |
| Les Contamines | — | ❌ Snapshot |
| Combloux | — | ❌ Snapshot |

---

## 🚀 Deployment: GitHub → Vercel

### Prerequisites
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (free tier is fine — sign in with GitHub)

### Step 1: Create GitHub Repo

**Option A — Via GitHub web UI:**
1. Go to [github.com/new](https://github.com/new)
2. Name it `snow-dashboard` (or whatever you like)
3. Keep it **Private** (or Public, your choice)
4. Don't add README/gitignore (we have our own)
5. Click **Create repository**

**Option B — Via command line (if you have `gh` CLI):**
```bash
gh repo create snow-dashboard --private
```

### Step 2: Push Code

Unzip this project, then:

```bash
cd snow-dashboard
git init
git add .
git commit -m "Initial snow dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/snow-dashboard.git
git push -u origin main
```

### Step 3: Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import** next to your `snow-dashboard` repo
3. Vercel auto-detects Vite — accept the defaults:
   - **Framework Preset**: Vite
   - **Build Command**: `vite build`
   - **Output Directory**: `dist`
4. Click **Deploy**
5. Wait ~60 seconds → you get a URL like `snow-dashboard-xxxxx.vercel.app`

That's it. The dashboard is live and self-updating.

### Step 4 (Optional): Custom Domain

In Vercel dashboard → your project → **Settings** → **Domains** → add your custom domain.

---

## Local Development

```bash
npm install
npm run dev
```

Note: `/api/snow` won't work locally in dev mode (it's a Vercel serverless function). The app will fall back to the snapshot. To test the API locally, install the Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

This runs both Vite and the serverless function locally.

---

## Updating the Snapshot

The hardcoded fallback data lives in `src/App.jsx` in the `FALLBACK` constant. To update it, ask Claude to scrape fresh data and update those values.

## Extending

To add Les Contamines live data, create `api/snow-contamines.js` that scrapes `lescontamines.net` and have the frontend call both endpoints.
