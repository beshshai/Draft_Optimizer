// calc.js
// Verbatim port of the physics/optimizer logic from
// drafting-batch-optimizer.html — same formulas, same constants, no DOM.

const LB144 = 144;

// ============================================================
// CORE PHYSICS — copied from drafting-zone-model_9_2_1.html
// ============================================================
function buildLengthDistribution(distType, mean, std, lmin, lmax, nGroups) {
  const dl = (lmax - lmin) / nGroups;
  const li = [];
  for (let k = 0; k < nGroups; k++) li.push(lmin + (k + 0.5) * dl);
  let Pn = new Array(nGroups).fill(0);
  if (distType === 'uniform') {
    Pn = Pn.map(() => 1);
  } else if (distType === 'equal') {
    let idx = 0, best = Infinity;
    li.forEach((l, k) => { const d = Math.abs(l - mean); if (d < best) { best = d; idx = k; } });
    Pn[idx] = 1;
  } else {
    for (let k = 0; k < nGroups; k++) { const z = (li[k] - mean) / std; Pn[k] = Math.exp(-0.5 * z * z); }
  }
  const sum = Pn.reduce((a, b) => a + b, 0) || 1;
  Pn = Pn.map((v) => v / sum);
  return { li, dl, Pn };
}

function crossSectionDist(li, Pn) {
  const weighted = li.map((l, k) => l * Pn[k]);
  const wsum = weighted.reduce((a, b) => a + b, 0) || 1;
  return weighted.map((w) => w / wsum);
}

function pressureProfile(xGrid, G, pBack, pFront, pFloor, nipFrac) {
  const w = Math.max(nipFrac * G, 1e-6);
  return xGrid.map((x) => pFloor + pBack * Math.exp(-x / w) + pFront * Math.exp(-(G - x) / w));
}

function cumulativeTrapz(yArr, dx) {
  const cum = [0];
  for (let i = 1; i < yArr.length; i++) cum.push(cum[i - 1] + (yArr[i - 1] + yArr[i]) / 2 * dx);
  return cum;
}

function interpAt(xGrid, arr, x) {
  if (x <= xGrid[0]) return arr[0];
  if (x >= xGrid[xGrid.length - 1]) return arr[arr.length - 1];
  const dx = xGrid[1] - xGrid[0];
  const idx = Math.min(arr.length - 2, Math.max(0, Math.floor((x - xGrid[0]) / dx)));
  const t = (x - xGrid[idx]) / dx;
  return arr[idx] * (1 - t) + arr[idx + 1] * t;
}

