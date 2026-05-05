'use strict';

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are a website code generator. You must respond ONLY with valid JSON. No markdown, no explanations, no prose, no code fences.

Output format EXACTLY like this:
{"files":{"index.html":"<!DOCTYPE html>...","style.css":"body { ... }","script.js":"console.log('hello');"}}

Rules:
- index.html must be a complete valid HTML document
- style.css must be complete CSS
- script.js must be working JavaScript
- All string values must have special characters properly escaped for JSON
- Respond with ONLY the JSON object. Nothing before it. Nothing after it.`;

function stripFences(text) {
  return text
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
}

function extractJSON(text) {
  const stripped = stripFences(text);
  // Try direct parse first
  try {
    return JSON.parse(stripped);
  } catch (_) {}
  // Try to find JSON object within the text
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(stripped.slice(start, end + 1));
    } catch (_) {}
  }
  return null;
}

async function callOpenRouter(apiKey, model, messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com',
      'X-Title': 'AI Website Generator'
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.2,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from API');
  }
  return content;
}

app.post('/generate', async (req, res) => {
  const { prompt, model } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (!model || !model.trim()) {
    return res.status(400).json({ error: 'Model is required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured on server' });
  }

  const userPrompt = `Create a website: ${prompt.trim()}\n\nRespond ONLY with the JSON object. No markdown. No explanation.`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  try {
    // First attempt
    let content;
    try {
      content = await callOpenRouter(apiKey, model, messages);
    } catch (apiErr) {
      console.error('API call failed:', apiErr.message);
      return res.status(502).json({ error: apiErr.message });
    }

    let parsed = extractJSON(content);

    // Retry once if first parse failed
    if (!parsed) {
      console.warn('First response was not valid JSON, retrying...');
      const retryMessages = [
        ...messages,
        { role: 'assistant', content: content },
        {
          role: 'user',
          content: 'Your response was not valid JSON. Respond ONLY with the raw JSON object — no markdown fences, no explanation, nothing else.'
        }
      ];

      let retryContent;
      try {
        retryContent = await callOpenRouter(apiKey, model, retryMessages);
      } catch (retryErr) {
        console.error('Retry API call failed:', retryErr.message);
        return res.status(502).json({ error: 'Retry failed: ' + retryErr.message });
      }

      parsed = extractJSON(retryContent);

      if (!parsed) {
        return res.status(500).json({
          error: 'Model returned invalid JSON twice. Try a different model or simpler prompt.',
          raw: retryContent.substring(0, 500)
        });
      }
    }

    if (!parsed.files || typeof parsed.files !== 'object') {
      return res.status(500).json({
        error: 'Response JSON missing "files" object.',
        received: JSON.stringify(parsed).substring(0, 300)
      });
    }

    // Ensure at least index.html exists
    if (!parsed.files['index.html']) {
      parsed.files['index.html'] = '<html><body><h1>Generated Site</h1></body></html>';
    }

    return res.json({ files: parsed.files });

  } catch (error) {
    console.error('Unexpected server error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
