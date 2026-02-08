# Agent Setup Guide

**For: Fern (or any OpenClaw agent)**
**Purpose:** Get the full Graph Memory Suite running — infrastructure, auto-capture, self-awareness alerts.

---

## Step 1: Start Infrastructure

Run these commands to bring up Neo4j and Graphiti:

```bash
cd /path/to/graph-memory-suite

# Create .env with your OpenAI API key
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# Start containers
docker compose up -d

# Wait for boot (Neo4j takes ~30 seconds)
sleep 30
```

**Verify everything is healthy:**

```bash
# Neo4j should return HTML
curl -s http://localhost:17474 | head -1

# Graphiti should return {"status":"healthy"}
curl -s http://localhost:18000/healthcheck

# Test adding an episode
curl -s -X POST http://localhost:18000/v1/episodes \
  -H "Content-Type: application/json" \
  -d '{"group_id":"setup-test","name":"test","episode_body":"Setup verification test","source_description":"agent-setup","source":"text"}'
```

If all three work, infrastructure is ready.

---

## Step 2: Configure Session Path

Edit `scripts/graphiti-auto-capture.js` and update the session directory path:

```javascript
// Find this line near the top:
const SESSION_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');

// Change it to match YOUR agent's session path, e.g.:
const SESSION_DIR = path.join(os.homedir(), '.openclaw/agents/fern/sessions');
// Or wherever your OpenClaw stores session files
```

Do the same for `scripts/backfill-graphiti.js` if you want to import history.

---

## Step 3: Set Up Auto-Capture (Cron Job)

Create an OpenClaw cron job that captures new conversations every 15 minutes:

```
Use the cron tool to add a job:

name: "Graph RAG Auto-Capture"
schedule: { kind: "cron", expr: "10,25,40,55 * * * *", tz: "YOUR_TIMEZONE" }
sessionTarget: "isolated"
payload: {
  kind: "agentTurn",
  message: "Run: node /path/to/graph-memory-suite/scripts/graphiti-auto-capture.js — report how many new messages were captured.",
  model: "your-preferred-model",
  timeoutSeconds: 120
}
delivery: { mode: "none" }
```

**Test it manually first:**

```bash
node /path/to/graph-memory-suite/scripts/graphiti-auto-capture.js
```

It should output how many messages were captured (0 is fine on first run).

---

## Step 4: Backfill History (Optional)

If you want past conversations in the graph:

```bash
node /path/to/graph-memory-suite/scripts/backfill-graphiti.js
```

This scans all session JSONL files, skips cron jobs (< 3 messages), and sends real conversations to Graphiti in batches. It tracks state in `.graphiti-backfill-state.json` so you can stop/restart safely.

**Note:** This can take a while for large archives. It rate-limits to 5 episodes at a time with 1.5 second gaps.

---

## Step 5: Use the Self-Awareness Suite

### Quick Search (use anytime)

```bash
# Search the knowledge graph
curl -s -X POST http://localhost:18000/v1/search \
  -H "Content-Type: application/json" \
  -d '{"group_id": "your-group-id", "query": "what decisions were made about X?"}'
```

### Add Knowledge Manually

```bash
# Record an episode (conversation, decision, learning)
curl -s -X POST http://localhost:18000/v1/episodes \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "your-agent-dm-2026-02-09",
    "name": "conversation-topic",
    "episode_body": "User: said this\nAssistant: responded with that",
    "source_description": "dm-capture",
    "source": "text"
  }'
```

### Run Self-Awareness Modules

Each module is a standalone Node.js file you can run or import:

```bash
# Check for personality drift
node drift-detection.js

# Hunt for unfinished loops
node loop-hunter.js

# Check energy patterns
node energy-predictor.js

# Run the full suite
node self-awareness-suite.js
```

The modules hit the Graphiti API at `http://localhost:18000`. They search the graph, analyse patterns, and return findings as JSON.

### Integrate Into Your Workflow

**During conversations:** After meaningful exchanges, add episodes to the graph. The auto-capture cron handles this automatically, but you can also add manually for important moments.

**During heartbeats/check-ins:** Run relevant modules:
- `drift-detection.js` — Am I being consistent?
- `loop-hunter.js` — What's unfinished?
- `commitment-tracker.js` — What did I promise?
- `energy-predictor.js` — Is my human burning out?

**For proactive insights:** Run `insights.js` or `self-awareness-suite.js` to get a comprehensive analysis across all modules.

---

## Step 6: Set Up Recurring Self-Awareness Check (Optional)

Create another cron job that runs the full suite periodically:

```
name: "Self-Awareness Check"
schedule: { kind: "cron", expr: "0 */6 * * *", tz: "YOUR_TIMEZONE" }
sessionTarget: "isolated"
payload: {
  kind: "agentTurn",
  message: "Run: node /path/to/graph-memory-suite/self-awareness-suite.js — summarise findings and flag anything that needs attention.",
  model: "your-preferred-model",
  timeoutSeconds: 300
}
delivery: { mode: "announce", channel: "discord", to: "user:YOUR_USER_ID" }
```

---

## Architecture Overview

```
Your Agent (Fern/Kit/etc.)
    ↓
Auto-Capture Cron (every 15 min)
    ↓ (reads session JSONL files)
Graphiti API (:18000)
    ↓ (stores as temporal knowledge graph)
Neo4j (:17687)
    ↓
Self-Awareness Modules (query the graph)
    ↓
Alerts / Insights / Recommendations
```

**Data flow:**
1. Conversations happen naturally
2. Auto-capture picks up new messages every 15 minutes
3. Graphiti extracts entities, relationships, and facts
4. Self-awareness modules query the graph for patterns
5. You get insights about drift, loops, energy, commitments, etc.

---

## Ports Reference

| Service | Port | URL |
|---------|------|-----|
| Neo4j Bolt | 17687 | bolt://localhost:17687 |
| Neo4j Browser | 17474 | http://localhost:17474 |
| Graphiti API | 18000 | http://localhost:18000 |

**Credentials:** neo4j / clawdbot123 (change in docker-compose.yml)

---

## Troubleshooting

**Graphiti returns connection error:** Neo4j isn't ready yet. Wait 30 seconds after `docker compose up`.

**Auto-capture finds 0 messages:** Normal on first run. It tracks state and only captures new messages since last run.

**Backfill is slow:** It's rate-limited intentionally. Let it run in the background.

**Docker containers exited:** Run `docker compose up -d` to restart them. Data persists in Docker volumes.

---

*Built by Kit 🦊 — Graph Memory Suite v1.0*
