'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   WebForge AI — Frontend Application
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── State ───────────────────────────────────────────────────────────────── */
const state = {
  files:        {},
  currentFile:  null,
  allModels:    [],
  selectedModel: 'anthropic/claude-3.5-sonnet',
  previewSrcdoc: '',
};

/* ── DOM refs ────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const promptInput     = $('promptInput');
const modelInput      = $('modelInput');         // hidden <input>
const modelDisplay    = $('modelDisplay');        // visible label
const modelTrigger    = $('modelTrigger');
const modelSelector   = $('modelSelector');
const modelSearch     = $('modelSearch');
const modelList       = $('modelList');
const modelCount      = $('modelCount');
const modelManualInput = $('modelManualInput');
const generateBtn     = $('generateBtn');
const fileTree        = $('fileTree');
const sidebarEmpty    = $('sidebarEmpty');
const fileTabsRow     = $('fileTabsRow');
const codeContent     = $('codeContent');
const copyCodeBtn     = $('copyCodeBtn');
const previewFrame    = $('previewFrame');
const previewPlaceholder = $('previewPlaceholder');
const refreshBtn      = $('refreshBtn');
const newTabBtn       = $('newTabBtn');
const statusBar       = $('statusBar');
const statusText      = $('statusText');
const statusModel     = $('statusModel');
const genOverlay      = $('genOverlay');
const mobileTabs      = $('mobileTabs');

/* ═══════════════════════════════════════════════════════════════════════════
   MODEL SELECTOR
   ═══════════════════════════════════════════════════════════════════════════ */

async function loadModels() {
  setStatus('Loading models…', 'info');
  modelList.innerHTML = '<div class="model-loading"><span class="spinner-xs"></span> Fetching from OpenRouter…</div>';
  try {
    const res  = await fetch('/models');
    const data = await res.json();
    state.allModels = data.models || [];
    renderModelList(state.allModels);
    setStatus(`${state.allModels.length} models available`, 'info', 5000);
  } catch (err) {
    console.warn('Could not load models:', err.message);
    state.allModels = [];
    modelList.innerHTML = '<div class="model-empty-msg">Could not load — type model ID manually below</div>';
    modelCount.textContent = '0 models';
    setStatus('Model list unavailable — type a model ID manually', 'info', 6000);
  }
}

function renderModelList(models) {
  modelList.innerHTML = '';

  if (!models.length) {
    modelList.innerHTML = '<div class="model-empty-msg">No matching models</div>';
    modelCount.textContent = '0 models';
    return;
  }

  /* Group by provider (text before first /) */
  const groups = {};
  for (const id of models) {
    const provider = id.includes('/') ? id.split('/')[0] : 'other';
    if (!groups[provider]) groups[provider] = [];
    groups[provider].push(id);
  }

  const sortedProviders = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  for (const provider of sortedProviders) {
    const grp = document.createElement('div');
    grp.className = 'model-group';

    const lbl = document.createElement('div');
    lbl.className = 'model-group-label';
    lbl.textContent = provider;
    grp.appendChild(lbl);

    for (const id of groups[provider]) {
      const item = document.createElement('div');
      item.className = 'model-item' + (id === state.selectedModel ? ' is-selected' : '');
      item.textContent = id;
      item.title = id;
      item.addEventListener('click', () => {
        selectModel(id);
        closeModelDropdown();
      });
      grp.appendChild(item);
    }

    modelList.appendChild(grp);
  }

  modelCount.textContent = `${models.length} model${models.length !== 1 ? 's' : ''}`;
}

function selectModel(id) {
  state.selectedModel = id;
  modelInput.value    = id;
  modelDisplay.textContent = id;

  /* Update highlight */
  $$('.model-item').forEach(el => {
    el.classList.toggle('is-selected', el.textContent === id);
  });
}

function openModelDropdown() {
  modelSelector.classList.add('is-open');
  modelTrigger.setAttribute('aria-expanded', 'true');
  modelSearch.value = '';
  renderModelList(state.allModels);
  requestAnimationFrame(() => modelSearch.focus());
}

function closeModelDropdown() {
  modelSelector.classList.remove('is-open');
  modelTrigger.setAttribute('aria-expanded', 'false');
}

/* Trigger click */
modelTrigger.addEventListener('click', e => {
  e.stopPropagation();
  modelSelector.classList.contains('is-open') ? closeModelDropdown() : openModelDropdown();
});

/* Search inside dropdown */
modelSearch.addEventListener('input', () => {
  const q = modelSearch.value.toLowerCase().trim();
  renderModelList(q ? state.allModels.filter(m => m.toLowerCase().includes(q)) : state.allModels);
});

