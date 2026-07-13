const express = require('express');
const cors = require('cors');
const path = require('path');
const { runBatch, parseList } = require('./calc');
const { DEFAULT_COMBOS, DEFAULT_FEED_LIST, DEFAULT_TARGET_LIST, buildParams } = require('./defaults');

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- light rate limiting: protects a small/free instance from abuse ---
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60_000;
  const max = 20;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return res.status(429).json({ error: 'Too many requests — please slow down.' });
  arr.push(now);
  hits.set(ip, arr);
  next();
}

function parseCombos(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_COMBOS;
  const out = [];
  for (const c of raw) {
    if (!Array.isArray(c) || c.length !== 3) throw new Error('Each combo must be an array of 3 numbers, e.g. [2,3,2].');
    const [a, b, d] = c.map(Number);
    if (![a, b, d].every((v) => Number.isFinite(v) && v >= 1)) throw new Error('Combo values must be positive numbers.');
    out.push([a, b, d]);
  }
  return out;
}

app.post('/api/optimize', rateLimit, (req, res) => {
  try {
    const body = req.body || {};
    const P = buildParams(body);
    const combos = parseCombos(body.combos);
    const feeds = parseList(body.feedList !== undefined ? body.feedList : DEFAULT_FEED_LIST);
    const targets = parseList(body.targetList !== undefined ? body.targetList : DEFAULT_TARGET_LIST);
    if (feeds.length === 0 || targets.length === 0) {
      return res.status(400).json({ error: 'Enter at least one valid feed LD and target LD.' });
    }
    const mode = body.mode === 'max' ? 'max' : 'min';

    const caseCount = combos.length * feeds.length * targets.length;
    const MAX_CASES = P.useSolver ? 20 : 4000; // solver mode is very CPU-heavy per case (~1-2s each)
    if (caseCount > MAX_CASES) {
      return res.status(400).json({
        error: `This request has ${caseCount} cases, which is above the limit of ${MAX_CASES}${P.useSolver ? ' while the force-balance solver is on' : ''}. Reduce your combo/feed/target lists${P.useSolver ? ', or turn off the solver for a fast analytical sweep.' : '.'}`,
      });
    }

    const results = runBatch({ combos, feeds, targets, P, mode });
    res.json({
      mode,
      caseCount,
      feasibleCount: results.filter((r) => r.feasible).length,
      results,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Optimization failed.' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Batch optimizer API listening on :${PORT}`));
