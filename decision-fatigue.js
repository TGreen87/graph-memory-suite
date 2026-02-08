/**
 * Decision Fatigue Monitor
 * 
 * Tracks decision load and prevents poor choices at low capacity
 */

const { add_memory } = require('./insights.js');
const { generateAlert } = require('./alert-generator.js');

const GROUP_ID = "tom-kit-decisions";

// Daily counter (would be persisted in production)
let dailyDecisionCount = 0;
let significantDecisions = [];

/**
 * Log a decision
 */
async function logDecision(decision) {
  const { description, importance, context, timestamp = new Date().toISOString() } = decision;
  
  dailyDecisionCount++;
  
  if (importance > 5) {
    significantDecisions.push({
      description,
      importance,
      timestamp,
      context
    });
  }
  
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "DecisionTracker",
      content: `[DECISION] ${description} | Importance: ${importance}/10 | Daily count: ${dailyDecisionCount}`,
      timestamp
    }]
  });
  
  return checkFatigueRisk();
}

/**
 * Check if approaching decision fatigue
 */
function checkFatigueRisk() {
  const riskThreshold = 8;
  const warningThreshold = 6;
  
  if (dailyDecisionCount >= riskThreshold) {
    return {
      alert: true,
      level: "high",
      count: dailyDecisionCount,
      message: `Decision #${dailyDecisionCount} today. Pattern shows quality cliff after #8.`,
      recommendation: "Defer non-urgent choices until tomorrow"
    };
  }
  
  if (dailyDecisionCount >= warningThreshold) {
    return {
      alert: true,
      level: "medium",
      count: dailyDecisionCount,
      message: `${dailyDecisionCount} decisions logged. Approaching fatigue zone.`,
      recommendation: "Consider batching remaining choices or taking a break"
    };
  }
  
  return { alert: false, count: dailyDecisionCount };
}

/**
 * Analyze a decision for complexity
 */
function analyzeDecisionComplexity(description) {
  const complexityIndicators = {
    high: ['buy', 'purchase', 'hire', 'fire', 'invest', 'commit', 'contract', 'legal'],
    medium: ['choose', 'select', 'schedule', 'plan', 'allocate', 'assign'],
    low: ['what to eat', 'which shirt', 'coffee or tea', 'now or later']
  };
  
  const lower = description.toLowerCase();
  
  if (complexityIndicators.high.some(w => lower.includes(w))) return 8;
  if (complexityIndicators.medium.some(w => lower.includes(w))) return 5;
  if (complexityIndicators.low.some(w => lower.includes(w))) return 2;
  
  return 5; // default
}

/**
 * Suggest optimal decision timing
 */
async function suggestDecisionTiming(decisionDescription) {
  const complexity = analyzeDecisionComplexity(decisionDescription);
  const currentLoad = dailyDecisionCount;
  const timeOfDay = new Date().getHours();
  
  // Simple heuristics - would use historical data in production
  const issues = [];
  
  if (complexity > 7 && currentLoad > 5) {
    issues.push("High complexity + high decision load = risk");
  }
  
  if (timeOfDay > 20 && complexity > 5) {
    issues.push("Evening decisions on complex topics = lower quality");
  }
  
  if (currentLoad > 10) {
    issues.push("Already at decision capacity for today");
  }
  
  if (issues.length > 0) {
    return {
      should_delay: true,
      reasons: issues,
      suggestion: complexity > 7 
        ? "Consider sleeping on this one"
        : "Defer to tomorrow morning if possible",
      alternative: "Or make it a 2-minute decision and move on"
    };
  }
  
  return { should_delay: false };
}

/**
 * Reset daily counter (call at midnight)
 */
function resetDailyCounter() {
  dailyDecisionCount = 0;
  significantDecisions = [];
}

/**
 * Get decision stats
 */
function getDecisionStats() {
  return {
    today_count: dailyDecisionCount,
    significant_today: significantDecisions.length,
    risk_level: dailyDecisionCount > 8 ? "high" : dailyDecisionCount > 5 ? "medium" : "low",
    next_threshold: dailyDecisionCount < 6 ? 6 : dailyDecisionCount < 8 ? 8 : null
  };
}

/**
 * Detect decision paralysis in message
 */
function detectDecisionParalysis(message) {
  const paralysisPatterns = [
    /can't decide/i,
    /don't know what to (do|choose|pick)/i,
    /stuck on/i,
    /paralyzed by/i,
    /going back and forth/i,
    /pros and cons/i,
    /overthinking/i
  ];
  
  for (const pattern of paralysisPatterns) {
    if (pattern.test(message)) {
      return {
        detected: true,
        pattern: pattern.toString(),
        suggestion: "Decision paralysis detected. Set a 5-minute timer, decide, move on."
      };
    }
  }
  
  return { detected: false };
}

module.exports = {
  logDecision,
  checkFatigueRisk,
  analyzeDecisionComplexity,
  suggestDecisionTiming,
  resetDailyCounter,
  getDecisionStats,
  detectDecisionParalysis,
  GROUP_ID
};
