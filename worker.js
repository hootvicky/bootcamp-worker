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

    // ── Delete learner ─────────────────────────────────
    if (url.pathname === '/admin/delete' && request.method === 'POST') {
      return handleDelete(request, env);
    }

    // ── Archive/unarchive learner ───────────────────────
    if (url.pathname === '/admin/archive' && request.method === 'POST') {
      return handleArchive(request, env);
    }

    // ── Sync start dates from Google Sheet ──────────────
    if (url.pathname === '/admin/sync-dates' && request.method === 'POST') {
      return handleSyncDates(request, env);
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

  // Split records into active and archived
  const activeRecords = records.filter(r => !r._archived);
  const archivedRecords = records.filter(r => r._archived);

  // Build HTML rows
  function buildRow(r, isArchived) {
    const m1 = calcPct(r, 'module1');
    const m2 = calcPct(r, 'module2');
    const m3 = calcPct(r, 'module3');
    const m4 = calcPct(r, 'module4');
    const overall = Math.round((m1 + m2 + m3 + m4) / 4);
    const complete = overall === 100;
    const escapedName = (r._name || '').replace(/"/g, '&quot;');
    const archiveBtn = isArchived
      ? '<button class="archive-btn unarchive" data-name="' + escapedName + '" title="Unarchive">📥</button>'
      : '<button class="archive-btn" data-name="' + escapedName + '" title="Archive">📦</button>';
    return '<tr' + (isArchived ? ' style="opacity:0.55"' : '') + '>' +
      '<td>' + (r._name || 'Unknown') + '</td>' +
      '<td>' + (r._startDate || 'N/A') + '</td>' +
      '<td>' + bar(m1) + '</td>' +
      '<td>' + bar(m2) + '</td>' +
      '<td>' + bar(m3) + '</td>' +
      '<td>' + bar(m4) + '</td>' +
      '<td><strong>' + overall + '%</strong></td>' +
      '<td>' + (complete ? '✅' : '❌') + '</td>' +
      '<td>' + (r._lastActive || 'N/A') + '</td>' +
      '<td>' + archiveBtn + ' <button class="del-btn" data-name="' + escapedName + '" title="Remove learner">🗑️</button></td>' +
      '</tr>';
  }

  const activeRows = activeRecords.map(r => buildRow(r, false)).join('');
  const archivedRows = archivedRecords.map(r => buildRow(r, true)).join('');

  const completed = activeRecords.filter(r => {
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
    .header { background: #f6821f; padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .header h1 { color: white; font-size: 20px; font-weight: 700; }
    .header-actions { display: flex; gap: 8px; align-items: center; }
    .header-actions a, .header-actions button { background: white; color: #f6821f; padding: 8px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; border: none; cursor: pointer; }
    .content { max-width: 1500px; margin: 32px auto; padding: 0 32px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-card { background: white; border-radius: 12px; padding: 20px 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); flex: 1; min-width: 160px; }
    .stat-card .num { font-size: 36px; font-weight: 700; color: #f6821f; }
    .stat-card .label { font-size: 13px; color: #888; margin-top: 4px; }
    .table-wrap { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f8f8f8; padding: 12px 12px; text-align: left; font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e8e8e8; white-space: nowrap; }
    td { padding: 12px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fff9f5; }
    .bar-wrap { display: flex; align-items: center; gap: 8px; }
    .bar-track { background: #f0f0f0; border-radius: 99px; height: 8px; width: 80px; }
    .bar-fill { background: #f6821f; border-radius: 99px; height: 8px; }
    .bar-fill.full { background: #22c55e; }
    .pct { font-size: 13px; font-weight: 600; color: #666; }
    .footer { text-align: center; padding: 24px; color: #aaa; font-size: 13px; }
    .del-btn { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
    .del-btn:hover { background: #dc2626; color: white; }
    .archive-btn { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
    .archive-btn:hover { background: #0369a1; color: white; }
    .archive-btn.unarchive { background: #f0fdf4; color: #16a34a; border-color: #86efac; }
    .archive-btn.unarchive:hover { background: #16a34a; color: white; }
    .archived-section { margin-top: 32px; }
    .archived-toggle { background: white; border: 2px solid #e8e8e8; border-radius: 10px; padding: 12px 20px; cursor: pointer; font-size: 14px; font-weight: 600; color: #666; display: flex; align-items: center; gap: 8px; transition: all 0.2s; width: fit-content; }
    .archived-toggle:hover { border-color: #f6821f; color: #f6821f; }
    .archived-table { display: none; margin-top: 12px; }
    .archived-table.show { display: block; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Revenue Essentials — Admin Dashboard</h1>
    <div class="header-actions">
      <a href="/export" target="_blank">Export CSV</a>
    </div>
  </div>
  <div class="content">
    <div class="summary">
      <div class="stat-card"><div class="num">${activeRecords.length}</div><div class="label">Active Learners</div></div>
      <div class="stat-card"><div class="num">${completed}</div><div class="label">Fully Complete</div></div>
      <div class="stat-card"><div class="num">${activeRecords.length - completed}</div><div class="label">In Progress</div></div>
      <div class="stat-card"><div class="num">${activeRecords.length > 0 ? Math.round(activeRecords.reduce((acc,r)=>{const m1=calcPct(r,'module1'),m2=calcPct(r,'module2'),m3=calcPct(r,'module3'),m4=calcPct(r,'module4');return acc+Math.round((m1+m2+m3+m4)/4)},0)/activeRecords.length) : 0}%</div><div class="label">Average Completion</div></div>
      <div class="stat-card"><div class="num">${archivedRecords.length}</div><div class="label">Archived</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Start Date</th>
            <th>Module 1</th>
            <th>Module 2</th>
            <th>Module 3</th>
            <th>Module 4</th>
            <th>Overall</th>
            <th>Complete</th>
            <th>Last Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${activeRows.length ? activeRows : '<tr><td colspan="10" style="text-align:center;color:#aaa;padding:32px">No active learners — share the bootcamp link to get started!</td></tr>'}
        </tbody>
      </table>
    </div>
    ${archivedRecords.length > 0 ? '<div class="archived-section"><button class="archived-toggle" id="archive-toggle">📦 Show Archived (' + archivedRecords.length + ')</button><div class="archived-table" id="archived-table"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Start Date</th><th>Module 1</th><th>Module 2</th><th>Module 3</th><th>Module 4</th><th>Overall</th><th>Complete</th><th>Last Active</th><th>Actions</th></tr></thead><tbody>' + archivedRows + '</tbody></table></div></div></div>' : ''}
  </div>
  <div class="footer">Revenue Essentials Bootcamp · Admin View</div>
  <script>
    // Archive toggle
    const toggleBtn = document.getElementById('archive-toggle');
    const archivedTable = document.getElementById('archived-table');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const showing = archivedTable.classList.toggle('show');
        toggleBtn.textContent = showing ? '📦 Hide Archived (${archivedRecords.length})' : '📦 Show Archived (${archivedRecords.length})';
      });
    }

    // Archive/unarchive
    document.querySelectorAll('.archive-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const isUnarchive = btn.classList.contains('unarchive');
        const action = isUnarchive ? 'unarchive' : 'archive';
        if (!confirm((isUnarchive ? 'Unarchive' : 'Archive') + ' "' + name + '"?')) return;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const res = await fetch('/admin/archive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, archived: !isUnarchive })
          });
          if (res.ok) {
            location.reload();
          } else {
            alert('Failed to ' + action + ': ' + await res.text());
            btn.disabled = false;
            btn.textContent = isUnarchive ? '📥' : '📦';
          }
        } catch (e) {
          alert('Error: ' + e.message);
          btn.disabled = false;
          btn.textContent = isUnarchive ? '📥' : '📦';
        }
      });
    });

    // Delete
    document.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        if (!confirm('Remove "' + name + '" from the bootcamp? This cannot be undone.')) return;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const res = await fetch('/admin/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          });
          if (res.ok) {
            btn.closest('tr').remove();
          } else {
            alert('Failed to delete: ' + await res.text());
            btn.disabled = false;
            btn.textContent = '🗑️';
          }
        } catch (e) {
          alert('Error: ' + e.message);
          btn.disabled = false;
          btn.textContent = '🗑️';
        }
      });
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// ── Delete learner from KV ─────────────────────────────────
async function handleDelete(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !checkAuth(authHeader)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { name } = await request.json();
    if (!name) {
      return new Response('Missing name', { status: 400 });
    }

    await env.BOOTCAMP_PROGRESS.delete(name);
    return new Response('Deleted', { status: 200 });
  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
}

// ── Archive/unarchive learner ──────────────────────────────
async function handleArchive(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !checkAuth(authHeader)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { name, archived } = await request.json();
    if (!name) {
      return new Response('Missing name', { status: 400 });
    }

    const existing = await env.BOOTCAMP_PROGRESS.get(name, { type: 'json' });
    if (!existing) {
      return new Response('Learner not found', { status: 404 });
    }

    existing._archived = !!archived;
    await env.BOOTCAMP_PROGRESS.put(name, JSON.stringify(existing));
    return new Response('OK', { status: 200 });
  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
}

// ── Sync start dates from Google Sheet ────────────────────
async function handleSyncDates(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !checkAuth(authHeader)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { dates } = await request.json();
    if (!dates || !Array.isArray(dates)) {
      return new Response('Missing dates array', { status: 400 });
    }

    let updated = 0;
    for (const { name, startDate } of dates) {
      if (!name) continue;
      const existing = await env.BOOTCAMP_PROGRESS.get(name, { type: 'json' });
      if (existing) {
        existing._startDate = startDate || null;
        await env.BOOTCAMP_PROGRESS.put(name, JSON.stringify(existing));
        updated++;
      }
    }

    return new Response(JSON.stringify({ updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
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
