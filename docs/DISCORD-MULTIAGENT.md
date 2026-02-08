# Discord Multi-Agent Routing (OpenClaw) — Practical Architecture

This doc explains the **Discord architecture** Kit uses (and recommends) when you want:
- different “brains/personas” to handle different kinds of work
- clean context separation
- no manual `/spawn` friction for normal channel chat

## Two different concepts (don’t conflate them)

### A) Multi-agent (deterministic routing via `bindings`)
**Use when:** you want specific Discord channels to always talk to a specific persona.

- You define multiple `agentId`s in OpenClaw config.
- You route Discord channels to those agents with `bindings`.
- No sub-agent spawning required.

### B) Sub-agents (background delegation via `sessions_spawn`)
**Use when:** you want one-off, isolated work (research/writing/etc) without contaminating the main session context.

- Kit spawns a sub-agent for a task.
- Sub-agent returns results back to the main agent.
- Optionally: main agent reposts to a Discord channel.

**Rule of thumb:**
- If it’s a *place you chat* → use **bindings**.
- If it’s a *thing you delegate* → use **sub-agents**.

---

## Recommended Discord channel layout
Keep it simple. Minimum viable set:

**Category: Agents**
- `#kit` — default / general execution
- `#rook-security` — audits, risk, “should we do this?”
- `#cass-advisor` — hard conversations, comms drafts, human nuance
- `#sextans-research` — deep research, competitor scans, synthesis
- `#lumen-build` — coding/build tasks

Optional:
- `#agent-ops` — OpenClaw config + debugging
- `#heartbeat` — scheduled status posts

---

## OpenClaw config sketch
This is an **example**. Adjust models + workspaces for your machine.

### 1) Define multiple agents
```json5
{
  "agents": {
    "list": [
      {
        "id": "kit",
        "default": true,
        "name": "Kit",
        "workspace": "~/clawd",
        "model": "openai-codex/gpt-5.3-codex"
      },
      {
        "id": "rook",
        "name": "Rook",
        "workspace": "~/.openclaw/workspace-rook",
        "model": "openai-codex/gpt-5.2-codex"
      },
      {
        "id": "cass",
        "name": "Cass",
        "workspace": "~/.openclaw/workspace-cass",
        "model": "anthropic/claude-opus-4-6"
      },
      {
        "id": "sextans",
        "name": "Sextans",
        "workspace": "~/.openclaw/workspace-sextans",
        "model": "openrouter/kimi-k2.5"
      },
      {
        "id": "lumen",
        "name": "Lumen",
        "workspace": "~/.openclaw/workspace-lumen",
        "model": "openai-codex/gpt-5.3-codex"
      }
    ]
  }
}
```

### 2) Route Discord channels to agents with `bindings`
```json5
{
  "bindings": [
    { "agentId": "kit", "match": { "channel": "discord", "peer": { "kind": "channel", "id": "KIT_CHANNEL_ID" } } },
    { "agentId": "rook", "match": { "channel": "discord", "peer": { "kind": "channel", "id": "ROOK_SECURITY_CHANNEL_ID" } } },
    { "agentId": "cass", "match": { "channel": "discord", "peer": { "kind": "channel", "id": "CASS_ADVISOR_CHANNEL_ID" } } },
    { "agentId": "sextans", "match": { "channel": "discord", "peer": { "kind": "channel", "id": "SEXTANS_RESEARCH_CHANNEL_ID" } } },
    { "agentId": "lumen", "match": { "channel": "discord", "peer": { "kind": "channel", "id": "LUMEN_BUILD_CHANNEL_ID" } } }
  ]
}
```

### 3) Queue settings (prevents “message got ignored”)
```json5
{
  "messages": {
    "queue": {
      "mode": "collect",
      "debounceMs": 2000,
      "cap": 25,
      "drop": "summarize",
      "byChannel": { "discord": "collect" }
    }
  }
}
```

## Notes / gotchas
- **One Discord bot identity:** bindings route internally; messages still appear from the same bot account. If you need distinct “faces”, use:
  - separate Discord bot tokens per agent (multiple gateways), or
  - per-channel webhooks (different names/avatars), with the agent posting via webhook.
- Keep workspaces per persona. Put persona instructions in each workspace `SOUL.md`.

## Quick setup steps (human-run)
1. Create the Discord channels.
2. Copy channel IDs (Developer Mode → right click channel → Copy ID).
3. Add the `agents.list` entries and `bindings` entries.
4. Restart the gateway.

That’s it: channel choice becomes “which brain am I talking to?” without any extra commands.
