/**
 * Auto-capture DM conversations to Graphiti
 * + Real-time insight surfacing
 */

const { add_memory } = require('./graphiti-memory.js');
const { checkForInsight } = require('./insights.js');

/**
 * Process a conversation turn and optionally surface insights
 */
async function processConversationTurn(turn) {
  const { role_type, role, content, timestamp, group_id = "tom-kit-dm" } = turn;
  
  // 1. Add to graph
  await add_memory({
    group_id,
    messages: [{
      role_type,
      role,
      content: content.slice(0, 2000), // Limit length
      timestamp: timestamp || new Date().toISOString()
    }]
  });
  
  // 2. Check for insight opportunity (every 5th message to avoid spam)
  if (Math.random() < 0.2) { // 20% chance
    const insight = await checkForInsight(content, []);
    if (insight.hasInsight) {
      return {
        captured: true,
        insight: insight.message,
        shouldSurface: insight.type === "connection" && insight.fullFact
      };
    }
  }
  
  return { captured: true, insight: null, shouldSurface: false };
}

/**
 * Batch process historical conversations
 */
async function backfillSession(sessionFilePath) {
  const fs = require('fs');
  const lines = fs.readFileSync(sessionFilePath, 'utf8').split('\n').filter(Boolean);
  
  const messages = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.role === 'user' || entry.role === 'assistant') {
        messages.push({
          role_type: entry.role === 'user' ? 'user' : 'assistant',
          role: entry.role === 'user' ? 'Tom' : 'Kit',
          content: entry.content,
          timestamp: entry.timestamp || new Date().toISOString()
        });
      }
    } catch (e) {
      // Skip malformed lines
    }
  }
  
  // Batch in groups of 10
  const batchSize = 10;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    await add_memory({
      group_id: "tom-kit-dm-backfill",
      messages: batch
    });
    console.log(`Processed ${i + batch.length}/${messages.length} messages`);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }
  
  return { total: messages.length };
}

module.exports = {
  processConversationTurn,
  backfillSession
};
