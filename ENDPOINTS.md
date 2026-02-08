# Graphiti REST API Endpoints

Complete API reference for Graphiti Graph RAG service.

Base URL: `http://localhost:18000`

---

## Health

### GET /healthcheck
Check if the service is running.

**Response:**
```json
{
  "status": "healthy"
}
```

---

## Messages

### POST /messages
Add messages to the graph for processing.

**Request Body:**
```json
{
  "group_id": "tom-kit-conversations",
  "messages": [
    {
      "role_type": "user",
      "role": "Tom",
      "content": "We're building AI agents",
      "timestamp": "2026-02-08T12:00:00Z"
    },
    {
      "role_type": "assistant", 
      "role": "Kit",
      "content": "Yes, we're building automation systems together",
      "timestamp": "2026-02-08T12:00:30Z"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Messages added to processing queue",
  "success": true
}
```

**Note:** Messages are processed asynchronously. It takes a few seconds for entities and edges to be extracted.

---

## Search

### POST /search
Search for facts using natural language.

**Request Body:**
```json
{
  "query": "What are Kit and Tom building?",
  "group_ids": ["tom-kit-conversations"],
  "max_facts": 5
}
```

**Response:**
```json
{
  "facts": [
    {
      "uuid": "...",
      "name": "BUILDING_TOGETHER",
      "fact": "Tom and Kit are building AI agents together",
      "valid_at": "2026-02-08T12:00:00Z",
      "invalid_at": null,
      "created_at": "2026-02-08T12:00:00Z",
      "expired_at": null
    }
  ]
}
```

---

## Context Retrieval

### POST /get-memory
Get contextual memory based on conversation flow.

**Request Body:**
```json
{
  "group_id": "tom-kit-conversations",
  "messages": [
    {
      "role_type": "user",
      "role": "Tom",
      "content": "Tell me about our projects",
      "timestamp": "2026-02-08T12:30:00Z"
    }
  ],
  "max_facts": 10,
  "center_node_uuid": null
}
```

---

## Entity Management

### GET /entity-node/{uuid}
Get a specific entity node.

### POST /entity-node
Add a custom entity node.

**Request Body:**
```json
{
  "uuid": "custom-uuid",
  "group_id": "my-group",
  "name": "Project Alpha",
  "summary": "Our top secret AI project"
}
```

### GET /entity-edge/{uuid}
Get a specific relationship edge.

### DELETE /entity-edge/{uuid}
Delete a relationship.

---

## Episodes

### GET /episodes/{group_id}?last_n=10
Get recent conversation episodes.

**Query Parameters:**
- `last_n` (required): Number of recent episodes to return

---

## Episode Management

### GET /episode/{uuid}
Get a specific episode.

### DELETE /episode/{uuid}
Delete an episode.

---

## Group Management

### DELETE /group/{group_id}
**DANGEROUS**: Delete all memory for a group.

### POST /clear
**DANGEROUS**: Clear all data (requires confirmation).

---

## OpenAPI Spec

Full OpenAPI spec available at: `GET /openapi.json`

Interactive docs: `GET /docs` (Swagger UI)

---

## Error Responses

All errors follow this format:
```json
{
  "detail": "Error description"
}
```

Common status codes:
- `200` - Success
- `202` - Accepted (async processing)
- `400` - Bad request (invalid JSON)
- `401` - Unauthorized (invalid Discord signature)
- `404` - Not found
- `422` - Validation error
- `500` - Server error

---

## Neo4j Browser

Access the Neo4j web interface at: `http://localhost:17474`

**Login:**
- Connect URL: `bolt://localhost:17687`
- Username: `neo4j`
- Password: `clawdbot123`

Useful Cypher queries:

```cypher
// Show all nodes
MATCH (n) RETURN n LIMIT 25

// Show relationships
MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 25

// Find Tom entities
MATCH (n) WHERE n.name CONTAINS "Tom" RETURN n

// Recent facts
MATCH (f:Fact) RETURN f ORDER BY f.created_at DESC LIMIT 10
```
