// defaults.js — mirrors the pre-filled values in the original HTML form.

const DEFAULTS = {
  m1In: 10.35,
  gap12: 48, gap23: 20, gridN: 140,
  m1W: 2.9, m1A: 0.10, m1I: 0.50,
  m2W: 2.9, m2A: 0.40, m2I: 5.70,
  m3W: 2.9, m3A: 0.40, m3I: 5.70,
  m1Dmin: 3.3, m1Dmax: 4.3,
  m2Dmin: 4, m2Dmax: 6.5,
  m3Dmin: 8.5, m3Dmax: 9.5,
  fixD1: false, fixD1Val: 4.00,
  useSolver: false,
  m1Gauge: 335, m1DistType: 'peak', m1Mean: 145, m1Std: 95, m1Lmin: 30.5, m1Lmax: 396.6,
  m1PBack: 300, m1PFront: 300, m1PFloor: 2.00, m1NipW: 3, m1Tol: 0.01, m1MaxIter: 120,
  m2Gauge: 335, m2DistType: 'peak', m2Mean: 130, m2Std: 80, m2Lmin: 29.6, m2Lmax: 330.4,
  m2PBack: 300, m2PFront: 300, m2PFloor: 2.44, m2NipW: 3, m2Tol: 0.01, m2MaxIter: 120,
  m3Gauge: 335, m3DistType: 'peak', m3Mean: 125, m3Std: 80, m3Lmin: 30.2, m3Lmax: 327.7,
  m3PBack: 300, m3PFront: 300, m3PFloor: 2.68, m3NipW: 3, m3Tol: 0.01, m3MaxIter: 120,
};

const DEFAULT_COMBOS = [[2, 3, 2], [2, 4, 1], [4, 3, 2], [4, 4, 1], [4, 4, 2]];
const DEFAULT_FEED_LIST = '16.5';
const DEFAULT_TARGET_LIST = '163';

const NUMERIC_KEYS = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'number');

function buildParams(body) {
  const P = { ...DEFAULTS };
  for (const k of NUMERIC_KEYS) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
      const v = Number(body[k]);
      if (!Number.isFinite(v)) throw new Error(`Field "${k}" must be a number.`);
      P[k] = v;
    }
  }
  for (const k of ['m1DistType', 'm2DistType', 'm3DistType']) {
    if (body[k] && ['peak', 'uniform', 'equal'].includes(body[k])) P[k] = body[k];
  }
  if (body.fixD1 !== undefined) P.fixD1 = !!body.fixD1;
  if (body.useSolver !== undefined) P.useSolver = !!body.useSolver;
  if (body.gridN !== undefined) P.gridN = Math.max(10, parseInt(body.gridN, 10) || 140);

  // calc.js's optimizeOneCase expects D1min/D1max/D2min/... (matching the
  // original readCascadeParams() output), not the raw mNDmin/mNDmax field
  // names used by the HTML form / API body. Map them here.
  P.D1min = P.m1Dmin; P.D1max = P.m1Dmax;
  P.D2min = P.m2Dmin; P.D2max = P.m2Dmax;
  P.D3min = P.m3Dmin; P.D3max = P.m3Dmax;

  return P;
}

module.exports = { DEFAULTS, DEFAULT_COMBOS, DEFAULT_FEED_LIST, DEFAULT_TARGET_LIST, buildParams };
