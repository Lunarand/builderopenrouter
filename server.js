'use strict';

const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ── Prompt ─────────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are an expert front-end developer and designer. Your job is to generate complete, beautiful, modern websites.

You MUST respond with ONLY a valid JSON object — no markdown fences, no explanation, no preamble, no prose.

Exact format:
{"files":{"index.html":"<!DOCTYPE html>...","style.css":"/* css */","script.js":"// js"}}

STRICT RULES:
1. index.html must be a complete, valid HTML5 document starting with <!DOCTYPE html>
2. style.css must be a full, modern CSS file — include variables, flexbox/grid, hover effects, transitions, media queries, good typography and color palette. Minimum 100 lines. DO NOT output weak or unstyled CSS.
3. script.js must be working JavaScript (empty string only if truly unnecessary)
4. ALL JSON string values must have special characters properly JSON-escaped (newlines as \\n, quotes as \\", backslashes as \\\\)
5. Generate a VISUALLY IMPRESSIVE, PRODUCTION-READY website — not a basic unstyled page
6. Use Google Fonts via @import or <link>, beautiful color palettes, smooth animations, responsive design
7. Output ONLY the JSON object. Nothing before or after it.`;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function stripFences(text) {
  return text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function extractJSON(raw) {
  const t = stripFences(raw);
  try { return JSON.parse(t); } catch (_) {}
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { return JSON.parse(t.slice(s, e + 1)); } catch (_) {}
  }
  return null;
}

async function callOpenRouter(apiKey, model, messages, extraOptions = {}) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/webforge-ai',
      'X-Title': 'WebForge AI'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 4000,
      ...extraOptions
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Model returned empty content');
  return content;
}

/* ── GET /models ─────────────────────────────────────────────────────────── */

app.get('/models', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set', models: [] });
  }
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`OpenRouter models API ${response.status}`);
    }
    const data = await response.json();
    const models = (data.data || [])
      .map(m => m.id)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return res.json({ models });
  } catch (err) {
    console.error('[/models]', err.message);
    return res.status(500).json({ error: err.message, models: [] });
  }
});

/* ── POST /generate ──────────────────────────────────────────────────────── */

app.post('/generate', async (req, res) => {
  const { prompt, model } = req.body;

  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });
  if (!model?.trim())  return res.status(400).json({ error: 'Model is required' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not set on server' });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Create a website: ${prompt.trim()}\n\nOutput ONLY the JSON object. No explanation. No markdown.`
    }
  ];

  try {
    /* Attempt 1 */
    let raw;
    try {
      raw = await callOpenRouter(apiKey, model.trim(), messages);
    } catch (err) {
      console.error('[/generate] API call failed:', err.message);
      return res.status(502).json({ error: err.message });
    }

    let parsed = extractJSON(raw);

    /* Attempt 2 — retry with stricter nudge */
    if (!parsed) {
      console.warn('[/generate] Attempt 1 invalid JSON — retrying');
      const retryMessages = [
        ...messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: 'That was not valid JSON. Respond with ONLY the raw JSON object. No markdown, no explanation, nothing else whatsoever.'
        }
      ];
      try {
        const raw2 = await callOpenRouter(apiKey, model.trim(), retryMessages);
        parsed = extractJSON(raw2);
        if (!parsed) {
          return res.status(500).json({
            error: 'Model returned invalid JSON after 2 attempts. Try a smarter model (claude-3.5-sonnet, gpt-4o, gemini-pro-1.5).',
            rawSnippet: raw2.slice(0, 300)
          });
        }
      } catch (err) {
        return res.status(502).json({ error: 'Retry failed: ' + err.message });
      }
    }

    if (!parsed.files || typeof parsed.files !== 'object') {
      return res.status(500).json({ error: 'Response JSON is missing the "files" object.' });
    }

    /* Ensure index.html always exists */
    if (!parsed.files['index.html']) {
      parsed.files['index.html'] = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Generated</title></head><body><h1>Generated</h1></body></html>';
    }

    /* Ensure style.css always exists */
    if (!parsed.files['style.css']) {
      parsed.files['style.css'] = '';
    }

    /* Ensure script.js always exists */
    if (!parsed.files['script.js']) {
      parsed.files['script.js'] = '';
    }

    return res.json({ files: parsed.files });

  } catch (err) {
    console.error('[/generate] Unexpected:', err);
    return res.status(500).json({ error: err.message });
  }
});

/* ── Start ───────────────────────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`\n  ✅ WebForge AI running → http://localhost:${PORT}\n`);
});
