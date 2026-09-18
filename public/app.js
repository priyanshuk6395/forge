'use strict';

/* ============================== Core helpers ============================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = Math.floor(hrs / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Forge-Client': '1',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(message, type = '') {
  const region = $('#toast-region');
  const t = h('div', { class: `toast ${type}` }, message);
  region.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

/* ============================== Modal ============================== */

let activeModal = null;

function openModal(contentEl, { wide = false } = {}) {
  closeModal();
  const overlay = h(
    'div',
    { class: 'modal-overlay', role: 'presentation', onclick: (e) => { if (e.target === overlay) closeModal(); } },
    [h('div', { class: `modal ${wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true' }, contentEl)]
  );
  document.body.appendChild(overlay);
  activeModal = overlay;
  const firstInput = overlay.querySelector('input, select, textarea, button');
  if (firstInput) firstInput.focus();
  return overlay;
}

function closeModal() {
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (paletteEl) closePalette();
    else if (activeModal) closeModal();
  }
});

function confirmAction({ title, body, confirmLabel = 'Confirm', danger = true, onConfirm }) {
  const content = h('div', {}, [
    h('div', { class: 'modal-header' }, [h('h3', {}, title)]),
    h('p', {}, body),
    h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
      h(
        'button',
        {
          class: danger ? 'btn btn-danger' : 'btn btn-primary',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              await onConfirm();
              closeModal();
            } catch (err) {
              toast(err.message, 'error');
              e.target.disabled = false;
            }
          },
        },
        confirmLabel
      ),
    ]),
  ]);
  openModal(content);
}

/* ============================== Theme ============================== */

function initTheme() {
  $('#theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('forge-theme', next); } catch {}
  });
}

/* ============================== Command palette ============================== */

let paletteEl = null;

function paletteTargets() {
  const targets = [
    { label: 'Dashboard', action: () => showView('dashboard') },
    { label: 'Projects', action: () => showView('projects') },
    { label: 'Servers', action: () => showView('servers') },
    { label: 'Audit log', action: () => showView('audit') },
    { label: 'Settings', action: () => showView('settings') },
  ];
  for (const p of state.projects) {
    targets.push({ label: `Project: ${p.name}`, action: () => openProject(p.id) });
  }
  for (const s of state.servers) {
    targets.push({ label: `Server: ${s.name}`, action: () => showView('servers') });
  }
  return targets;
}

function openPalette() {
  const input = h('input', { placeholder: 'Jump to a project, server, or view…' });
  const results = h('div', { class: 'results' });
  const content = h('div', {}, [input, results]);
  const overlay = openModal(content, { wide: false });
  overlay.querySelector('.modal').classList.add('command-palette');
  paletteEl = overlay;

  let items = paletteTargets();
  let selected = 0;

  function render() {
    results.innerHTML = '';
    items.forEach((item, i) => {
      const row = h('div', { class: `result ${i === selected ? 'selected' : ''}`, onclick: () => { item.action(); closePalette(); } }, [
        h('span', {}, item.label),
      ]);
      results.appendChild(row);
    });
  }

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    items = paletteTargets().filter((t) => t.label.toLowerCase().includes(q));
    selected = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { selected = Math.min(selected + 1, items.length - 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { selected = Math.max(selected - 1, 0); render(); e.preventDefault(); }
    if (e.key === 'Enter' && items[selected]) { items[selected].action(); closePalette(); }
  });
  render();
}

function closePalette() {
  closeModal();
  paletteEl = null;
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (state.user) openPalette();
  }
});

/* ============================== Auth ============================== */

async function checkAuth() {
  const status = await api('/auth/status');
  if (status.user) {
    state.user = status.user;
    showApp();
  } else {
    showAuthScreen(status.needsSetup);
  }
}

function showAuthScreen(needsSetup) {
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  $('#setup-form').hidden = !needsSetup;
  $('#login-form').hidden = needsSetup;
}

function showApp() {
  $('#auth-screen').hidden = true;
  $('#app-shell').hidden = false;
  $('#current-user').textContent = state.user.username;
  bootstrapApp();
}

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api('/auth/setup', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') } });
    state.user = res.user;
    showApp();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api('/auth/login', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') } });
    state.user = res.user;
    showApp();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  state.user = null;
  location.reload();
});

/* ============================== State & navigation ============================== */

const state = {
  user: null,
  projects: [],
  servers: [],
  currentProjectId: null,
  currentTab: 'releases',
  pollers: {},
};

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  'project-detail': 'Project',
  servers: 'Servers',
  audit: 'Audit log',
  settings: 'Settings',
};

function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  $$('.nav-item[data-nav]').forEach((n) => n.classList.toggle('active', n.dataset.nav === name));
  $('#breadcrumb').textContent = VIEW_TITLES[name] || '';
  if (name === 'dashboard') loadDashboard();
  if (name === 'projects') loadProjects();
  if (name === 'servers') loadServers();
  if (name === 'audit') loadAudit();
  if (name === 'settings') loadSettings();
}

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) showView(nav.dataset.nav);
});

$('#palette-trigger').addEventListener('click', openPalette);

async function bootstrapApp() {
  initTheme();
  try {
    const [{ projects }, { servers }] = await Promise.all([api('/projects'), api('/servers')]);
    state.projects = projects;
    state.servers = servers;
  } catch {}
  showView('dashboard');
}

/* ============================== Dashboard ============================== */

async function loadDashboard() {
  const hero = $('#health-hero');
  hero.innerHTML = '<div class="skeleton-line" style="width:120px;margin:0 auto;"></div>';
  let data;
  try {
    data = await api('/dashboard');
  } catch (err) {
    hero.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
    return;
  }

  const stateLabel = { healthy: 'All systems healthy', attention: 'Needs attention', critical: 'Critical issue' }[data.overall];
  hero.className = `health-hero state-${data.overall}`;
  hero.innerHTML = '';
  hero.appendChild(h('div', {}, [
    h('div', { class: 'label' }, 'Forge status'),
    h('div', { class: 'state' }, stateLabel),
    h('div', { class: 'health-components' }, Object.entries(data.components).map(([k, v]) =>
      h('div', {}, [h('span', { class: `pill pill-${v === 'healthy' ? 'success' : v === 'attention' ? 'warning' : 'danger'}` }, v), ' ' + k])
    )),
  ]));

  const tiles = $('#dashboard-tiles');
  tiles.innerHTML = '';
  const tileData = [
    { label: 'Projects', value: data.projectCount },
    { label: 'Servers', value: data.serverCount },
    { label: 'Open incidents', value: data.openIncidents.length },
    { label: 'Signed in as', value: state.user.username },
  ];
  tileData.forEach((t) => tiles.appendChild(h('div', { class: 'tile' }, [h('div', { class: 'label' }, t.label), h('div', { class: 'value' }, String(t.value))])));

  const activity = $('#dashboard-activity');
  activity.innerHTML = '';
  if (!data.recentActivity.length) {
    activity.appendChild(h('p', {}, 'Nothing yet — actions you take will show up here.'));
  }
  data.recentActivity.forEach((ev) => {
    activity.appendChild(h('div', { class: 'inline-row', style: 'justify-content:space-between; border-bottom:1px solid var(--border); padding:8px 0;' }, [
      h('span', {}, `${ev.actor} — ${ev.action.replace(/\./g, ' · ')}`),
      h('span', { class: 'hint' }, timeAgo(ev.ts)),
    ]));
  });
}

/* ============================== Projects list ============================== */

function healthPill(project) {
  const state = (project.health && project.health.state) || 'unknown';
  const map = { healthy: 'success', unhealthy: 'danger', unknown: 'neutral' };
  return h('span', { class: `pill pill-${map[state]}` }, state);
}

async function loadProjects() {
  const root = $('#projects-list');
  root.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line" style="width:70%"></div>';
  const { projects } = await api('/projects');
  state.projects = projects;
  if (!projects.length) {
    root.innerHTML = '';
    root.appendChild(h('div', { class: 'panel empty-state' }, [
      h('h3', {}, 'No projects yet'),
      h('p', {}, 'Connect a GitHub repo and a server to deploy your first app.'),
      h('button', { class: 'btn btn-primary', onclick: openNewProjectModal }, '+ New project'),
    ]));
    return;
  }
  const wrap = h('div', { class: 'panel table-wrap' });
  const table = h('table', { class: 'table' });
  table.appendChild(h('thead', {}, h('tr', {}, ['Name', 'Repo', 'Branch', 'Health', 'Last deploy', ''].map((t) => h('th', {}, t)))));
  const tbody = h('tbody');
  projects.forEach((p) => {
    tbody.appendChild(h('tr', { style: 'cursor:pointer', onclick: () => openProject(p.id) }, [
      h('td', {}, h('strong', {}, p.name)),
      h('td', { class: 'mono hint' }, p.repoFullName),
      h('td', {}, p.branch),
      h('td', {}, healthPill(p)),
      h('td', { class: 'hint' }, timeAgo(p.lastDeployedAt)),
      h('td', {}, h('button', { class: 'btn btn-ghost btn-sm' }, 'Open →')),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  root.innerHTML = '';
  root.appendChild(wrap);
}

$('#new-project-btn').addEventListener('click', openNewProjectModal);

async function openNewProjectModal() {
  if (!state.servers.length) {
    try { const { servers } = await api('/servers'); state.servers = servers; } catch {}
  }
  let settings;
  try { settings = await api('/settings'); } catch { settings = { github: { connected: false } }; }

  if (!settings.github.connected) {
    openModal(h('div', {}, [
      h('div', { class: 'modal-header' }, [h('h3', {}, 'Connect GitHub first')]),
      h('p', {}, 'Forge needs a GitHub personal access token to list and deploy your repositories.'),
      h('div', { class: 'modal-actions' }, [
        h('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onclick: () => { closeModal(); showView('settings'); } }, 'Go to Settings'),
      ]),
    ]));
    return;
  }
  if (!state.servers.length) {
    openModal(h('div', {}, [
      h('div', { class: 'modal-header' }, [h('h3', {}, 'Add a server first')]),
      h('p', {}, 'Projects deploy onto a server — connect an existing box or provision one on AWS.'),
      h('div', { class: 'modal-actions' }, [
        h('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onclick: () => { closeModal(); showView('servers'); } }, 'Go to Servers'),
      ]),
    ]));
    return;
  }

  const repoSelect = h('select', { required: true }, [h('option', { value: '' }, 'Loading repositories…')]);
  const branchSelect = h('select', { required: true }, [h('option', { value: '' }, '—')]);
  const detectNote = h('div', { class: 'hint' });
  const nameInput = h('input', { name: 'name', required: true, placeholder: 'expense-api' });
  const portInput = h('input', { name: 'port', type: 'number', value: '8080', required: true, min: 1, max: 65535 });
  const hostPortInput = h('input', { name: 'hostPort', type: 'number', value: '8080', min: 1, max: 65535 });
  const healthInput = h('input', { name: 'healthPath', value: '/health', required: true });
  const serverSelect = h(
    'select',
    { name: 'serverId', required: true },
    state.servers.map((s) => h('option', { value: s.id }, `${s.name} (${s.host})`))
  );
  const autoHealSwitch = h('input', { type: 'checkbox', name: 'autoHeal' });

  let repos = [];
  let selectedRepo = null;

  const form = h('form', { class: 'stack' }, [
    h('div', { class: 'modal-header' }, [h('h3', {}, 'New project')]),
    h('div', { class: 'field' }, [h('label', {}, 'Repository'), repoSelect]),
    h('div', { class: 'form-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Branch'), branchSelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Project name'), nameInput]),
    ]),
    detectNote,
    h('div', { class: 'form-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Container port'), portInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Host port'), hostPortInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Health check path'), healthInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Deploy to server'), serverSelect]),
    h('div', { class: 'field' }, [h('label', { class: 'switch' }, [autoHealSwitch, h('span', { class: 'track' }), h('span', {}, 'Auto-restart on repeated health-check failure')])]),
    h('div', { class: 'modal-actions' }, [
      h('button', { type: 'button', class: 'btn', onclick: closeModal }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Create project'),
    ]),
  ]);
  openModal(form, { wide: true });

  api('/github/repos').then(({ repos: r }) => {
    repos = r;
    repoSelect.innerHTML = '';
    repoSelect.appendChild(h('option', { value: '' }, 'Select a repository…'));
    repos.forEach((repo) => repoSelect.appendChild(h('option', { value: repo.fullName }, `${repo.fullName}${repo.private ? ' 🔒' : ''}`)));
  }).catch((err) => { repoSelect.innerHTML = ''; repoSelect.appendChild(h('option', {}, 'Failed to load: ' + err.message)); });

  repoSelect.addEventListener('change', async () => {
    selectedRepo = repos.find((r) => r.fullName === repoSelect.value);
    if (!selectedRepo) return;
    if (!nameInput.value) nameInput.value = selectedRepo.fullName.split('/')[1];
    branchSelect.innerHTML = '';
    branchSelect.appendChild(h('option', {}, selectedRepo.defaultBranch));
    detectNote.textContent = 'Checking repository…';
    const [owner, repo] = selectedRepo.fullName.split('/');
    try {
      const branches = await api(`/github/repos/${owner}/${repo}/branches`);
      branchSelect.innerHTML = '';
      branches.branches.forEach((b) => branchSelect.appendChild(h('option', { value: b, selected: b === selectedRepo.defaultBranch ? '' : null }, b)));
      branchSelect.value = selectedRepo.defaultBranch;
    } catch {}
    try {
      const detected = await api(`/github/repos/${owner}/${repo}/detect?branch=${encodeURIComponent(branchSelect.value)}`);
      detectNote.textContent = detected.hasDockerfile
        ? `Dockerfile found${detected.language ? ' · ' + detected.language : ''}.`
        : 'No Dockerfile found on this branch — add one before deploying, or Forge will fail the build.';
    } catch (e) {
      detectNote.textContent = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    try {
      const { project } = await api('/projects', {
        method: 'POST',
        body: {
          name: nameInput.value,
          repoFullName: repoSelect.value,
          repoPrivate: !!(selectedRepo && selectedRepo.private),
          branch: branchSelect.value,
          port: Number(portInput.value),
          hostPort: Number(hostPortInput.value) || Number(portInput.value),
          healthPath: healthInput.value,
          serverId: serverSelect.value,
          autoHeal: autoHealSwitch.checked,
        },
      });
      closeModal();
      toast('Project created.', 'success');
      await loadProjects();
      openProject(project.id);
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}

/* ============================== Project detail ============================== */

async function openProject(id) {
  state.currentProjectId = id;
  state.currentTab = 'releases';
  showView('project-detail');
  await renderProjectDetail();
}

function deploymentStatusPill(status) {
  const map = { success: 'success', healthy: 'success', building: 'warning', failed: 'danger', blocked: 'danger' };
  return h('span', { class: `pill pill-${map[status] || 'neutral'}` }, status);
}

async function renderProjectDetail() {
  const root = $('#project-detail-root');
  root.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line" style="width:60%"></div>';
  let data;
  try {
    data = await api(`/projects/${state.currentProjectId}`);
  } catch (err) {
    root.innerHTML = '';
    root.appendChild(h('div', { class: 'panel empty-state' }, [h('h3', {}, 'Could not load project'), h('p', {}, err.message)]));
    return;
  }
  const { project, deployments } = data;
  $('#breadcrumb').textContent = `Projects / ${project.name}`;

  const server = state.servers.find((s) => s.id === project.serverId);
  const latest = deployments[0];

  root.innerHTML = '';
  root.appendChild(h('div', { class: 'panel' }, [
    h('div', { class: 'panel-header' }, [
      h('div', {}, [
        h('h2', { style: 'font-size:18px;' }, project.name),
        h('div', { class: 'hint mono' }, `${project.repoFullName} @ ${project.branch} → ${server ? server.host : '—'}:${project.hostPort}`),
      ]),
      h('div', { class: 'inline-row' }, [
        healthPill(project),
        h('button', { class: 'btn btn-primary', onclick: () => triggerDeploy(project.id) }, 'Deploy'),
      ]),
    ]),
    h('div', { class: 'tab-bar' }, [
      tabButton('releases', 'Releases'),
      tabButton('logs', 'Logs'),
      tabButton('secrets', 'Secrets'),
      tabButton('settings', 'Settings'),
    ]),
    h('div', { id: 'tab-releases', class: `tab-panel ${state.currentTab === 'releases' ? 'active' : ''}` }, [renderReleasesTab(project, deployments)]),
    h('div', { id: 'tab-logs', class: `tab-panel ${state.currentTab === 'logs' ? 'active' : ''}` }, [renderLogsTab(project)]),
    h('div', { id: 'tab-secrets', class: `tab-panel ${state.currentTab === 'secrets' ? 'active' : ''}` }, [renderSecretsTab(project)]),
    h('div', { id: 'tab-settings', class: `tab-panel ${state.currentTab === 'settings' ? 'active' : ''}` }, [renderProjectSettingsTab(project)]),
  ]));

  if (latest && latest.status === 'building') {
    pollDeployment(project.id, latest.id);
  }
}

function tabButton(name, label) {
  return h('button', {
    class: `tab-btn ${state.currentTab === name ? 'active' : ''}`,
    onclick: (e) => {
      state.currentTab = name;
      $$('.tab-btn').forEach((b) => b.classList.remove('active'));
      $$('.tab-panel').forEach((p) => p.classList.remove('active'));
      e.target.classList.add('active');
      $(`#tab-${name}`).classList.add('active');
    },
  }, label);
}

function renderReleasesTab(project, deployments) {
  if (!deployments.length) {
    return h('div', { class: 'empty-state' }, [h('h3', {}, 'No deployments yet'), h('p', {}, 'Click Deploy to ship the current branch.')]);
  }
  const wrap = h('div', { class: 'table-wrap' });
  const table = h('table', { class: 'table' });
  table.appendChild(h('thead', {}, h('tr', {}, ['#', 'Commit', 'Status', 'Trigger', 'When', ''].map((t) => h('th', {}, t)))));
  const tbody = h('tbody');
  deployments.forEach((d) => {
    tbody.appendChild(h('tr', { id: `deploy-row-${d.id}` }, [
      h('td', {}, `#${d.number}`),
      h('td', { class: 'mono' }, d.commitSha || '—'),
      h('td', {}, deploymentStatusPill(d.status)),
      h('td', {}, d.trigger),
      h('td', { class: 'hint' }, timeAgo(d.startedAt)),
      h('td', {}, d.status === 'success' && d.id !== project.currentDeploymentId
        ? h('button', { class: 'btn btn-sm', onclick: () => rollbackTo(project.id, d) }, 'Rollback here')
        : d.id === project.currentDeploymentId ? h('span', { class: 'hint' }, 'current') : ''),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

async function triggerDeploy(projectId) {
  try {
    const { deployment } = await api(`/projects/${projectId}/deploy`, { method: 'POST' });
    toast(`Deployment #${deployment.number} started.`, 'success');
    await renderProjectDetail();
    pollDeployment(projectId, deployment.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function rollbackTo(projectId, target) {
  confirmAction({
    title: `Roll back to release #${target.number}?`,
    body: `This redeploys commit ${target.commitSha} (image ${target.imageTag}) to production immediately.`,
    confirmLabel: 'Roll back',
    onConfirm: async () => {
      const { deployment } = await api(`/projects/${projectId}/deployments/${target.id}/rollback`, { method: 'POST' });
      toast(`Rollback #${deployment.number} started.`, 'success');
      await renderProjectDetail();
      pollDeployment(projectId, deployment.id);
    },
  });
}

function pollDeployment(projectId, deploymentId) {
  if (state.pollers[deploymentId]) return;
  const poll = async () => {
    let dep;
    try {
      const res = await api(`/projects/${projectId}/deployments/${deploymentId}`);
      dep = res.deployment;
    } catch {
      delete state.pollers[deploymentId];
      return;
    }
    const row = $(`#deploy-row-${deploymentId}`);
    if (row) {
      const statusCell = row.children[2];
      statusCell.innerHTML = '';
      statusCell.appendChild(deploymentStatusPill(dep.status));
    }
    if (dep.status === 'building') {
      state.pollers[deploymentId] = setTimeout(poll, 1800);
    } else {
      delete state.pollers[deploymentId];
      if (state.currentProjectId === projectId) {
        renderProjectDetail();
        toast(
          dep.status === 'success' ? `Deployment #${dep.number} is live.` : `Deployment #${dep.number} ${dep.status}: ${dep.error || ''}`,
          dep.status === 'success' ? 'success' : 'error'
        );
      }
    }
  };
  state.pollers[deploymentId] = setTimeout(poll, 1200);
}

function renderLogsTab(project) {
  const pane = h('pre', { class: 'log-pane' }, 'Loading…');
  const refresh = async () => {
    try {
      const { logs } = await api(`/projects/${project.id}/logs?lines=300`);
      pane.textContent = logs || '(empty)';
      pane.scrollTop = pane.scrollHeight;
    } catch (err) {
      pane.textContent = 'Could not fetch logs: ' + err.message;
    }
  };
  refresh();
  return h('div', { class: 'stack' }, [
    h('div', { class: 'inline-row', style: 'justify-content:flex-end;' }, [
      h('button', { class: 'btn btn-sm', onclick: () => restartContainer(project.id) }, 'Restart container'),
      h('button', { class: 'btn btn-sm', onclick: refresh }, 'Refresh'),
    ]),
    pane,
  ]);
}

async function restartContainer(projectId) {
  try {
    await api(`/projects/${projectId}/restart`, { method: 'POST' });
    toast('Container restarted.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderSecretsTab(project) {
  const list = h('div', { class: 'stack', id: 'secrets-list' });
  const renderKeys = (keys) => {
    list.innerHTML = '';
    if (!keys.length) list.appendChild(h('p', {}, 'No environment variables set.'));
    keys.forEach((key) => {
      list.appendChild(h('div', { class: 'inline-row', style: 'justify-content:space-between;' }, [
        h('span', { class: 'mono' }, key + ' = ••••••••'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
          await api(`/projects/${project.id}/secrets/${encodeURIComponent(key)}`, { method: 'DELETE' });
          renderKeys((await api(`/projects/${project.id}/secrets`)).keys);
          toast('Removed. Redeploy to apply.', 'success');
        } }, 'Remove'),
      ]));
    });
  };
  api(`/projects/${project.id}/secrets`).then((r) => renderKeys(r.keys));

  const keyInput = h('input', { placeholder: 'DATABASE_URL' });
  const valueInput = h('input', { type: 'password', placeholder: 'value' });
  const addForm = h('form', { class: 'form-row', style: 'align-items:flex-end; margin-top:14px;' }, [
    h('div', { class: 'field' }, [h('label', {}, 'Key'), keyInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Value'), valueInput]),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'),
  ]);
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { keys } = await api(`/projects/${project.id}/secrets`, { method: 'PUT', body: { key: keyInput.value, value: valueInput.value } });
      keyInput.value = '';
      valueInput.value = '';
      renderKeys(keys);
      toast('Saved. Redeploy to apply.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  return h('div', {}, [
    h('p', { class: 'hint' }, 'Values are encrypted at rest and never shown again after saving. Redeploy to pick up changes.'),
    list,
    addForm,
  ]);
}

function renderProjectSettingsTab(project) {
  const branchInput = h('input', { value: project.branch });
  const portInput = h('input', { type: 'number', value: project.port });
  const hostPortInput = h('input', { type: 'number', value: project.hostPort });
  const healthInput = h('input', { value: project.healthPath });
  const serverSelect = h('select', {}, state.servers.map((s) => h('option', { value: s.id, selected: s.id === project.serverId ? '' : null }, s.name)));
  serverSelect.value = project.serverId;
  const autoHeal = h('input', { type: 'checkbox' });
  autoHeal.checked = !!project.autoHeal;

  const saveForm = h('form', { class: 'stack' }, [
    h('div', { class: 'form-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Branch'), branchInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Server'), serverSelect]),
    ]),
    h('div', { class: 'form-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Container port'), portInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Host port'), hostPortInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Health check path'), healthInput]),
    h('div', { class: 'field' }, [h('label', { class: 'switch' }, [autoHeal, h('span', { class: 'track' }), h('span', {}, 'Auto-restart on repeated health-check failure')])]),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save settings'),
  ]);
  saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: {
          branch: branchInput.value,
          port: Number(portInput.value),
          hostPort: Number(hostPortInput.value),
          healthPath: healthInput.value,
          serverId: serverSelect.value,
          autoHeal: autoHeal.checked,
        },
      });
      toast('Saved.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  const autoDeployRow = h('div', { class: 'inline-row', style: 'justify-content:space-between;' }, [
    h('div', {}, [
      h('div', {}, project.autoDeploy ? 'Auto-deploy is on' : 'Auto-deploy is off'),
      h('div', { class: 'hint' }, `Pushes to "${project.branch}" ${project.autoDeploy ? 'trigger a deploy automatically.' : 'require a manual Deploy click.'}`),
    ]),
    project.autoDeploy
      ? h('button', { class: 'btn btn-sm', onclick: async () => { await api(`/projects/${project.id}/webhook`, { method: 'DELETE' }); renderProjectDetail(); } }, 'Disable')
      : h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
          try { await api(`/projects/${project.id}/webhook`, { method: 'POST' }); toast('Auto-deploy enabled.', 'success'); renderProjectDetail(); }
          catch (err) { toast(err.message, 'error'); }
        } }, 'Enable'),
  ]);

  const dangerZone = h('div', { class: 'stack' }, [
    h('button', { class: 'btn btn-danger btn-sm', onclick: () => confirmAction({
      title: `Delete "${project.name}"?`,
      body: 'This removes the project from Forge and its release history. The running container on the server is left as-is — stop it manually if needed.',
      confirmLabel: 'Delete project',
      onConfirm: async () => {
        await api(`/projects/${project.id}`, { method: 'DELETE', body: { confirm: true } });
        toast('Project deleted.', 'success');
        showView('projects');
      },
    }) }, 'Delete project'),
  ]);

  return h('div', { class: 'stack' }, [saveForm, h('hr', { style: 'border-color:var(--border); margin:6px 0;' }), autoDeployRow, h('hr', { style: 'border-color:var(--border); margin:6px 0;' }), dangerZone]);
}

/* ============================== Servers ============================== */

function serverStatusPill(server) {
  const map = { ready: 'success', connecting: 'warning', provisioning: 'warning', bootstrap_failed: 'danger' };
  return h('span', { class: `pill pill-${map[server.status] || 'neutral'}` }, server.status);
}

async function loadServers() {
  const root = $('#servers-list');
  root.innerHTML = '<div class="skeleton-line"></div>';
  const { servers } = await api('/servers');
  state.servers = servers;
  if (!servers.length) {
    root.innerHTML = '';
    root.appendChild(h('div', { class: 'panel empty-state' }, [h('h3', {}, 'No servers yet'), h('p', {}, 'Connect any Linux box over SSH, or have Forge provision one on AWS.')]));
    return;
  }
  const wrap = h('div', { class: 'panel table-wrap' });
  const table = h('table', { class: 'table' });
  table.appendChild(h('thead', {}, h('tr', {}, ['Name', 'Host', 'Provider', 'Status', ''].map((t) => h('th', {}, t)))));
  const tbody = h('tbody');
  servers.forEach((s) => {
    const actions = h('div', { class: 'inline-row' }, [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { try { await api(`/servers/${s.id}/test`, { method: 'POST' }); toast('SSH OK.', 'success'); } catch (e) { toast(e.message, 'error'); } } }, 'Test'),
    ]);
    if (s.hasKey) {
      actions.appendChild(h('a', { class: 'btn btn-ghost btn-sm', href: `/api/servers/${s.id}/key`, target: '_blank' }, 'Download key'));
    }
    actions.appendChild(h('button', { class: 'btn btn-danger btn-sm', onclick: () => confirmAction({
      title: `Delete server "${s.name}"?`,
      body: 'Projects deployed to this server must be reassigned or removed first.',
      confirmLabel: 'Delete server',
      onConfirm: async () => { await api(`/servers/${s.id}`, { method: 'DELETE', body: { confirm: true } }); toast('Server deleted.', 'success'); loadServers(); },
    }) }, 'Delete'));
    tbody.appendChild(h('tr', {}, [
      h('td', {}, h('strong', {}, s.name)),
      h('td', { class: 'mono hint' }, s.host),
      h('td', {}, s.provider === 'ec2' ? 'AWS EC2' : 'Existing'),
      h('td', {}, serverStatusPill(s)),
      h('td', {}, actions),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  root.innerHTML = '';
  root.appendChild(wrap);
}

$('#connect-server-btn').addEventListener('click', () => {
  const nameInput = h('input', { required: true, placeholder: 'staging-box' });
  const hostInput = h('input', { required: true, placeholder: '3.110.221.4' });
  const userInput = h('input', { value: 'ubuntu', required: true });
  const portInput = h('input', { type: 'number', value: '22' });
  const keyInput = h('textarea', { rows: 6, placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----' });
  const form = h('form', { class: 'stack' }, [
    h('div', { class: 'modal-header' }, [h('h3', {}, 'Connect an existing server')]),
    h('p', { class: 'hint' }, 'Any Linux box you can already SSH into — an EC2 instance you launched yourself, or anything else.'),
    h('div', { class: 'field' }, [h('label', {}, 'Name'), nameInput]),
    h('div', { class: 'form-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Host / IP'), hostInput]),
      h('div', { class: 'field' }, [h('label', {}, 'SSH port'), portInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'SSH user'), userInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Private key (PEM)'), keyInput]),
    h('div', { class: 'modal-actions' }, [
      h('button', { type: 'button', class: 'btn', onclick: closeModal }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Connect'),
    ]),
  ]);
  openModal(form, { wide: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Connecting — this can take a minute…';
    try {
      await api('/servers/connect', { method: 'POST', body: { name: nameInput.value, host: hostInput.value, sshUser: userInput.value, sshPort: Number(portInput.value), privateKey: keyInput.value } });
      closeModal();
      toast('Server connected and prepared.', 'success');
      loadServers();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });
});

$('#provision-server-btn').addEventListener('click', async () => {
  let settings;
  try { settings = await api('/settings'); } catch { settings = { aws: { configured: false } }; }
  const nameInput = h('input', { required: true, placeholder: 'production' });
  const typeSelect = h('select', {}, ['t3.micro', 't3.small', 't3.medium', 't3.large'].map((t) => h('option', { value: t }, t)));
  const cidrInput = h('input', { value: '0.0.0.0/0' });
  const form = h('form', { class: 'stack' }, [
    h('div', { class: 'modal-header' }, [h('h3', {}, 'Provision a new EC2 instance')]),
    h('p', { class: 'hint' }, settings.aws.usingInstanceProfile
      ? 'Using this box\'s own EC2 instance profile for AWS access.'
      : `Using the AWS credentials saved in Settings (region: ${settings.aws.region}).`),
    h('div', { class: 'field' }, [h('label', {}, 'Name'), nameInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Instance type'), typeSelect]),
    h('div', { class: 'field' }, [h('label', {}, 'Allow SSH from (CIDR)'), cidrInput, h('div', { class: 'hint' }, 'Use your own IP/32 to lock this down; 0.0.0.0/0 allows SSH from anywhere.')]),
    h('div', { class: 'modal-actions' }, [
      h('button', { type: 'button', class: 'btn', onclick: closeModal }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Provision'),
    ]),
  ]);
  openModal(form, { wide: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Provisioning — this takes a minute or two…';
    try {
      const { server } = await api('/servers/provision', { method: 'POST', body: { name: nameInput.value, instanceType: typeSelect.value, sshCidr: cidrInput.value } });
      closeModal();
      toast(server.status === 'ready' ? 'Server provisioned and ready.' : `Server launched (status: ${server.status}).`, server.status === 'ready' ? 'success' : '');
      loadServers();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Provision';
    }
  });
});

/* ============================== Settings ============================== */

async function loadSettings() {
  const settings = await api('/settings');

  const ghRoot = $('#github-settings');
  ghRoot.innerHTML = '';
  if (settings.github.connected) {
    ghRoot.appendChild(h('div', { class: 'inline-row', style: 'justify-content:space-between;' }, [
      h('div', {}, [h('span', { class: 'pill pill-success' }, 'connected'), ' as ' + settings.github.login]),
      h('button', { class: 'btn btn-danger btn-sm', onclick: async () => { await api('/settings/github', { method: 'DELETE' }); loadSettings(); } }, 'Disconnect'),
    ]));
  } else {
    const tokenInput = h('input', { type: 'password', placeholder: 'ghp_…', style: 'flex:1' });
    const form = h('form', { class: 'inline-row' }, [
      tokenInput,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Connect'),
    ]);
    ghRoot.appendChild(h('div', {}, [
      h('p', { class: 'hint' }, 'Needs repo scope. Create one at github.com → Settings → Developer settings → Personal access tokens.'),
      form,
    ]));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/settings/github', { method: 'POST', body: { token: tokenInput.value } });
        toast('GitHub connected.', 'success');
        loadSettings();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  const awsRoot = $('#aws-settings');
  awsRoot.innerHTML = '';
  awsRoot.appendChild(h('p', { class: 'hint' }, settings.aws.usingInstanceProfile && !settings.aws.configured
    ? 'No keys saved — Forge will use this instance\'s own EC2 IAM role if it has one, needed only if you want Forge to provision new EC2 servers for you.'
    : `Configured for region ${settings.aws.region}.`));
  const keyInput = h('input', { placeholder: 'AKIA…' });
  const secretInput = h('input', { type: 'password', placeholder: 'secret access key' });
  const regionInput = h('input', { value: settings.aws.region });
  const form = h('form', { class: 'stack' }, [
    h('div', { class: 'form-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Access key ID'), keyInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Secret access key'), secretInput]),
    ]),
    h('div', { class: 'field', style: 'max-width:220px;' }, [h('label', {}, 'Region'), regionInput]),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/settings/aws', { method: 'POST', body: { accessKeyId: keyInput.value, secretAccessKey: secretInput.value, region: regionInput.value } });
      toast('AWS settings saved.', 'success');
      loadSettings();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  awsRoot.appendChild(form);
}

/* ============================== Audit ============================== */

async function loadAudit() {
  const root = $('#audit-list');
  root.innerHTML = '<div class="skeleton-line"></div>';
  const { events } = await api('/audit');
  if (!events.length) {
    root.innerHTML = '<p>No activity recorded yet.</p>';
    return;
  }
  const wrap = h('div', { class: 'table-wrap' });
  const table = h('table', { class: 'table' });
  table.appendChild(h('thead', {}, h('tr', {}, ['When', 'Actor', 'Action', 'Result'].map((t) => h('th', {}, t)))));
  const tbody = h('tbody');
  events.forEach((ev) => {
    tbody.appendChild(h('tr', {}, [
      h('td', { class: 'hint' }, timeAgo(ev.ts)),
      h('td', {}, ev.actor),
      h('td', { class: 'mono' }, ev.action),
      h('td', {}, h('span', { class: `pill pill-${ev.result === 'success' ? 'success' : 'danger'}` }, ev.result)),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  root.innerHTML = '';
  root.appendChild(wrap);
}

/* ============================== Boot ============================== */

checkAuth().catch((err) => {
  console.error(err);
  showAuthScreen(true);
});
