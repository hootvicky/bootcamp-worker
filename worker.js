const ADMIN_PASSWORD = 'cfadmin2026';

const MODULE_ACTIVITIES = {
  module1: ['cards', 'anim', 'drag', 'quiz', 'pitch'],
  module2: ['cards', 'anim', 'drag', 'quiz'],
  module3: ['cards', 'anim', 'drag', 'quiz'],
  module4: ['cards', 'anim', 'drag', 'quiz']
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Serve admin dashboard ──────────────────────────
    if (url.pathname === '/admin') {
      return handleAdmin(request, env);
    }

    // ── Export CSV ─────────────────────────────────────
    if (url.pathname === '/export') {
      return handleExport(request, env);
    }

    // ── Save progress ──────────────────────────────────
    if (url.pathname === '/progress' && request.method === 'POST') {
      return handleProgress(request, env);
    }

    // ── Serve the bootcamp website ─────────────────────
    const assetUrl = new URL(request.url);
    assetUrl.pathname = '/index.html';
    return fetch(assetUrl.toString());
  }
};

// ── Save progress to KV ────────────────────────────────────
async function handleProgress(request, env) {
  try {
    const data = await request.json();
    const { name, key } = data;

    if (!name || !key) {
      return new Response('Missing data', { status: 400 });
    }

    // Get existing progress for this person
    const existing = await env.BOOTCAMP_PROGRESS.get(name, { type: 'json' }) || {};

    // Update the activity
    existing[key] = true;
    existing._lastActive = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
    existing._name = name;

    // Save back to KV
    await env.BOOTCAMP_PROGRESS.put(name, JSON.stringify(existing));

    return new Response('OK', {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
}

// ── Admin dashboard ────────────────────────────────────────
async function handleAdmin(request, env) {
  // Check password via Basic Auth
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !checkAuth(authHeader)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin"' }
    });
  }

  // Get all records from KV
  const list = await env.BOOTCAMP_PROGRESS.list();
  const records = [];

  for (const key of list.keys) {
    const data = await env.BOOTCAMP_PROGRESS.get(key.name, { type: 'json' });
    if (data) records.push(data);
  }

  // Build HTML
  const rows = records.map(r => {
    const m1 = calcPct(r, 'module1');
    const m2 = calcPct(r, 'module2');
    const m3 = calcPct(r, 'module3');
    const m4 = calcPct(r, 'module4');
    const overall = Math.round((m1 + m2 + m3 + m4) / 4);
    const complete = overall === 100;
    return `
      <tr>
        <td>${r._name || 'Unknown'}</td>
        <td>${bar(m1)}</td>
        <td>${bar(m2)}</td>
        <td>${bar(m3)}</td>
        <td>${bar(m4)}</td>
        <td><strong>${overall}%</strong></td>
        <td>${complete ? '✅' : '❌'}</td>
        <td>${r._lastActive || 'N/A'}</td>
      </tr>`;
  }).join('');

  const completed = records.filter(r => {
    const m1=calcPct(r,'module1'),m2=calcPct(r,'module2'),
          m3=calcPct(r,'module3'),m4=calcPct(r,'module4');
    return Math.round((m1+m2+m3+m4)/4) === 100;
  }).length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Admin Dashboard — Revenue Essentials</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f6f6; color: #1a1a1a; }
    .header { background: #f6821f; padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { color: white; font-size: 20px; font-weight: 700; }
    .header a { background: white; color: #f6821f; padding: 8px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; }
    .content { max-width: 1200px; margin: 32px auto; padding: 0 32px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-card { background: white; border-radius: 12px; padding: 20px 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); flex: 1; min-width: 160px; }
    .stat-card .num { font-size: 36px; font-weight: 700; color: #f6821f; }
    .stat-card .label { font-size: 13px; color: #888; margin-top: 4px; }
    .table-wrap { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f8f8f8; padding: 14px 16px; text-align: left; font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e8e8e8; }
    td { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fff9f5; }
    .bar-wrap { display: flex; align-items: center; gap: 8px; }
    .bar-track { background: #f0f0f0; border-radius: 99px; height: 8px; width: 80px; }
    .bar-fill { background: #f6821f; border-radius: 99px; height: 8px; }
    .bar-fill.full { background: #22c55e; }
    .pct { font-size: 13px; font-weight: 600; color: #666; }
    .footer { text-align: center; padding: 24px; color: #aaa; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Revenue Essentials — Admin Dashboard</h1>
    <a href="/export" target="_blank">⬇️ Export CSV</a>
  </div>
  <div class="content">
    <div class="summary">
      <div class="stat-card"><div class="num">${records.length}</div><div class="label">Total Learners</div></div>
      <div class="stat-card"><div class="num">${completed}</div><div class="label">Fully Complete</div></div>
      <div class="stat-card"><div class="num">${records.length - completed}</div><div class="label">In Progress</div></div>
      <div class="stat-card"><div class="num">${records.length > 0 ? Math.round(records.reduce((acc,r)=>{const m1=calcPct(r,'module1'),m2=calcPct(r,'module2'),m3=calcPct(r,'module3'),m4=calcPct(r,'module4');return acc+Math.round((m1+m2+m3+m4)/4)},0)/records.length) : 0}%</div><div class="label">Average Completion</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Module 1</th>
            <th>Module 2</th>
            <th>Module 3</th>
            <th>Module 4</th>
            <th>Overall</th>
            <th>Complete</th>
            <th>Last Active</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows : '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:32px">No learners yet — share the bootcamp link to get started!</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  <div class="footer">Revenue Essentials Bootcamp · Admin View</div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// ── Export CSV ─────────────────────────────────────────────
async function handleExport(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !checkAuth(authHeader)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin"' }
    });
  }

  const list = await env.BOOTCAMP_PROGRESS.list();
  const records = [];
  for (const key of list.keys) {
    const data = await env.BOOTCAMP_PROGRESS.get(key.name, { type: 'json' });
    if (data) records.push(data);
  }

  let csv = 'Name,Module 1 %,Module 2 %,Module 3 %,Module 4 %,Overall %,Complete,Last Active\n';
  records.forEach(r => {
    const m1=calcPct(r,'module1'),m2=calcPct(r,'module2'),
          m3=calcPct(r,'module3'),m4=calcPct(r,'module4');
    const overall = Math.round((m1+m2+m3+m4)/4);
    csv += `"${r._name || 'Unknown'}",${m1}%,${m2}%,${m3}%,${m4}%,${overall}%,${overall===100?'Yes':'No'},"${r._lastActive||'N/A'}"\n`;
  });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="bootcamp-progress.csv"'
    }
  });
}

// ── Helpers ────────────────────────────────────────────────
function checkAuth(header) {
  const base64 = header.replace('Basic ', '');
  const decoded = atob(base64);
  return decoded === 'admin:' + ADMIN_PASSWORD;
}

function calcPct(data, module) {
  const acts = MODULE_ACTIVITIES[module];
  const done = acts.filter(a => data['m' + module.slice(-1) + '_' + a]).length;
  return Math.round((done / acts.length) * 100);
}

function bar(pct) {
  return `
    <div class="bar-wrap">
      <div class="bar-track">
        <div class="bar-fill ${pct===100?'full':''}" style="width:${pct}%"></div>
      </div>
      <span class="pct">${pct}%</span>
    </div>`;
}
