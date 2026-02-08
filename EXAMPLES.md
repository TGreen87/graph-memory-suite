# Graphiti Memory Usage Examples

## Basic Usage

### 1. Store a Conversation

```javascript
// After a meaningful conversation
add_graphiti_memory({
  group_id: "tom-kit-daily",
  messages: [
    {
      role_type: "user",
      role: "Tom",
      content: "We decided to use Codex 5.3 for all cron jobs to save Anthropic budget",
      timestamp: "2026-02-08T12:00:00Z"
    },
    {
      role_type: "assistant",
      role: "Kit", 
      content: "Great idea! Codex 5.3 has 0.70 quality at $0.70 vs Opus 4.6 at 0.62 quality for $4.50",
      timestamp: "2026-02-08T12:00:15Z"
    }
  ]
})
```

### 2. Search for Related Information

```javascript
// Later, when Tom asks about budget
search_graphiti_memory({
  query: "How are we saving on AI costs?",
  group_ids: ["tom-kit-daily"],
  max_facts: 5
})

// Returns:
// {
//   "facts": [
//     { "fact": "We decided to use Codex 5.3 for all cron jobs" },
//     { "fact": "Codex 5.3 is cheaper than Opus 4.6" },
//     { "fact": "Tom wants to save Anthropic budget" }
//   ]
// }
```

### 3. Get Context for Current Conversation

```javascript
// When conversation drifts, get related context
get_graphiti_context({
  group_id: "tom-kit-daily",
  messages: [
    { role_type: "user", role: "Tom", content: "What about those cron jobs?" }
  ],
  max_facts: 3
})
```

---

## Advanced Patterns

### Auto-Capture Important Decisions

```javascript
// In your agent logic
if (message.includes("decided") || message.includes("agreed")) {
  add_graphiti_memory({
    group_id: "decisions",
    messages: [{
      role_type: "user",
      role: "Tom",
      content: message,
      timestamp: new Date().toISOString()
    }]
  });
}
```

### Project-Specific Memory

```javascript
// Separate groups for different contexts
const GROUPS = {
  daily: "tom-kit-daily",
  secondBrain: "second-brain-dev",
  gaia: "gaia-business",
  personal: "tom-profile"
};

// Store with appropriate group
add_graphiti_memory({
  group_id: GROUPS.secondBrain,
  messages: [{
    role_type: "assistant",
    role: "Kit",
    content: "Fixed the duplicate Project type error in Second Brain"
  }]
});

// Search within specific project context
search_graphiti_memory({
  query: "What Second Brain bugs did we fix?",
  group_ids: [GROUPS.secondBrain]
});
```

### Cross-Group Search

```javascript
// Search across multiple contexts
search_graphiti_memory({
  query: "What AI projects are we working on?",
  group_ids: ["tom-kit-daily", "gaia-business", "second-brain-dev"],
  max_facts: 15
});
```

---

## Integration with OpenClaw

### Check Health Before Using

```javascript
const health = await health_graphiti_memory({});
if (health.status !== "healthy") {
  // Fall back to file-based memory
  return read("memory/2026-02-08.md");
}
```

### Hybrid Memory Pattern

```javascript
// 1. Try graph memory first
const graphResults = await search_graphiti_memory({
  query: "What are our current priorities?",
  group_ids: ["tom-kit-daily"],
  max_facts: 5
});

// 2. Supplement with SESSION-STATE.md
const sessionState = await read("SESSION-STATE.md");

// 3. Combine for response
return {
  graph_facts: graphResults.facts,
  session_priorities: sessionState.priorities
};
```

---

## Best Practices

### 1. Group Naming
- Use consistent, descriptive group IDs
- Pattern: `{context}-{subcontext}` (e.g., `tom-kit-daily`, `second-brain-dev`)
- Don't use spaces or special characters

### 2. Message Content
- Store the *meaning*, not just the words
- Include context: "We decided X because Y"
- Store both sides of conversations

### 3. Timestamps
- Always include timestamps (auto-generated if omitted)
- Use ISO 8601 format: `2026-02-08T12:00:00Z`

### 4. Async Awareness
- Messages are processed asynchronously
- Wait 2-3 seconds before searching newly added content
- Facts won't appear immediately

### 5. Query Quality
- Use natural language, not keywords
- "What projects are we building?" > "projects"
- Include subject + verb for best results

---

## Common Queries

```javascript
// What have we discussed about X?
search_graphiti_memory({ query: "What have we discussed about Graph RAG?" });

// What did Tom decide?
search_graphiti_memory({ query: "What decisions has Tom made?" });

// What are our active projects?
search_graphiti_memory({ query: "What projects are currently active?" });

// What was the reason for X?
search_graphiti_memory({ query: "Why did we choose Neo4j over alternatives?" });

// What happened on a specific topic?
search_graphiti_memory({ 
  query: "What happened with the Second Brain deployment?",
  max_facts: 10 
});
```

---

## Debugging

### Check if service is up
```javascript
health_graphiti_memory({});
// Returns: { status: "healthy" } or { status: "unhealthy", error: "..." }
```

### Explore raw data in Neo4j
1. Open http://localhost:17474
2. Login with neo4j/clawdbot123
3. Run: `MATCH (n) RETURN n LIMIT 25`

### Check specific facts
```javascript
search_graphiti_memory({
  query: "*",  // Wildcard to get recent facts
  max_facts: 20
});
```
