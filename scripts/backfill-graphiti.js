#!/usr/bin/env node
/**
 * Graph RAG Backfill — Embeds all OpenClaw session history into Graphiti
 *
 * Parses JSONL session files → extracts user/assistant messages →
 * batches into Graphiti with appropriate group_ids
 *
 * Usage: node backfill-graphiti.js [--dry-run] [--limit N] [--since YYYY-MM-DD] [--rate-limit-ms N]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { setTimeout: sleep } = require('timers/promises');

const SESSIONS_DIRS = [
  '/home/tgree/.openclaw/agents/main/sessions',
  '/home/tgree/clawd/memory/chatlogs'
];
const GRAPHITI_URL = process.env.GRAPHITI_URL || 'http://localhost:18000';

const BATCH_SIZE = 5; // Smaller batches for reliability
const DEFAULT_RATE_LIMIT_MS = 1500; // Be gentle with OpenAI embeddings
const MAX_RATE_LIMIT_MS = 30000;
const MIN_MESSAGES = 3; // Skip sessions with fewer messages (cron noise)

const STATE_PATH =
  process.env.GRAPHITI_BACKFILL_STATE_PATH ||
  '/home/tgree/clawd/.graphiti-backfill-state.json';

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

const limitRaw = getFlagValue('--limit');
const LIMIT = limitRaw ? Number.parseInt(limitRaw, 10) : Infinity;

const sinceRaw = getFlagValue('--since');
const SINCE = sinceRaw ? new Date(sinceRaw) : null;

const rateLimitRaw = getFlagValue('--rate-limit-ms');
let rateLimitMs = rateLimitRaw
  ? Math.max(0, Number.parseInt(rateLimitRaw, 10))
  : DEFAULT_RATE_LIMIT_MS;
if (!Number.isFinite(rateLimitMs)) rateLimitMs = DEFAULT_RATE_LIMIT_MS;

let stats = {
  filesTotal: 0,
  filesSeen: 0,
  filesProcessed: 0,
  filesSkipped: 0,
  filesAlreadyProcessed: 0,
  filesAlreadySkipped: 0,
  filesFailed: 0,
  messagesExtracted: 0,
  messagesEmbedded: 0,
  batchesSent: 0,
  batchesFailed: 0,
  retries: 0,
  rateLimitHits: 0,
  startTime: Date.now()
};

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {
      version: 1,
      processed: {},
      skipped: {},
      failed: {},
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
  }

  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      processed: parsed.processed || {},
      skipped: parsed.skipped || {},
      failed: parsed.failed || {},
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || null
    };
  } catch (err) {
    console.error(`WARN: Failed to parse state file at ${STATE_PATH} (${err.message}). Starting fresh.`);
    return {
      version: 1,
      processed: {},
      skipped: {},
      failed: {},
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
  }
}

function saveState(state) {
  if (DRY_RUN) return;
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

const state = loadState();

// Back-compat: older runs wrote processed files to this legacy state file.
// Import them so we don't duplicate already-ingested sessions.
const LEGACY_CAPTURE_STATE_PATH = '/home/tgree/clawd/.graphiti-capture-state.json';

function mergeLegacyCaptureState(stateObj) {
  if (!fs.existsSync(LEGACY_CAPTURE_STATE_PATH)) return 0;

  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_CAPTURE_STATE_PATH, 'utf8'));
    const processedFiles = legacy.processedFiles || {};

    let added = 0;
    for (const [fileName, processedAt] of Object.entries(processedFiles)) {
      if (stateObj.processed?.[fileName] || stateObj.skipped?.[fileName]) continue;
      stateObj.processed[fileName] = {
        processedAt: processedAt || new Date().toISOString(),
        groupId: 'legacy-import',
        messages: null,
        timestamp: null,
        importedFrom: LEGACY_CAPTURE_STATE_PATH
      };
      added++;
    }

    if (added > 0) {
      console.log(
        `Imported ${added} processed files from legacy state: ${LEGACY_CAPTURE_STATE_PATH}`
      );
    }
    return added;
  } catch (err) {
    console.error(
      `WARN: Failed to import legacy state from ${LEGACY_CAPTURE_STATE_PATH} (${err.message})`
    );
    return 0;
  }
}

const importedLegacyCount = mergeLegacyCaptureState(state);
if (importedLegacyCount > 0) saveState(state);

/**
 * Parse a single JSONL session file and extract messages
 */
