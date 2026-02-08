/**
 * Self-Awareness Recommendation Engine
 * 
 * Proactively suggests which monitoring tool to activate
 * based on conversation context and detected patterns
 */

const { analyzeSemanticTriggers } = require('./semantic-triggers.js');
const { search } = require('./graphiti-memory.js');

const TOOLS = {
  energy_predictor: {
    name: "Energy Predictor",
    triggers: ["exhaustion", "overwhelm", "post_meeting", "high_workload"],
    signals: ["I'm exhausted", "so tired", "drained", "wiped out"],
    value: "Prevents burnout by predicting crashes",
    when_to_use: "When tiredness mentioned or before/after intense work"
  },
  
  loop_hunter: {
    name: "Unfinished Loop Hunter",
    triggers: ["procrastination_signal", "topic_avoidance", "avoidance"],
    signals: ["I'll do it later", "next week", "haven't followed up", "still need to"],
    value: "Closes open loops that drain executive function",
    when_to_use: "When deferring tasks or avoiding topics"
  },
  
  decision_fatigue: {
    name: "Decision Fatigue Monitor",
    triggers: ["decision_paralysis", "overwhelm", "frustration"],
    signals: ["can't decide", "don't know what to do", "so many choices"],
    value: "Prevents bad decisions at low capacity",
    when_to_use: "When stuck on choices or after many decisions"
  },
  
  relationship_radar: {
    name: "Relationship Radar",
    triggers: ["social_withdrawal", "avoidance"],
    signals: ["haven't talked to", "should call", "drifting apart"],
    value: "Maintains important connections",
    when_to_use: "When mentioning people or social isolation"
  },
  
  stress_precursor: {
    name: "Stress Precursor Detection",
    triggers: ["exhaustion", "overwhelm", "frustration", "deflection"],
    signals: ["it's fine", "I'm fine", "just stressed", "too much"],
    value: "Early intervention before burnout",
    when_to_use: "When minimizing stress or showing warning signs"
  },
  
  personality_drift: {
    name: "Personality Drift Monitor",
    triggers: ["reflection_request"],
    signals: ["do I seem different", "have I changed", "what do you think of me"],
    value: "Maintains Kit consistency",
    when_to_use: "When questioning identity or noticing changes"
  }
};

/**
 * Analyze conversation and recommend relevant tools
 */
async function recommendTools(message, conversationHistory = []) {
  const recommendations = [];
  
  // 1. Analyze semantic triggers in current message
  const triggers = analyzeSemanticTriggers(message, conversationHistory);
  
  for (const trigger of triggers) {
    // Find tools that handle this trigger
    for (const [toolId, tool] of Object.entries(TOOLS)) {
      if (tool.triggers.includes(trigger.pattern)) {
        recommendations.push({
          tool: toolId,
          confidence: trigger.confidence,
          reason: `Detected: ${trigger.pattern}`,
          trigger_phrase: trigger.trigger_phrase,
          suggested_action: generateSuggestion(toolId, trigger)
        });
      }
    }
  }
  
  // 2. Check historical patterns
  const historicalInsights = await checkHistoricalPatterns(message);
  recommendations.push(...historicalInsights);
  
  // 3. Check conversation state
  const stateInsights = analyzeConversationState(message, conversationHistory);
  recommendations.push(...stateInsights);
  
  // Sort by confidence and deduplicate
  const unique = new Map();
  for (const rec of recommendations.sort((a, b) => b.confidence - a.confidence)) {
    if (!unique.has(rec.tool) || unique.get(rec.tool).confidence < rec.confidence) {
      unique.set(rec.tool, rec);
    }
  }
  
  return Array.from(unique.values()).slice(0, 3); // Top 3
}

/**
 * Check if this message relates to historical patterns
 */
