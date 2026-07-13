# Draft-Split Batch Optimizer — API + frontend

Your calculation logic now lives **only on the server** (`calc.js`). The
browser only sends form values and receives results as JSON — there is
nothing to reverse-engineer from "view source" anymore.

## What's in here

```
backend/
  calc.js        <- the physics/optimizer engine (server-side only, never sent to browser)
  defaults.js     <- default parameter values + request validation
  server.js       <- Express API (POST /api/optimize)
  package.json
  public/
    index.html    <- the frontend (same look as your original tool, calls the API)
```

## Run it locally first

```bash
cd backend
npm install
npm start
```

Then open `http://localhost:3000` in a browser — it should look and behave
exactly like your original file, except the math now happens server-side.

## Deploying for free

Any of these work fine for low traffic. All of them: connect your GitHub
repo (or upload the `backend/` folder), and they auto-detect Node from
`package.json`.

### Option A — Render.com (easiest)
1. Push the `backend/` folder to a GitHub repo.
2. On [render.com](https://render.com) → New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Free tier: the service sleeps after ~15 min idle and takes ~30-60s to
   wake on the next request — fine for low/occasional traffic.

### Option B — Railway.app
1. Push to GitHub, then on [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
2. It auto-detects `npm start`. Free tier gives a monthly usage credit
   rather than a hard sleep, so first-request latency is better than Render's
   free tier, but the credit can run out if traffic grows.

### Option C — Fly.io
1. Install the `flyctl` CLI, run `fly launch` inside `backend/`, accept the
   defaults (it writes a `Dockerfile`/`fly.toml` for you).
2. `fly deploy`. Free allowance covers a couple of small always-on VMs —
   no sleep/wake delay, but requires a card on file even on the free tier.

Any of these gives you a public URL like `https://your-app.onrender.com`.

## Important: CORS / same-origin

`public/index.html` is served *by the same server* as `/api/optimize`, so
it works out of the box on whichever host you pick — no CORS config needed.
If you ever split the frontend onto a different domain (e.g. GitHub Pages),
set `API_BASE` near the top of the `<script>` in `index.html` to your API's
full URL (e.g. `'https://your-app.onrender.com'`), since `cors()` is already
enabled server-side.

## Notes on the "force-balance solver" mode

That mode is inherently slow (~1-2s of real computation *per case*, same as
in your original tool — the UI even warns about it). To keep a free/shared
instance responsive for everyone:

- `server.js` caps solver-mode requests at **20 cases** total
  (combos × feed values × target values). Non-solver requests are capped
  much higher (4000).
- There's a simple per-IP rate limit (20 requests/minute) in `server.js` —
  adjust `max` in the `rateLimit` function if you need more.
- Requests are handled synchronously and will queue behind each other on a
  single instance; that's fine for low traffic, but if you expect several
  people running solver-mode batches at once, consider raising the
  free-tier instance to a paid one with more CPU, or moving the solver loop
  into a `worker_threads` pool.

## Verifying correctness

`calc.js` is a line-for-line port of the exact formulas from your original
file (`buildLengthDistribution`, `runSolver`, `machineCV`,
`actualDraftFromMechanical`, `optimizeOneCase`, etc.) — nothing was
re-derived or approximated. I cross-checked its output against the original
file's logic before wiring up the API.
