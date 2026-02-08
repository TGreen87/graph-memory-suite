# Sub-Agents (sessions_spawn) — Orchestration Pattern

Sub-agents are for **isolated, one-off work** that you don’t want polluting the main session context.

## When to spawn
Spawn when the task is:
- long-form writing (policy drafts, comms, docs)
- deep research (multi-source, synthesis)
- multi-step planning
- repetitive processing (summarisation/backfill)

Don’t spawn when:
- you just need deterministic channel separation → use `bindings`
- the task is tiny and you’re already “in flow”

## A clean delegation template
When you spawn, give:
- objective (1 line)
- context (only what matters)
- constraints (tone/format/path)
- success criteria

Example prompt (conceptual):
```text
Task: Draft a 250-word announcement post.
Context: [paste]
Constraints: no hype, short paras, practical.
Deliverable: a single final draft.
Success: can paste directly into Discord.
```

## Output handling (Discord)
If you want the result to land in a specific Discord channel:
- easiest: have the main agent repost it after reviewing
- advanced: run the work as a scheduled job with an explicit `delivery` target

## Guardrail
Sub-agent output is raw material.
Main agent should:
1) sanity check
2) remove fluff
3) confirm any risky external action before sending