function runSolver(P, initMode) {
  const { G, d, nGroups, nGrid, tol, maxIter } = P;
  const { li, Pn } = buildLengthDistribution(P.distType, P.mean, P.std, P.lmin, P.lmax, nGroups);
  const Pm = crossSectionDist(li, Pn);
  const dx = G / (nGrid - 1);
  const xGrid = []; for (let i = 0; i < nGrid; i++) xGrid.push(i * dx);
  const pArr = pressureProfile(xGrid, G, P.pBack, P.pFront, P.pFloor, P.nipFrac);
  let xi = li.map((l) => (initMode === 'forward' ? G : Math.min(l, G)));
  const flags = { early: new Set(), late: new Set(), multi: new Set() };
  let iterUsed = maxIter;
  for (let iter = 0; iter < maxIter; iter++) {
    const Rs = new Array(nGrid).fill(0);
    for (let k = 0; k < nGroups; k++) {
      const Sh = xi[k], St = Math.max(0, Sh - li[k]);
      const w = Pm[k];
      if (w === 0) continue;
      for (let g = 0; g < nGrid; g++) {
        const x = xGrid[g];
        let f; if (x <= St) f = 1; else if (x >= Sh) f = 0; else f = 1 - (x - St) / (Sh - St);
        Rs[g] += f * w;
      }
    }
    const Rf = Rs.map((rs) => (1 - rs) / d);
    const gF = new Array(nGrid), gS = new Array(nGrid);
    for (let g = 0; g < nGrid; g++) {
      const denom = Rs[g] + Rf[g] || 1e-9;
      gF[g] = (Rf[g] / denom) * pArr[g];
      gS[g] = (Rs[g] / denom) * pArr[g];
    }
    const cumF = cumulativeTrapz(gF, dx);
    const cumS = cumulativeTrapz(gS, dx);
    let maxDelta = 0;
    const newXi = new Array(nGroups);
    flags.early.clear(); flags.late.clear(); flags.multi.clear();
    for (let k = 0; k < nGroups; k++) {
      const l = li[k];
      const chiAt = (x) => (interpAt(xGrid, cumF, x) - interpAt(xGrid, cumF, Math.max(0, x - l))) -
        (interpAt(xGrid, cumS, x) - interpAt(xGrid, cumS, Math.max(0, x - l)));
      if (chiAt(l) >= 0) { flags.early.add(k); newXi[k] = l; continue; }
      let found = false, xNew = G;
      let prevChi = chiAt(l);
      const startIdx = Math.max(0, Math.ceil(l / dx));
      for (let g = startIdx; g < nGrid; g++) {
        const x = xGrid[g];
        if (x < l) continue;
        const c = chiAt(x);
        if (c >= 0) {
          if (c - prevChi !== 0) { xNew = x - dx * (c / (c - prevChi)); } else { xNew = x; }
          found = true;
          for (let g2 = g + 1; g2 < nGrid; g2++) { if (chiAt(xGrid[g2]) < 0) { flags.multi.add(k); break; } }
          break;
        }
        prevChi = c;
      }
      if (!found) { flags.late.add(k); xNew = G; }
      newXi[k] = Math.min(Math.max(xNew, l), G);
    }
    const alpha = 0.15;
    for (let k = 0; k < nGroups; k++) {
      const blended = (1 - alpha) * xi[k] + alpha * newXi[k];
      maxDelta = Math.max(maxDelta, Math.abs(blended - xi[k]));
      xi[k] = blended;
    }
    if (maxDelta < tol * G / 100) { iterUsed = iter + 1; break; }
  }
  const degenerate = (initMode === 'forward' && iterUsed <= 1 && flags.late.size > 0);
  return { li, Pn, Pm, xi, xGrid, dx, flags, iterUsed, degenerate };
}

function machineCV(cvIn, n, draft, cvAccel, draftRef, cvInherent) {
  const cvDoubled = cvIn / Math.sqrt(Math.max(n, 1));
  const cvAccelEff = Math.max(draft, 1e-9) / Math.sqrt((Math.max(n, 1)) * (cvAccel));
  const inh = cvInherent || 0;
  const cvAdd = Math.sqrt(Math.pow(inh, 2) + Math.pow(cvAccelEff, 2));
  return Math.sqrt(Math.pow(cvAdd, 2) + Math.pow(cvDoubled, 2));
}

function actualDraftFromMechanical(draftMech, wastagePct) {
  const w = Math.max(0, Math.min(99, wastagePct || 0));
  return draftMech * 100 / (100 - w);
}

// ============================================================
// BATCH ENGINE
// ============================================================
function parseList(str) {
  return String(str || '').split(',').map((s) => parseFloat(s.trim())).filter((v) => Number.isFinite(v) && v > 0);
}

