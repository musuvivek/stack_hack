async function runSolver(payload) {
  const baseUrl = process.env.PYTHON_SCHEDULER_URL || 'http://localhost:8000';

  // Pre-warm the scheduler (free tiers may sleep); ignore failures
  try { await pingHealth(baseUrl); } catch (_) {}

  // Respect environment-configurable limits
  const defaultLimit = 60; // keep under typical gateway timeouts
  const timeLimit = Number(process.env.PYTHON_SCHEDULER_TIME_LIMIT || payload.timeLimit || defaultLimit);

  // Add a fetch timeout via AbortController
  const timeoutMs = Number(process.env.PYTHON_SCHEDULER_TIMEOUT_MS || 115000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('fetch timeout')), timeoutMs);

  let res;
  try {
    res = await fetch(`${baseUrl}/api/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, timeLimit }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(t);
    const err = new Error(`Python API fetch error: ${e?.message || e}`);
    err.status = 502;
    throw err;
  }
  clearTimeout(t);

  if (!res.ok) {
    let detail = await safeReadText(res);
    try {
      const j = JSON.parse(detail);
      detail = j.detail || detail;
    } catch (_) {}
    const err = new Error(`PYTHON_${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function pingHealth(baseUrl) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(`${baseUrl}/health`, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function safeReadText(res) {
  try { return await res.text(); } catch (_) { return ''; }
}

module.exports = { runSolver };