async function parseSession(filePath) {
  const messages = [];
  let sessionMeta = null;
  const sourceFile = path.basename(filePath);

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);

      // Capture session metadata
      if (entry.type === 'session') {
        sessionMeta = {
          id: entry.id,
          timestamp: entry.timestamp,
          cwd: entry.cwd
        };
      }

      // Extract user and assistant messages
      // Format: entry.type === 'message', entry.message.role, entry.message.content[]
      if (entry.type === 'message' && entry.message) {
        const msg = entry.message;
        const role = msg.role;

        if (role === 'user' || role === 'assistant') {
          // Extract text content from content array
          let text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            text = msg.content
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
              .join('\n');
          }

          // Skip empty, tiny, or cron-only messages
          if (text.trim() && text.length > 20 && !text.startsWith('[cron:')) {
            messages.push({
              role_type: role,
              role: role === 'user' ? 'Tom' : 'Kit',
              content: text.slice(0, 3000), // Limit per message
              timestamp: entry.timestamp || sessionMeta?.timestamp || new Date().toISOString(),
              source_description: sourceFile
            });
          }
        }
      }
    } catch (e) {
      // Skip unparseable lines
    }
  }

  return { sessionMeta, messages };
}

/**
 * Determine group_id from session metadata and timestamp
 */
function getGroupId(sessionMeta) {
  if (!sessionMeta) return 'tom-kit-unknown';

  const date = sessionMeta.timestamp ? sessionMeta.timestamp.split('T')[0] : 'unknown';
  return `tom-kit-dm-${date}`;
}

function isRateLimit(status, bodyText) {
  if (status === 429) return true;
  const t = (bodyText || '').toLowerCase();
  return t.includes('rate limit') || t.includes('too many requests');
}

/**
 * Send a batch of messages to Graphiti
 */