// solver-derived accel-CV cache, keyed per-request (created fresh per run)
function makeSolverAccelCV(P) {
  const cache = new Map();
  function solverBaseParams(m) {
    const mp = 'm' + m;
    const G = P[mp + 'Gauge'];
    return {
      G,
      distType: P[mp + 'DistType'],
      mean: P[mp + 'Mean'], std: P[mp + 'Std'],
      lmin: P[mp + 'Lmin'], lmax: Math.min(P[mp + 'Lmax'], G),
      pBack: P[mp + 'PBack'], pFront: P[mp + 'PFront'], pFloor: P[mp + 'PFloor'],
      nipFrac: P[mp + 'NipW'] / 100,
      tol: P[mp + 'Tol'], maxIter: P[mp + 'MaxIter'],
      nGroups: 70, nGrid: 140,
    };
  }
  return function solverAccelCV(m, draft) {
    const key = m + ':' + draft.toFixed(2);
    if (cache.has(key)) return cache.get(key).cv;
    const base = solverBaseParams(m);
    const sp = Object.assign({}, base, { d: draft });
    let cv, reason = '';
    try {
      const fwd = runSolver(sp, 'forward');
      const { li, Pm, xi, flags, iterUsed } = fwd;
      const mean_x = li.reduce((a, l, k) => a + xi[k] * Pm[k], 0);
      const var_x = li.reduce((a, l, k) => a + Pm[k] * Math.pow(xi[k] - mean_x, 2), 0);
      cv = Math.sqrt(var_x) / mean_x * 100;
      const lateFrac = flags.late.size / li.length;
      if (lateFrac > 0.15) {
        cv = NaN;
        reason = (iterUsed >= sp.maxIter) ? 'solver did not converge' : 'beyond draft ceiling';
      }
    } catch (e) { cv = NaN; reason = 'solver error'; }
    cache.set(key, { cv, reason });
    return cv;
  };
}

function evalSplit(D1, D2, D3, P, m1N, m2N, m3N, solverAccelCV) {
  let m1A = P.m1A, m2A = P.m2A, m3A = P.m3A;
  if (P.useSolver) {
    const a1 = solverAccelCV(1, D1), a2 = solverAccelCV(2, D2), a3 = solverAccelCV(3, D3);
    if (Number.isNaN(a1) || Number.isNaN(a2) || Number.isNaN(a3)) return Infinity;
    m1A = a1; m2A = a2; m3A = a3;
  }
  const d1a = actualDraftFromMechanical(D1, P.m1W);
  const d2a = actualDraftFromMechanical(D2, P.m2W);
  const d3a = actualDraftFromMechanical(D3, P.m3W);
  const o1 = machineCV(P.m1In, m1N, d1a, m1A, P.D1min, P.m1I);
  const o2 = machineCV(o1, m2N, d2a, m2A, P.D2min, P.m2I);
  const o3 = machineCV(o2, m3N, d3a, m3A, P.D3min, P.m3I);
  return o3;
}