async function checkHistoricalPatterns(message) {
  const insights = [];
  const groupId = "tom-kit-dm";
  
  // Search for similar past situations
  const similar = await search({
    query: message.slice(0, 100),
    group_ids: [groupId],
    max_facts: 5
  });
  
  if (similar.facts && similar.facts.length > 0) {
    // Check if previous similar situations led to specific outcomes
    const recentFact = similar.facts[0];
    const daysAgo = (Date.now() - new Date(recentFact.created_at)) / (1000 * 60 * 60 * 24);
    
    if (daysAgo < 30) {
      // Recent similar situation
      if (recentFact.fact.includes("burnout") || recentFact.fact.includes("crash")) {
        insights.push({
          tool: "energy_predictor",
          confidence: 0.7,
          reason: `Similar situation ${Math.round(daysAgo)} days ago preceded burnout`,
          suggested_action: "Check energy forecast before proceeding"
        });
      }
      
      if (recentFact.fact.includes("abandoned") || recentFact.fact.includes("didn't finish")) {
        insights.push({
          tool: "loop_hunter",
          confidence: 0.65,
          reason: `Similar task deferred ${Math.round(daysAgo)} days ago`,
          suggested_action: "Check for related open loops"
        });
      }
    }
  }
  
  return insights;
}

/**
 * Analyze overall conversation state for tool suggestions
 */
function analyzeConversationState(currentMessage, history) {
  const insights = [];
  
  // Decision load tracking
  const decisionCount = history.filter(m => 
    m.includes("?") || 
    m.includes("decide") || 
    m.includes("choose") ||
    m.includes("option")
  ).length;
  
  if (decisionCount > 5) {
    insights.push({
      tool: "decision_fatigue",
      confidence: 0.75,
      reason: `${decisionCount} decision-points in recent conversation`,
      suggested_action: "Consider deferring non-urgent choices"
    });
  }
  
  // Intensity tracking
  const intenseMessages = history.filter(m => {
    const caps = (m.match(/[A-Z]/g) || []).length;
    return caps > m.length * 0.3 || m.includes("!") || m.includes("fuck");
  }).length;
  
  if (intenseMessages > 3) {
    insights.push({
      tool: "stress_precursor",
      confidence: 0.7,
      reason: "High emotional intensity in recent messages",
      suggested_action: "Check stress indicators"
    });
  }
  
  return insights;
}

/**
 * Generate a natural suggestion for using a tool
 */
function generateSuggestion(toolId, trigger) {
  const suggestions = {
    energy_predictor: [
      `You mentioned ${trigger.trigger_phrase} - want me to check your energy forecast?`,
      `That sounds like the fatigue pattern I noticed. Quick energy check?`,
      `Heads up - that usually precedes a crash for you. Want the data?`
    ],
    loop_hunter: [
      `Sounds like something that might become an open loop. Scan for dangling threads?`,
      `"Later" has been a pattern. Want me to check what else is waiting?`,
      `Deferral detected - quick loop check?`
    ],
    decision_fatigue: [
      `That's decision-heavy territory. Want me to track your decision load?`,
      `Choice paralysis pattern? I can monitor decision fatigue.`,
      `Multiple decisions = fatigue risk. Track it?`
    ],
    relationship_radar: [
      `Social withdrawal signal - check relationship maintenance?`,
      `Connection gap forming? I can track it.`,
      `Isolation pattern? Want me to monitor?`
    ],
    stress_precursor: [
      `Stress signal detected. Early warning check?`,
      `That phrase usually precedes burnout for you. Monitor?`,
      `Suppression pattern? I can track stress indicators.`
    ]
  };
  
  const toolSuggestions = suggestions[toolId] || ["Want me to look into that?"];
  return toolSuggestions[Math.floor(Math.random() * toolSuggestions.length)];
}

/**
 * Format recommendations for conversation
 */
function formatRecommendations(recommendations) {
  if (recommendations.length === 0) return null;
  
  if (recommendations.length === 1) {
    return recommendations[0].suggested_action;
  }
  
  // Multiple recommendations - prioritize
  const topRec = recommendations[0];
  const tool = TOOLS[topRec.tool];
  
  return `Noticing ${topRec.reason.toLowerCase()}. ${topRec.suggested_action}`;
}

module.exports = {
  recommendTools,
  formatRecommendations,
  TOOLS
};