async function embedBatch(groupId, messages) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would embed ${messages.length} messages to group ${groupId}`);
    return true;
  }

  const maxAttempts = 5;
  let lastStatus = null;
  let lastBody = '';
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${GRAPHITI_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          messages: messages
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok || response.status === 202) {
        return true;
      }

      lastStatus = response.status;
      lastBody = await response.text().catch(() => '');

      const rateLimited = isRateLimit(response.status, lastBody);
      if (rateLimited) {
        stats.rateLimitHits++;
        const next = Math.min(Math.round(rateLimitMs * 1.5), MAX_RATE_LIMIT_MS);
        if (next !== rateLimitMs) {
          rateLimitMs = next;
          console.log(`  Rate limit detected. Increasing delay to ${rateLimitMs}ms`);
        }
      }

      if ((rateLimited || response.status >= 500) && attempt < maxAttempts) {
        stats.retries++;
        await sleep(rateLimitMs);
        continue;
      }

      break;
    } catch (err) {
      lastErr = err;
      const msg = err?.name === 'AbortError' ? 'Request timed out' : err?.message || String(err);
      const rateLimited = msg.toLowerCase().includes('rate limit');
      if (rateLimited) {
        stats.rateLimitHits++;
        const next = Math.min(Math.round(rateLimitMs * 1.5), MAX_RATE_LIMIT_MS);
        if (next !== rateLimitMs) {
          rateLimitMs = next;
          console.log(`  Rate limit detected. Increasing delay to ${rateLimitMs}ms`);
        }
      }

      if ((rateLimited || attempt < maxAttempts)) {
        stats.retries++;
        await sleep(rateLimitMs);
        continue;
      }

      break;
    }
  }

  stats.errors = (stats.errors || 0) + 1;
  stats.batchesFailed++;

  if (lastErr) {
    const msg = lastErr?.name === 'AbortError' ? 'Request timed out' : lastErr?.message || String(lastErr);
    console.error(`  Batch failed: ${msg}`);
  } else {
    console.error(`  Batch failed (${lastStatus}): ${(lastBody || '').slice(0, 200)}`);
  }

  return false;
}

/**
 * Process all session files
 */
async function backfill() {
  console.log('=== Graph RAG Backfill ===');
  console.log(`Sessions dirs: ${SESSIONS_DIRS.join(', ')}`);
  console.log(`Graphiti URL: ${GRAPHITI_URL}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Limit: ${LIMIT === Infinity ? 'none' : LIMIT}`);
  console.log(`Since: ${SINCE || 'all time'}`);
  console.log(`State file: ${STATE_PATH}`);
  console.log(`Initial delay: ${rateLimitMs}ms`);
  console.log('');

  // Get all session files from all directories
  const files = [];
  const seen = new Set();
  for (const dir of SESSIONS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const dirFiles = fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, path: path.join(dir, f) }));
    for (const f of dirFiles) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        files.push(f);
      }
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));

  stats.filesTotal = files.length;

  const alreadyProcessedCount = Object.keys(state.processed || {}).length;
  const alreadySkippedCount = Object.keys(state.skipped || {}).length;

  console.log(
    `Found ${files.length} unique session files across ${SESSIONS_DIRS.length} directories ` +
      `(state: ${alreadyProcessedCount} processed, ${alreadySkippedCount} skipped)`
  );

  const PROGRESS_EVERY_SEEN = 100;

  for (let idx = 0; idx < files.length; idx++) {
    if (stats.filesProcessed >= LIMIT) break;

    const file = files[idx];
    const fileName = file.name;

    stats.filesSeen++;

    if (state.processed?.[fileName]) {
      stats.filesAlreadyProcessed++;
      if (stats.filesSeen % PROGRESS_EVERY_SEEN === 0) {
        const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
        const pct = ((stats.filesSeen / stats.filesTotal) * 100).toFixed(1);
        console.log(
          `--- Progress: ${stats.filesSeen}/${stats.filesTotal} files seen (${pct}%), ` +
            `processed ${stats.filesProcessed}, skipped ${stats.filesSkipped}, ` +
            `already ${stats.filesAlreadyProcessed + stats.filesAlreadySkipped}, failed ${stats.filesFailed}, ` +
            `${stats.messagesEmbedded} embedded, delay ${rateLimitMs}ms, ${elapsed}s ---`
        );
      }
      continue;
    }

    if (state.skipped?.[fileName]) {
      stats.filesAlreadySkipped++;
      if (stats.filesSeen % PROGRESS_EVERY_SEEN === 0) {
        const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
        const pct = ((stats.filesSeen / stats.filesTotal) * 100).toFixed(1);
        console.log(
          `--- Progress: ${stats.filesSeen}/${stats.filesTotal} files seen (${pct}%), ` +
            `processed ${stats.filesProcessed}, skipped ${stats.filesSkipped}, ` +
            `already ${stats.filesAlreadyProcessed + stats.filesAlreadySkipped}, failed ${stats.filesFailed}, ` +
            `${stats.messagesEmbedded} embedded, delay ${rateLimitMs}ms, ${elapsed}s ---`
        );
      }
      continue;
    }

    let sessionMeta, messages;
    try {
      ({ sessionMeta, messages } = await parseSession(file.path));
    } catch (err) {
      console.error(`ERROR: Failed to parse ${fileName}: ${err.message}`);
      stats.filesFailed++;
      state.failed[fileName] = {
        failedAt: new Date().toISOString(),
        reason: 'parse_error',
        error: err.message
      };
      saveState(state);
      continue;
    }

    // Skip if before --since date (do not persist)
    if (SINCE && sessionMeta?.timestamp) {
      const sessionDate = new Date(sessionMeta.timestamp);
      if (sessionDate < SINCE) {
        stats.filesSkipped++;
        continue;
      }
    }

    // Skip sessions with too few messages (cron noise) (persist)
    if (messages.length < MIN_MESSAGES) {
      stats.filesSkipped++;
      state.skipped[fileName] = {
        skippedAt: new Date().toISOString(),
        reason: 'min_messages',
        messages: messages.length,
        timestamp: sessionMeta?.timestamp || null
      };
      saveState(state);
      continue;
    }

    const groupId = getGroupId(sessionMeta);

    console.log(
      `[${stats.filesProcessed + 1}] ${fileName}: ${messages.length} messages → ${groupId} (delay ${rateLimitMs}ms)`
    );

    stats.messagesExtracted += messages.length;

    // Batch embed
    let fileOk = true;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const ok = await embedBatch(groupId, batch);

      if (!ok) {
        fileOk = false;
        break;
      }

      stats.messagesEmbedded += batch.length;
      stats.batchesSent++;

      // Rate limit
      await sleep(rateLimitMs);
    }

    if (fileOk) {
      stats.filesProcessed++;
      state.processed[fileName] = {
        processedAt: new Date().toISOString(),
        groupId,
        messages: messages.length,
        timestamp: sessionMeta?.timestamp || null
      };
      if (state.failed?.[fileName]) delete state.failed[fileName];
      saveState(state);
    } else {
      stats.filesFailed++;
      state.failed[fileName] = {
        failedAt: new Date().toISOString(),
        reason: 'batch_failed',
        groupId,
        messages: messages.length,
        timestamp: sessionMeta?.timestamp || null
      };
      saveState(state);
    }

    if (stats.filesSeen % PROGRESS_EVERY_SEEN === 0) {
      const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
      const pct = ((stats.filesSeen / stats.filesTotal) * 100).toFixed(1);
      console.log(
        `--- Progress: ${stats.filesSeen}/${stats.filesTotal} files seen (${pct}%), ` +
          `processed ${stats.filesProcessed}, skipped ${stats.filesSkipped}, ` +
          `already ${stats.filesAlreadyProcessed + stats.filesAlreadySkipped}, failed ${stats.filesFailed}, ` +
          `${stats.messagesEmbedded} embedded, delay ${rateLimitMs}ms, ${elapsed}s ---`
      );
    }
  }

  // Final stats
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  console.log('\n=== Backfill Complete ===');
  console.log(`Files total: ${stats.filesTotal}`);
  console.log(`Files seen: ${stats.filesSeen}`);
  console.log(`Files processed (this run): ${stats.filesProcessed}`);
  console.log(`Files skipped (this run): ${stats.filesSkipped}`);
  console.log(`Files already processed (state): ${stats.filesAlreadyProcessed}`);
  console.log(`Files already skipped (state): ${stats.filesAlreadySkipped}`);
  console.log(`Files failed (this run): ${stats.filesFailed}`);
  console.log(`Messages extracted: ${stats.messagesExtracted}`);
  console.log(`Messages embedded: ${stats.messagesEmbedded}`);
  console.log(`Batches sent: ${stats.batchesSent}`);
  console.log(`Batches failed: ${stats.batchesFailed}`);
  console.log(`Retries: ${stats.retries}`);
  console.log(`Rate limit hits: ${stats.rateLimitHits}`);
  console.log(`Time: ${elapsed}s`);

  // Save stats
  const statsPath = '/home/tgree/clawd/notes/ops/graphiti-backfill-stats.json';
  fs.mkdirSync(path.dirname(statsPath), { recursive: true });
  fs.writeFileSync(
    statsPath,
    JSON.stringify(
      {
        ...stats,
        completedAt: new Date().toISOString(),
        elapsed: `${elapsed}s`,
        statePath: STATE_PATH,
        finalDelayMs: rateLimitMs,
        stateCounts: {
          processed: Object.keys(state.processed || {}).length,
          skipped: Object.keys(state.skipped || {}).length,
          failed: Object.keys(state.failed || {}).length
        }
      },
      null,
      2
    )
  );
  console.log(`\nStats saved to: ${statsPath}`);
}

backfill().catch(err => {
  console.error('FATAL:', err);
  process.exitCode = 1;
});
