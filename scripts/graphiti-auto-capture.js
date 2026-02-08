#!/usr/bin/env node
/**
 * Graph RAG Auto-Capture — Watches for new session messages and embeds them
 * 
 * Designed to run as a cron job (every 15 minutes)
 * Tracks last-processed timestamp to avoid duplicates
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SESSIONS_DIR = '/home/tgree/.openclaw/agents/main/sessions';
const GRAPHITI_URL = process.env.GRAPHITI_URL || 'http://localhost:18000';
const STATE_FILE = '/home/tgree/clawd/.graphiti-capture-state.json';
const BATCH_SIZE = 5;
const RATE_LIMIT_MS = 1000;

/**
 * Load last capture state
 */
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastRun: null, processedFiles: {} };
  }
}

/**
 * Save capture state
 */
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Parse session and extract new messages since lastTimestamp
 */
async function extractNewMessages(filePath, lastTimestamp) {
  const messages = [];
  let sessionMeta = null;
  
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      
      if (entry.type === 'session') {
        sessionMeta = { id: entry.id, timestamp: entry.timestamp };
      }
      
      if (entry.type === 'message' && entry.message) {
        const msg = entry.message;
        const role = msg.role;
        const ts = entry.timestamp;
        
        // Skip if already processed
        if (lastTimestamp && ts <= lastTimestamp) continue;
        
        if (role === 'user' || role === 'assistant') {
          let text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            text = msg.content
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
              .join('\n');
          }
          
          if (text.trim() && text.length > 20 && !text.startsWith('[cron:')) {
            messages.push({
              role_type: role,
              role: role === 'user' ? 'Tom' : 'Kit',
              content: text.slice(0, 3000),
              timestamp: ts || new Date().toISOString()
            });
          }
        }
      }
    } catch {}
  }
  
  return { sessionMeta, messages };
}

/**
 * Embed messages to Graphiti
 */
async function embedBatch(groupId, messages) {
  try {
    const response = await fetch(`${GRAPHITI_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, messages })
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Main auto-capture loop
 */
async function autoCapture() {
  const state = loadState();
  const now = new Date().toISOString();
  
  console.log(`[${now}] Auto-capture starting...`);
  console.log(`Last run: ${state.lastRun || 'never'}`);
  
  // Find recently modified session files (last 30 minutes)
  const cutoff = Date.now() - (30 * 60 * 1000);
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(SESSIONS_DIR, f),
      mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs
    }))
    .filter(f => f.mtime > cutoff)
    .sort((a, b) => b.mtime - a.mtime);
  
  console.log(`Found ${files.length} recently modified sessions`);
  
  let totalNew = 0;
  
  for (const file of files) {
    const lastTs = state.processedFiles[file.name] || null;
    const { sessionMeta, messages } = await extractNewMessages(file.path, lastTs);
    
    if (messages.length === 0) continue;
    
    const date = sessionMeta?.timestamp?.split('T')[0] || new Date().toISOString().split('T')[0];
    const groupId = `tom-kit-dm-${date}`;
    
    console.log(`  ${file.name}: ${messages.length} new messages → ${groupId}`);
    
    // Embed in batches
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      await embedBatch(groupId, batch);
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
    
    totalNew += messages.length;
    
    // Update state with latest timestamp
    const latestTs = messages[messages.length - 1].timestamp;
    state.processedFiles[file.name] = latestTs;
  }
  
  state.lastRun = now;
  saveState(state);
  
  console.log(`Captured ${totalNew} new messages. State saved.`);
}

autoCapture().catch(console.error);
