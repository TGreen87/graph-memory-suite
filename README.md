# Graph Memory Suite

A self-awareness and memory infrastructure for AI agents, powered by Neo4j + Graphiti temporal knowledge graphs.

Built by Kit 🦊 for the Kit & Fern ecosystem.

## What's In The Box

### Core Memory
- **graphiti-memory.js** — CRUD operations for the knowledge graph (add episodes, search, entity management)
- **auto-capture.js** — Real-time DM capture with automatic insight extraction
- **insights.js** — Proactive graph-powered insights (patterns, connections, predictions)

### Self-Awareness Suite (16 apps)
- **drift-detection.js** — Personality consistency monitoring across sessions/models
- **alert-generator.js** — Natural language alerts (3 tone modes: casual, direct, gentle)
- **semantic-triggers.js** — Beyond-keyword pattern detection
- **recommendation-engine.js** — Context-aware tool/action suggestions
- **energy-predictor.js** — Crash prediction + recovery window identification
- **loop-hunter.js** — Unfinished task/conversation loop detection
- **decision-fatigue.js** — Decision count threshold monitoring (ADHD-aware)
- **relationship-radar.js** — Contact drift alerts (who haven't you talked to?)
- **stress-precursor.js** — Pre-burnout pattern matching
- **time-calibration.js** — Estimate vs actual time tracking
- **commitment-tracker.js** — Promise and deadline monitoring
- **recovery-tracker.js** — Intervention effectiveness measurement
- **decision-tracker.js** — Decision follow-through chains
- **learning-tracker.js** — Learn → implement → results pipeline
- **value-alignment.js** — Time allocation vs stated priorities
- **partnership-health.js** — Human-agent collaboration scoring
- **cognitive-mode.js** — Creative/executive/analytical state detection
- **self-awareness-suite.js** — Master orchestrator for all modules

### Scripts
- **scripts/backfill-graphiti.js** — Bulk-import conversation history from OpenClaw session archives
- **scripts/graphiti-auto-capture.js** — Cron-friendly script to capture new conversations every 15 minutes

### Reference
- **ENDPOINTS.md** — Full Graphiti REST API reference
- **EXAMPLES.md** — Usage examples and patterns
- **skill.json** — OpenClaw skill manifest

### Ops Docs (OpenClaw + Discord)
- `docs/INDEX.md` — index of scheduling + Discord multi-agent + persona templates

## Quick Start

### 1. Start the infrastructure

```bash
# Set your OpenAI API key (used for embeddings only)
export OPENAI_API_KEY=sk-your-key-here

# Start Neo4j + Graphiti
docker compose up -d
```

Wait 30 seconds for Neo4j to boot, then verify:

```bash
# Neo4j Browser
curl http://localhost:17474    # Should return HTML

# Graphiti API
curl http://localhost:18000/healthcheck    # Should return {"status":"healthy"}
```

### 2. Test it works

```bash
# Add a test episode
curl -X POST http://localhost:18000/v1/episodes \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "test",
    "name": "test-episode",
    "episode_body": "Testing the graph memory suite. Kit built this for the venture.",
    "source_description": "test",
    "source": "text"
  }'

# Search for it
curl -X POST http://localhost:18000/v1/search \
  -H "Content-Type: application/json" \
  -d '{"group_id": "test", "query": "who built the graph memory suite?"}'
```

### 3. Wire up auto-capture (optional)

Set up a cron job to capture new conversations every 15 minutes:

```bash
# Edit the session path in scripts/graphiti-auto-capture.js
# Default: ~/.openclaw/agents/main/sessions/

# Run manually first to test
node scripts/graphiti-auto-capture.js

# Then add to cron (or OpenClaw cron)
*/15 * * * * node /path/to/scripts/graphiti-auto-capture.js
```

### 4. Backfill history (optional)

Import existing conversation history:

```bash
# Edit the session path in scripts/backfill-graphiti.js
# Then run (takes a while for large archives)
node scripts/backfill-graphiti.js
```

## For OpenClaw Agents

Drop this repo into your agent's skill directory or reference the modules directly. The `skill.json` manifest registers it as an OpenClaw skill.

Each module exports functions that hit the Graphiti REST API at `http://localhost:18000`. No SDK required — it's all HTTP.

## Architecture

```
Your Agent
    ↓ (HTTP)
Graphiti API (:18000)
    ↓ (Bolt)
Neo4j (:17687)
    ↓
Temporal Knowledge Graph
    (entities, relationships, episodes with timestamps)
```

**Why Graphiti + Neo4j?**
- Temporal: knows *when* things happened, not just *what*
- Relational: tracks connections between entities (people, projects, decisions)
- Searchable: semantic + keyword + graph traversal
- Local: your data stays on your machine

## Ports

| Service | Port | Protocol |
|---------|------|----------|
| Neo4j Bolt | 17687 | bolt:// |
| Neo4j Browser | 17474 | http:// |
| Graphiti API | 18000 | http:// |

## Credentials

Default Neo4j credentials: `neo4j` / `clawdbot123`

Change them in `docker-compose.yml` and update the Graphiti environment variables to match.

## Requirements

- Docker + Docker Compose
- Node.js 18+ (for scripts)
- OpenAI API key (for embeddings — only cost is embedding tokens, very cheap)

## License

MIT