modelSearch.addEventListener('click', e => e.stopPropagation());

/* Manual entry */
modelManualInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const v = modelManualInput.value.trim();
    if (v) {
      selectModel(v);
      modelManualInput.value = '';
      closeModelDropdown();
    }
  }
});

modelManualInput.addEventListener('click', e => e.stopPropagation());

/* Click outside closes */
document.addEventListener('click', e => {
  if (!modelSelector.contains(e.target)) closeModelDropdown();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModelDropdown();
});

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE TABS
   ═══════════════════════════════════════════════════════════════════════════ */

const panels = {
  'panel-sidebar':  $('panel-sidebar'),
  'panel-code':     $('panel-code'),
  'panel-preview':  $('panel-preview'),
};

function isMobile() { return window.innerWidth <= 680; }

function activateMobilePanel(panelId) {
  $$('.mob-tab').forEach(btn => {
    const active = btn.dataset.panel === panelId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (isMobile()) {
    Object.entries(panels).forEach(([id, el]) => {
      el.classList.toggle('mob-visible', id === panelId);
    });
  }
}

$$('.mob-tab').forEach(btn => {
  btn.addEventListener('click', () => activateMobilePanel(btn.dataset.panel));
});

window.addEventListener('resize', () => {
  if (!isMobile()) {
    Object.values(panels).forEach(p => p.classList.remove('mob-visible'));
  } else {
    const active = document.querySelector('.mob-tab.active');
    if (active) activateMobilePanel(active.dataset.panel);
  }
});

/* Init mobile state */
if (isMobile()) activateMobilePanel('panel-sidebar');

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATE
   ═══════════════════════════════════════════════════════════════════════════ */

generateBtn.addEventListener('click', generate);

promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate();
});

async function generate() {
  const prompt = promptInput.value.trim();
  const model  = state.selectedModel.trim() || modelInput.value.trim();

  if (!prompt) { setStatus('Enter a prompt first', 'err', 4000); return; }
  if (!model)  { setStatus('Select or type a model first', 'err', 4000); return; }

  setGenerating(true);
  setStatus('Calling OpenRouter — please wait…', 'busy');

  let data;

  try {
    let res;
    try {
      res = await fetch('/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt, model }),
      });
    } catch (networkErr) {
      // Network-level failure (server down, no connection, etc.)
      throw new Error('Network error — could not reach the server. Is it running? ' + networkErr.message);
    }

    // Parse JSON — never silently swallow a non-JSON body
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`Server returned non-JSON (HTTP ${res.status}). Check server logs.`);
    }

    // HTTP error (4xx / 5xx) — surface the error field from body
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : `Server error ${res.status}`;
      throw new Error(msg);
    }

    // Body parsed OK but contains a server-side error field
    if (data.error) {
      throw new Error(data.error);
    }

    // Validate that files exists and is a non-empty object
    if (!data.files || typeof data.files !== 'object' || Array.isArray(data.files)) {
      throw new Error('Server response is missing the "files" object — no output was produced.');
    }

    const fileKeys = Object.keys(data.files);
    if (fileKeys.length === 0) {
      throw new Error('Server returned an empty "files" object — no output was produced.');
    }

    // Validate index.html actually contains HTML
    const indexHtml = data.files['index.html'];
    if (!indexHtml || typeof indexHtml !== 'string' || indexHtml.trim().length < 20) {
      throw new Error('index.html is missing or blank in the server response.');
    }

    // All good — apply results
    state.files = data.files;
    renderFileTree();
    buildPreview();

    const fileCount = fileKeys.length;
    const warningNote = data.warning ? ' ⚠ ' + data.warning : '';
    const statusMsg = `Generated ${fileCount} file${fileCount !== 1 ? 's' : ''} successfully${warningNote}`;
    setStatus(statusMsg, data.warning ? 'info' : 'ok', data.warning ? 12000 : 8000);
    statusModel.textContent = model;

    if (isMobile()) activateMobilePanel('panel-preview');

  } catch (err) {
    console.error('[generate]', err);
    // Always show error in UI — never silently fail
    // Use duration=0 so the error stays visible until next action
    setStatus('Error: ' + err.message, 'err', 0);
  } finally {
    // ALWAYS close the overlay and re-enable the button, no matter what happened
    setGenerating(false);
  }
}

