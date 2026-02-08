/**
 * Graphiti Memory Skill
 * 
 * Graph RAG memory layer using Zep's Graphiti + Neo4j + OpenAI embeddings.
 * Stores conversations as a knowledge graph with semantic relationships.
 */

const SKILL = {
  name: "graphiti-memory",
  version: "1.0.0",
  description: "Graph RAG memory with semantic search and relationship queries",
  author: "Kit",
};

// Default configuration
const DEFAULT_URL = process.env.GRAPHITI_URL || "http://localhost:18000";
const DEFAULT_GROUP = process.env.GRAPHITI_DEFAULT_GROUP || "default";

/**
 * Add messages to the graph memory
 * 
 * @param {Object} params
 * @param {string} params.group_id - Group identifier for this memory cluster
 * @param {Array} params.messages - Array of messages to add
 * @param {string} params.messages[].role_type - "user", "assistant", or "system"
 * @param {string} params.messages[].role - Name (e.g., "Tom", "Kit")
 * @param {string} params.messages[].content - Message content
 * @param {string} params.messages[].timestamp - ISO 8601 timestamp
 * @param {string} [params.url] - Graphiti API URL (optional)
 * @returns {Promise<Object>} - {success: boolean, message: string}
 */
async function add_memory(params) {
  const url = params.url || DEFAULT_URL;
  const group_id = params.group_id || DEFAULT_GROUP;
  
  if (!params.messages || !Array.isArray(params.messages) || params.messages.length === 0) {
    throw new Error("messages array is required");
  }
  
  // Validate message format
  for (const msg of params.messages) {
    if (!msg.role_type || !msg.content) {
      throw new Error("Each message must have role_type and content");
    }
    if (!["user", "assistant", "system"].includes(msg.role_type)) {
      throw new Error("role_type must be 'user', 'assistant', or 'system'");
    }
  }
  
  // Add timestamps if missing
  const now = new Date().toISOString();
  const messages = params.messages.map(m => ({
    ...m,
    timestamp: m.timestamp || now,
    role: m.role || m.role_type,
  }));
  
  const response = await fetch(`${url}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_id, messages }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graphiti API error: ${response.status} - ${error}`);
  }
  
  return await response.json();
}

/**
 * Search the graph memory semantically
 * 
 * @param {Object} params
 * @param {string} params.query - Natural language query
 * @param {Array<string>} [params.group_ids] - Limit to specific groups (optional)
 * @param {number} [params.max_facts=10] - Maximum facts to return
 * @param {string} [params.url] - Graphiti API URL (optional)
 * @returns {Promise<Object>} - {facts: Array<{uuid, name, fact, created_at}>}
 */
async function search(params) {
  const url = params.url || DEFAULT_URL;
  
  if (!params.query) {
    throw new Error("query is required");
  }
  
  const response = await fetch(`${url}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: params.query,
      group_ids: params.group_ids || null,
      max_facts: params.max_facts || 10,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graphiti API error: ${response.status} - ${error}`);
  }
  
  return await response.json();
}

/**
 * Get context/memory based on current conversation
 * 
 * @param {Object} params
 * @param {string} params.group_id - Group to query
 * @param {Array<string>} params.messages - Current conversation messages
 * @param {number} [params.max_facts=10] - Maximum facts to return
 * @param {string} [params.center_node_uuid] - Focus on specific entity (optional)
 * @param {string} [params.url] - Graphiti API URL (optional)
 * @returns {Promise<Object>} - Contextual facts
 */
async function get_context(params) {
  const url = params.url || DEFAULT_URL;
  
  if (!params.group_id) {
    throw new Error("group_id is required");
  }
  
  if (!params.messages || !Array.isArray(params.messages) || params.messages.length === 0) {
    throw new Error("messages array is required");
  }
  
  // Convert string messages to proper format
  const messages = params.messages.map((m, i) => {
    if (typeof m === "string") {
      return {
        content: m,
        role_type: i % 2 === 0 ? "user" : "assistant",
        role: i % 2 === 0 ? "user" : "assistant",
        timestamp: new Date().toISOString(),
      };
    }
    return {
      ...m,
      timestamp: m.timestamp || new Date().toISOString(),
    };
  });
  
  const response = await fetch(`${url}/get-memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      group_id: params.group_id,
      center_node_uuid: params.center_node_uuid || null,
      messages,
      max_facts: params.max_facts || 10,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graphiti API error: ${response.status} - ${error}`);
  }
  
  return await response.json();
}

/**
 * Check if Graphiti API is healthy
 * 
 * @param {Object} params
 * @param {string} [params.url] - Graphiti API URL (optional)
 * @returns {Promise<Object>} - {status: "healthy" | "unhealthy"}
 */
async function health(params) {
  const url = params.url || DEFAULT_URL;
  
  try {
    const response = await fetch(`${url}/healthcheck`, {
      method: "GET",
    });
    
    if (!response.ok) {
      return { status: "unhealthy", error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    return { status: data.status || "healthy" };
  } catch (error) {
    return { status: "unhealthy", error: error.message };
  }
}

/**
 * Clear all memory for a group (DANGEROUS)
 * 
 * @param {Object} params
 * @param {string} params.group_id - Group to clear
 * @param {string} [params.url] - Graphiti API URL (optional)
 * @returns {Promise<Object>} - {success: boolean}
 */
async function clear_group(params) {
  const url = params.url || DEFAULT_URL;
  
  if (!params.group_id) {
    throw new Error("group_id is required");
  }
  
  const response = await fetch(`${url}/group/${params.group_id}`, {
    method: "DELETE",
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graphiti API error: ${response.status} - ${error}`);
  }
  
  return { success: true, group_id: params.group_id };
}

// Export functions for OpenClaw tool calling
module.exports = {
  SKILL,
  add_memory,
  search,
  get_context,
  health,
  clear_group,
};
