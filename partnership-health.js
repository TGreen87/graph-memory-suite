/**
 * Thought Partnership Health Score
 * 
 * Monitors Kit-Tom collaboration effectiveness
 */

const { add_memory, search } = require('./insights.js');

const GROUP_ID = "tom-kit-partnership";

/**
 * Log suggestion made by Kit
 */
async function logSuggestion(suggestion, context) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "assistant",
      role: "Kit",
      content: `[SUGGESTION] "${suggestion.slice(0, 100)}" | Context: ${context}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Log Tom's response to suggestion
 */
async function logResponse(suggestionId, responseType, details) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "PartnershipTracker",
      content: `[RESPONSE] To: ${suggestionId} | Type: ${responseType} | Details: ${details} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Log clarification event (talking past each other)
 */
async function logClarification(topic, turnsToAlign) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "PartnershipTracker",
      content: `[CLARIFICATION] Topic: ${topic} | Turns to align: ${turnsToAlign} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Calculate suggestion effectiveness
 */
async function calculateSuggestionEffectiveness(daysBack = 30) {
  const suggestions = await search({
    query: "suggestion",
    group_ids: [GROUP_ID],
    max_facts: 50
  });
  
  let accepted = 0;
  let ignored = 0;
  let rejected = 0;
  let unclear = 0;
  
  for (const fact of suggestions.facts || []) {
    const suggestionText = extractSuggestionText(fact.fact);
    
    // Look for response
    const responses = await search({
      query: `response to "${suggestionText.slice(0, 30)}"`,
      group_ids: [GROUP_ID],
      max_facts: 1
    });
    
    if (responses.facts && responses.facts.length > 0) {
      const responseType = extractResponseType(responses.facts[0].fact);
      
      switch (responseType) {
        case "accepted": accepted++; break;
        case "rejected": rejected++; break;
        case "ignored": ignored++; break;
        default: unclear++;
      }
    } else {
      unclear++;
    }
  }
  
  const total = accepted + ignored + rejected + unclear;
  
  return {
    total_suggestions: total,
    accepted,
    ignored,
    rejected,
    unclear,
    acceptance_rate: total > 0 ? ((accepted / total) * 100).toFixed(1) + "%" : "N/A",
    insight: generateInsight(accepted, ignored, rejected)
  };
}

/**
 * Calculate clarification rate (misalignment indicator)
 */
async function calculateClarificationRate(daysBack = 30) {
  const clarifications = await search({
    query: "clarification turns to align",
    group_ids: [GROUP_ID],
    max_facts: 30
  });
  
  const totalConversations = await search({
    query: "conversation session",
    group_ids: [GROUP_ID],
    max_facts: 50
  });
  
  const clarificationCount = clarifications.facts?.length || 0;
  const conversationCount = totalConversations.facts?.length || 20; // Estimate
  
  const rate = (clarificationCount / conversationCount);
  
  return {
    clarification_events: clarificationCount,
    conversations_analyzed: conversationCount,
    clarification_rate: (rate * 100).toFixed(1) + "%",
    status: rate > 0.3 ? "high" : rate > 0.15 ? "moderate" : "low",
    insight: rate > 0.3 ? 
      "High clarification rate - may be talking past each other frequently" :
      rate > 0.15 ?
      "Moderate alignment - occasional miscommunication" :
      "Strong alignment - usually in sync"
  };
}

/**
 * Generate partnership health score
 */
async function generateHealthScore() {
  const [suggestionStats, clarificationStats] = await Promise.all([
    calculateSuggestionEffectiveness(30),
    calculateClarificationRate(30)
  ]);
  
  // Calculate composite score
  let score = 100;
  
  // Deduct for low acceptance
  const acceptance = parseFloat(suggestionStats.acceptance_rate) || 50;
  if (acceptance < 30) score -= 20;
  else if (acceptance < 50) score -= 10;
  
  // Deduct for high clarification rate
  const clarification = parseFloat(clarificationStats.clarification_rate) || 0;
  if (clarification > 30) score -= 20;
  else if (clarification > 15) score -= 10;
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    overall_score: score,
    acceptance_rate: suggestionStats.acceptance_rate,
    clarification_rate: clarificationStats.clarification_rate,
    status: score > 80 ? "strong" : score > 60 ? "good" : "needs attention",
    top_improvement: score < 80 ? identifyTopIssue(suggestionStats, clarificationStats) : null
  };
}

/**
 * Detect in conversation if suggestion was made
 */
function detectSuggestionIntent(message) {
  const patterns = [
    /(?:you could|what if|have you considered|maybe try)/i,
    /(?:I suggest|recommend|would be)/i,
    /(?:consider|think about|look into)/i
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(message)) {
      return { detected: true, confidence: "medium" };
    }
  }
  
  return { detected: false };
}

/**
 * Detect if response indicates acceptance/rejection
 */
function detectResponseType(message) {
  const acceptance = ["good idea", "yeah", "let's do", "great", "perfect", "thanks"];
  const rejection = ["no", "don't think so", "not really", "pass", "skip"];
  
  const lower = message.toLowerCase();
  
  if (acceptance.some(a => lower.includes(a))) return "accepted";
  if (rejection.some(r => lower.includes(r))) return "rejected";
  if (lower.length < 20) return "ignored";
  
  return "unclear";
}

// Helpers
function extractSuggestionText(factText) {
  const match = factText.match(/"(.+?)"/);
  return match ? match[1] : factText.slice(0, 50);
}

function extractResponseType(factText) {
  const match = factText.match(/Type:\s*(\w+)/);
  return match ? match[1].toLowerCase() : "unclear";
}

function generateInsight(accepted, ignored, rejected) {
  const total = accepted + ignored + rejected;
  if (total === 0) return "No data yet";
  
  if (ignored > accepted + rejected) {
    return "Suggestions frequently ignored - may be mistimed or irrelevant";
  }
  if (rejected > accepted) {
    return "High rejection rate - may be pushing wrong directions";
  }
  if (accepted > total * 0.6) {
    return "Strong acceptance rate - suggestions are landing well";
  }
  return "Mixed reception - varying suggestion quality";
}

function identifyTopIssue(suggestionStats, clarificationStats) {
  const acceptance = parseFloat(suggestionStats.acceptance_rate) || 0;
  const clarification = parseFloat(clarificationStats.clarification_rate) || 0;
  
  if (acceptance < 30) {
    return "Suggestions not landing - need to calibrate to actual needs";
  }
  if (clarification > 25) {
    return "Frequent miscommunication - improve precision/clarity";
  }
  return "General calibration needed";
}

module.exports = {
  logSuggestion,
  logResponse,
  logClarification,
  calculateSuggestionEffectiveness,
  calculateClarificationRate,
  generateHealthScore,
  detectSuggestionIntent,
  detectResponseType,
  GROUP_ID
};