function setGenerating(active) {
  generateBtn.disabled = active;
  // Always force-remove hidden class when stopping, in case it was somehow already removed
  if (active) {
    genOverlay.classList.remove('hidden');
  } else {
    genOverlay.classList.add('hidden');
  }

  if (active) {
    generateBtn.innerHTML = `
      <span class="spinner-xs" style="border-color:rgba(255,255,255,.2);border-top-color:#fff;width:12px;height:12px;border-width:2px;"></span>
      <span class="generate-label">Generating…</span>`;
  } else {
    generateBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" class="generate-icon"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
      <span class="generate-label">Generate</span>`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FILE TREE
   ═══════════════════════════════════════════════════════════════════════════ */

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  /* Returns inline SVG path data or a unicode fallback */
  if (ext === 'html') return `<svg class="file-item-icon" viewBox="0 0 16 16" fill="none"><path d="M3 2h10l-1 12-5 2-5-2L3 2zm3 7l4 1.5M10 5H6" stroke="#e8834a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (ext === 'css')  return `<svg class="file-item-icon" viewBox="0 0 16 16" fill="none"><path d="M3 2h10l-1 12-5 2-5-2L3 2zm3 7l4-1M7 5l4 1" stroke="#4a9eff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (ext === 'js')   return `<svg class="file-item-icon" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#f5c842" stroke-width="1.2"/><path d="M6 9.5c0 1 .8 1.5 1.5 1.5s1.5-.5 1.5-1.5V6" stroke="#f5c842" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  return `<svg class="file-item-icon" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l4 4v8H3V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 2v4h4" stroke="currentColor" stroke-width="1.2"/></svg>`;
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}KB`;
}

function renderFileTree() {
  fileTree.innerHTML = '';
  const keys = Object.keys(state.files);

  if (!keys.length) {
    fileTree.appendChild(sidebarEmpty);
    return;
  }

  for (const key of keys) {
    const size = formatBytes(new Blob([state.files[key] || '']).size);
    const item = document.createElement('div');
    item.className = 'file-item' + (key === state.currentFile ? ' is-active' : '');
    item.dataset.key = key;
    item.innerHTML = `
      ${getFileIcon(key)}
      <span class="file-item-name">${key}</span>
      <span class="file-item-size">${size}</span>
    `;
    item.addEventListener('click', () => {
      openFile(key);
      if (isMobile()) activateMobilePanel('panel-code');
    });
    fileTree.appendChild(item);
  }

  /* Auto-select first */
  openFile(keys[0]);
}

function openFile(key) {
  if (!state.files[key] && state.files[key] !== '') return;
  state.currentFile = key;

  /* Sidebar highlight */
  $$('.file-item').forEach(el => el.classList.toggle('is-active', el.dataset.key === key));

  /* File tabs */
  fileTabsRow.innerHTML = '';
  const tab = document.createElement('div');
  tab.className = 'file-tab-item is-active';
  tab.innerHTML = `${getFileIcon(key)}<span>${key}</span>`;
  fileTabsRow.appendChild(tab);

  /* Code display */
  codeContent.textContent = state.files[key] || '';
  codeContent.classList.remove('is-empty');
}

/* ═══════════════════════════════════════════════════════════════════════════
   COPY CODE
   ═══════════════════════════════════════════════════════════════════════════ */

copyCodeBtn.addEventListener('click', () => {
  if (!state.currentFile) return;
  const code = state.files[state.currentFile] || '';
  navigator.clipboard.writeText(code).then(() => {
    copyCodeBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="var(--ok)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    setTimeout(() => {
      copyCodeBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M2 11V3a1 1 0 0 1 1-1h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    }, 2200);
  }).catch(() => {});
});

/* ═══════════════════════════════════════════════════════════════════════════
   PREVIEW
   ═══════════════════════════════════════════════════════════════════════════ */

/*
  Fallback base CSS — injected when the AI's style.css is weak (<300 chars)
  Gives any generated page a clean, modern foundation.
*/
const FALLBACK_BASE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --c-primary:#6366f1;--c-primary-dark:#4f46e5;
  --c-text:#111827;--c-muted:#6b7280;
  --c-bg:#f9fafb;--c-surface:#ffffff;
  --c-border:#e5e7eb;--c-shadow:rgba(0,0,0,0.07);
  --radius:12px;--radius-sm:6px;
}
html{scroll-behavior:smooth;font-size:16px}
body{font-family:'Inter',system-ui,sans-serif;background:var(--c-bg);color:var(--c-text);line-height:1.65;-webkit-font-smoothing:antialiased}
h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:800;letter-spacing:-0.04em;line-height:1.1}
h2{font-size:clamp(1.5rem,3.5vw,2.4rem);font-weight:700;letter-spacing:-0.025em;line-height:1.2}
h3{font-size:1.2rem;font-weight:600;letter-spacing:-0.01em}
p{color:var(--c-muted);line-height:1.75;margin-bottom:1em}
a{color:var(--c-primary);text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;height:auto;display:block;border-radius:8px}
.container{max-width:1160px;margin:0 auto;padding:0 24px}
nav,header{background:rgba(255,255,255,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--c-border);padding:16px 0;position:sticky;top:0;z-index:100}
section{padding:88px 0}
.btn,button{display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:var(--c-primary);color:#fff;border:none;border-radius:50px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:0 4px 18px rgba(99,102,241,.3)}
.btn:hover,button:hover{background:var(--c-primary-dark);transform:translateY(-2px);box-shadow:0 8px 28px rgba(99,102,241,.4)}
.card{background:var(--c-surface);border-radius:var(--radius);padding:28px;box-shadow:0 2px 20px var(--c-shadow);border:1px solid var(--c-border);transition:all .22s}
.card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,.11)}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}
.grid-3{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}
footer{background:#111827;color:rgba(255,255,255,.55);padding:56px 0;text-align:center;font-size:14px}
input,textarea,select{font-family:inherit;padding:12px 16px;border:1.5px solid var(--c-border);border-radius:8px;font-size:15px;width:100%;background:var(--c-surface);transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--c-primary);box-shadow:0 0 0 3px rgba(99,102,241,.14)}
@media(max-width:640px){section{padding:56px 0}.container{padding:0 18px}}
`;

function buildPreview() {
  const html = state.files['index.html'] || '';
  const css  = state.files['style.css']  || '';
  const js   = state.files['script.js']  || '';

  if (!html) {
    previewFrame.srcdoc = '';
    previewFrame.classList.remove('is-loaded');
    previewPlaceholder.classList.remove('is-hidden');
    return;
  }

  let full = html;

  const cssIsWeak    = css.length < 300;
  const hasCSSLink   = /<link[^>]+\.css["'][^>]*>/i.test(full);
  const hasStyleTag  = /<style[\s>]/i.test(full);
  const hasScriptSrc = /<script[^>]+src=/i.test(full);
  const hasScriptTag = /<script[\s>]/i.test(full);

  /* Build style block to inject */
  let styleInject = '';
  if (cssIsWeak && !hasCSSLink) {
    styleInject += `<style id="__fb">${FALLBACK_BASE}</style>\n`;
  }
  if (css && !hasCSSLink && !hasStyleTag) {
    styleInject += `<style id="__gen">${css}</style>\n`;
  }

  /* Build script block to inject */
  let scriptInject = '';
  if (js && !hasScriptSrc && !hasScriptTag) {
    scriptInject = `<script id="__gen">${js}<\/script>\n`;
  }

  /* Inject CSS into <head> */
  if (styleInject) {
    if (/<\/head>/i.test(full)) {
      full = full.replace(/<\/head>/i, `${styleInject}</head>`);
    } else if (/<head[^>]*>/i.test(full)) {
      full = full.replace(/<head[^>]*>/i, m => `${m}\n${styleInject}`);
    } else if (/<html[^>]*>/i.test(full)) {
      full = full.replace(/<html[^>]*>/i, m => `${m}\n<head>${styleInject}</head>`);
    } else {
      full = styleInject + full;
    }
  }

  /* Inject JS before </body> */
  if (scriptInject) {
    if (/<\/body>/i.test(full)) {
      full = full.replace(/<\/body>/i, `${scriptInject}</body>`);
    } else {
      full += '\n' + scriptInject;
    }
  }

  state.previewSrcdoc = full;

  previewFrame.classList.remove('is-loaded');
  previewPlaceholder.classList.remove('is-hidden');

  previewFrame.srcdoc = full;

  previewFrame.onload = () => {
    previewFrame.classList.add('is-loaded');
    previewPlaceholder.classList.add('is-hidden');
  };
}

refreshBtn.addEventListener('click', buildPreview);

newTabBtn.addEventListener('click', () => {
  if (!state.previewSrcdoc) return;
  const w = window.open('', '_blank');
  if (w) { w.document.write(state.previewSrcdoc); w.document.close(); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════════════════ */

let _statusTimer = null;

function setStatus(msg, type = '', duration = 0) {
  statusText.textContent = msg;
  statusBar.className = 'status-bar' + (type ? ` s-${type}` : '');
  if (_statusTimer) { clearTimeout(_statusTimer); _statusTimer = null; }
  if (duration > 0) {
    _statusTimer = setTimeout(() => {
      statusText.textContent = 'Ready';
      statusBar.className = 'status-bar';
      _statusTimer = null;
    }, duration);
  }
  // duration === 0 means sticky — do NOT auto-reset (covers errors)
}

/* ═══════════════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════════════ */

loadModels();
setStatus('Ready — enter a prompt and click Generate', '', 0);