// Returns {feasible, D1,D2,D3,cv,K, reason}
function optimizeOneCase(n1, n2, n3, ld0, ldTargetRaw, P, mode, solverAccelCV) {
  mode = mode || 'min';
  const ldTarget = ldTargetRaw / LB144;
  const wKeep = (1 - Math.max(0, Math.min(99, P.m1W)) / 100) * (1 - Math.max(0, Math.min(99, P.m2W)) / 100) * (1 - Math.max(0, Math.min(99, P.m3W)) / 100);
  const K = ld0 * n1 * n2 * n3 * wKeep / Math.max(ldTarget, 1e-9);

  const MAX_MARGIN = 0.97;
  const mbFloor1 = n1 * (1 - Math.max(0, Math.min(99, P.m1W)) / 100);
  const mbFloor2 = n2 * (1 - Math.max(0, Math.min(99, P.m2W)) / 100);
  const mbFloor3 = n3 * (1 - Math.max(0, Math.min(99, P.m3W)) / 100);
  const D1min = Math.max(P.D1min, mbFloor1), D1max = P.D1max * MAX_MARGIN;
  const D2min = Math.max(P.D2min, mbFloor2), D2max = P.D2max * MAX_MARGIN;
  const D3min = Math.max(P.D3min, mbFloor3), D3max = P.D3max * MAX_MARGIN;

  if (D1min > D1max || D2min > D2max || D3min > D3max) {
    return { feasible: false, K, reason: `Mass-balance floor exceeds this machine's own draft ceiling (M1 floor ${mbFloor1.toFixed(2)}x vs max ${D1max.toFixed(2)}x, M2 floor ${mbFloor2.toFixed(2)}x vs max ${D2max.toFixed(2)}x, M3 floor ${mbFloor3.toFixed(2)}x vs max ${D3max.toFixed(2)}x) — this doublings/wastage combination can't run on this machine's slider range at all.` };
  }
  if (P.fixD1 && (Number.isNaN(P.fixD1Val) || P.fixD1Val < D1min || P.fixD1Val > D1max)) {
    return { feasible: false, K, reason: `Fixed M1 draft ${Number.isNaN(P.fixD1Val) ? '' : P.fixD1Val.toFixed(2) + 'x '}is outside M1's range for this case (${D1min.toFixed(2)}-${D1max.toFixed(2)}x, mass-balance floor = ${n1}x(1-${P.m1W.toFixed(1)}%) = ${mbFloor1.toFixed(2)}x).` };
  }
  const GAP_12 = 1 + P.gap12 / 100;
  const GAP_23 = 1 + P.gap23 / 100;

  const Kmin = (P.fixD1 ? P.fixD1Val : D1min) * D2min * D3min;
  const Kmax = (P.fixD1 ? P.fixD1Val : D1max) * D2max * D3max;
  if (K < Kmin || K > Kmax) {
    return { feasible: false, K, reason: `Required combined draft K=${K.toFixed(2)} is outside reachable range [${Kmin.toFixed(2)}, ${Kmax.toFixed(2)}] once each machine's mass-balance floor is applied (M1>=${D1min.toFixed(2)}x, M2>=${D2min.toFixed(2)}x, M3>=${D3min.toFixed(2)}x).` };
  }

  const N = P.useSolver ? 30 : P.gridN;
  let best = null;
  const D1Grid = P.fixD1 ? [P.fixD1Val] : Array.from({ length: N }, (_, i) => D1min * Math.pow(D1max / D1min, i / (N - 1)));
  for (const D1 of D1Grid) {
    const d2lo = Math.max(D2min, K / (D1 * D3max), D1 * GAP_12);
    const d2hi = Math.min(D2max, K / (D1 * D3min));
    if (d2lo >= d2hi) continue;
    const steps = P.useSolver ? 12 : 40;
    for (let j = 0; j < steps; j++) {
      const D2 = d2lo * Math.pow(d2hi / Math.max(d2lo, 1e-9), j / (steps - 1));
      const D3 = K / (D1 * D2);
      if (D3 < D3min || D3 > D3max) continue;
      if (!(D2 >= D1 * GAP_12 && D3 >= D2 * GAP_23)) continue;
      const cv3 = evalSplit(D1, D2, D3, P, n1, n2, n3, solverAccelCV);
      const better = mode === 'max' ? (best === null || cv3 > best.cv) : (best === null || cv3 < best.cv);
      if (better) best = { D1, D2, D3, cv: cv3 };
    }
  }
  if (!best) {
    return { feasible: false, K, reason: 'No D1/D2/D3 triple satisfies the min-gap constraints for this K.' };
  }
  return { feasible: true, K, D1: best.D1, D2: best.D2, D3: best.D3, cv: best.cv };
}

// Runs the full batch synchronously and returns the results array
// (equivalent of runBatch()'s allResults, without the UI chunking).
function runBatch({ combos, feeds, targets, P, mode }) {
  const solverAccelCV = makeSolverAccelCV(P);
  const results = [];
  for (const n of combos) {
    const [n1, n2, n3] = n;
    for (const f of feeds) {
      for (const t of targets) {
        const res = optimizeOneCase(n1, n2, n3, f, t, P, mode, solverAccelCV);
        results.push({
          label: `${n1}.${n2}.${n3}`,
          n1, n2, n3,
          feed: f, target: t,
          K: res.K,
          D1: res.feasible ? res.D1 : null,
          D2: res.feasible ? res.D2 : null,
          D3: res.feasible ? res.D3 : null,
          gap12: res.feasible ? (res.D2 / res.D1 - 1) * 100 : null,
          gap23: res.feasible ? (res.D3 / res.D2 - 1) * 100 : null,
          cv: res.feasible ? res.cv : null,
          feasible: res.feasible,
          reason: res.reason || '',
        });
      }
    }
  }
  return results;
}

module.exports = { runBatch, optimizeOneCase, parseList, LB144 };
