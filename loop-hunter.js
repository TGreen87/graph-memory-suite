/**
 * Unfinished Loop Hunter
 * 
 * Finds and surfaces open loops that drain executive function
 * Helps close or consciously abandon incomplete threads
 */

const { search, add_memory } = require('./insights.js');
const { generateAlert } = require('./alert-generator.js');

const GROUP_ID = "tom-kit-loops";

/**
 * Detect new potential loop from conversation
 */
async function detectNewLoop(message, context) {
  const loopIndicators = [
    /I('ll| will| need to| should| have to) .+ (later|tomorrow|next week|soon|eventually)/i,
    /(need|should|got to) .+ (follow up|call|email|talk to|check in)/i,
    /(remind me|don't let me forget) .+/i,
    /(we|I) (discussed|talked about|agreed on|decided) .+ (but|and then|haven't)/i
  ];
  
  for (const pattern of loopIndicators) {
    const match = message.match(pattern);
    if (match) {
      // Extract the loop
      const loop = {
        topic: extractTopic(match[0]),
        original_message: message,
        created_at: new Date().toISOString(),
        source: context.person || "unknown",
        status: "open"
      };
      
      // Log to graph
      await add_memory({
        group_id: GROUP_ID,
        messages: [{
          role_type: "system",
          role: "LoopTracker",
          content: `[NEW_LOOP] ${loop.topic} | Source: ${loop.source} | Context: ${message.slice(0, 100)}`,
          timestamp: loop.created_at
        }]
      });
      
      return loop;
    }
  }
  
  return null;
}

/**
 * Find all stale loops (open for X days)
 */
async function findStaleLoops(daysThreshold = 7) {
  const openLoops = await search({
    query: "open loops unfinished tasks follow-up needed",
    group_ids: [GROUP_ID],
    max_facts: 20
  });
  
  const stale = [];
  const now = Date.now();
  
  for (const fact of openLoops.facts || []) {
    const age = (now - new Date(fact.created_at)) / (1000 * 60 * 60 * 24);
    
    if (age > daysThreshold) {
      stale.push({
        topic: fact.fact,
        age_days: Math.round(age),
        created_at: fact.created_at,
        uuid: fact.uuid
      });
    }
  }
  
  return stale.sort((a, b) => b.age_days - a.age_days);
}

/**
 * Check for loops related to current topic
 */
async function findRelatedLoops(currentTopic) {
  const related = await search({
    query: `${currentTopic} loop task follow-up unfinished`,
    group_ids: [GROUP_ID, "tom-kit-dm"],
    max_facts: 5
  });
  
  return related.facts?.filter(f => {
    // Check if still open (no close logged)
    return !f.fact.includes("CLOSED") && !f.fact.includes("ABANDONED");
  }) || [];
}

/**
 * Close a loop
 */
async function closeLoop(loopTopic, resolution) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "LoopTracker",
      content: `[CLOSED] ${loopTopic} | Resolution: ${resolution} | Closed: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Abandon a loop (consciously)
 */
async function abandonLoop(loopTopic, reason) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "LoopTracker",
      content: `[ABANDONED] ${loopTopic} | Reason: ${reason} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Generate loop hunter alert
 */
async function generateLoopAlert(staleLoops) {
  if (staleLoops.length === 0) return null;
  
  const count = staleLoops.length;
  const oldest = staleLoops[0];
  
  return generateAlert("loops", "stale", {
    count: count,
    topic: oldest.topic.slice(0, 50),
    days: oldest.age_days,
    timeframe: oldest.age_days > 14 ? "over 2 weeks" : 
               oldest.age_days > 7 ? "over a week" : "a few days"
  }, { tone: "gentle" });
}

/**
 * Daily loop digest
 */
async function generateLoopDigest() {
  const stale = await findStaleLoops(3); // 3+ days
  const veryStale = stale.filter(l => l.age_days > 14);
  
  if (stale.length === 0) return null;
  
  const topics = stale.slice(0, 5).map(l => 
    `- ${l.topic.slice(0, 60)}${l.topic.length > 60 ? '...' : ''} (${l.age_days} days)`
  ).join('\n');
  
  return {
    total_open: stale.length,
    very_stale: veryStale.length,
    summary: `${stale.length} open loops detected`,
    top_loops: topics,
    suggestion: veryStale.length > 0 
      ? `${veryStale.length} are over 2 weeks old - archive or schedule?`
      : `Quick review? Some have been open a while.`
  };
}

// Helpers
function extractTopic(message) {
  // Extract the actionable item from loop indicator
  const patterns = [
    /(?:I['ll]|will|need to|should|have to)\s+(.+?)(?:\s+(?:later|tomorrow|soon|eventually)|$)/i,
    /(?:need|should|got to)\s+(.+?)(?:\s+(?:follow up|call|email|check)|$)/i,
    /(?:discussed|talked about|agreed on)\s+(.+?)(?:\s+(?:but|and then|haven't)|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1].trim();
  }
  
  return message.slice(0, 50);
}

module.exports = {
  detectNewLoop,
  findStaleLoops,
  findRelatedLoops,
  closeLoop,
  abandonLoop,
  generateLoopAlert,
  generateLoopDigest,
  GROUP_ID
};
