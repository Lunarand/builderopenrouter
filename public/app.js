'use strict';

let currentFiles = {};
let currentFileKey = null;

const promptInput      = document.getElementById('promptInput');
const modelInput       = document.getElementById('modelInput');
const generateBtn      = document.getElementById('generateBtn');
const fileListEl       = document.getElementById('fileList');
const codeDisplay      = document.getElementById('codeDisplay');
const codeContent      = document.getElementById('codeContent');
const currentFileName  = document.getElementById('currentFileName');
const previewFrame     = document.getElementById('previewFrame');
const statusBar        = document.getElementById('statusBar');
const refreshPreviewBtn = document.getElementById('refreshPreviewBtn');

// ── Event listeners ──────────────────────────────────────────────────────────

generateBtn.addEventListener('click', handleGenerate);
refreshPreviewBtn.addEventListener('click', updatePreview);

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    handleGenerate();
  }
});

// ── Generate ─────────────────────────────────────────────────────────────────

async function handleGenerate() {
  const prompt = promptInput.value.trim();
  const model  = modelInput.value.trim();

  if (!prompt) { showStatus('Please enter a prompt.', 'error'); return; }
  if (!model)  { showStatus('Please enter a model name.', 'error'); return; }

  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ Generating…';
  showStatus('Calling OpenRouter API — this may take 15–30 seconds…', 'info');

  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model })
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new Error('Server returned non-JSON response. Check Actions logs.');
    }

    if (!response.ok) {
      throw new Error(data.error || `Server error ${response.status}`);
    }

    if (!data.files || typeof data.files !== 'object') {
      throw new Error('No files received from server.');
    }

    currentFiles = data.files;
    renderFileList();
    updatePreview();
    showStatus('✅ Website generated successfully!', 'success');

  } catch (err) {
    console.error('Generation error:', err);
    showStatus('❌ Error: ' + err.message, 'error');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '▶ Generate';
  }
}

// ── File list ────────────────────────────────────────────────────────────────

function getFileIcon(filename) {
  if (filename.endsWith('.html')) return '🌐';
  if (filename.endsWith('.css'))  return '🎨';
  if (filename.endsWith('.js'))   return '⚡';
  return '📄';
}

function renderFileList() {
  fileListEl.innerHTML = '';
  const keys = Object.keys(currentFiles);

  if (keys.length === 0) {
    fileListEl.innerHTML = '<div class="empty-msg">No files generated.</div>';
    return;
  }

  keys.forEach(key => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.key = key;
    item.innerHTML = `<span class="file-icon">${getFileIcon(key)}</span><span>${key}</span>`;
    item.addEventListener('click', () => selectFile(key));
    fileListEl.appendChild(item);
  });

  // Auto-select first file
  selectFile(keys[0]);
}

function selectFile(key) {
  if (!currentFiles[key]) return;
  currentFileKey = key;

  // Update active state
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('active', el.dataset.key === key);
  });

  currentFileName.textContent = key;
  codeContent.textContent = currentFiles[key];
}

// ── Preview ──────────────────────────────────────────────────────────────────

function updatePreview() {
  const html = currentFiles['index.html'] || '';
  const css  = currentFiles['style.css']  || '';
  const js   = currentFiles['script.js']  || '';

  if (!html) {
    // Render a simple message if no HTML exists yet
    previewFrame.srcdoc = '<html><body style="font-family:sans-serif;padding:2rem;color:#555"><p>No preview yet. Generate a website first.</p></body></html>';
    return;
  }

  let full = html;

  // Inject CSS if not already linked/embedded
  if (css && !/<link[^>]+style\.css/i.test(full) && !/<style[\s>]/i.test(full)) {
    if (/<\/head>/i.test(full)) {
      full = full.replace(/<\/head>/i, `<style>\n${css}\n</style>\n</head>`);
    } else {
      full = `<style>\n${css}\n</style>\n` + full;
    }
  }

  // Inject JS if not already linked/embedded
  if (js && !/<script[\s>]/i.test(full)) {
    if (/<\/body>/i.test(full)) {
      full = full.replace(/<\/body>/i, `<script>\n${js}\n<\/script>\n</body>`);
    } else {
      full = full + `\n<script>\n${js}\n<\/script>`;
    }
  }

  // Use srcdoc — works reliably without blob URLs, no revoke needed
  previewFrame.srcdoc = full;
}

// ── Status bar ───────────────────────────────────────────────────────────────

let statusTimer = null;

function showStatus(message, type) {
  statusBar.textContent = message;
  statusBar.className = 'show ' + (type || 'info');

  if (statusTimer) clearTimeout(statusTimer);

  if (type === 'success' || type === 'error') {
    statusTimer = setTimeout(() => {
      statusBar.className = '';
    }, 5000);
  }
}
