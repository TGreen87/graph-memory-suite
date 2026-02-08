/**
 * Stress Precursor Detection
 * 
 * Early warning system for burnout and overwhelm
 * Detects patterns that historically preceded stress events
 */

const { search, add_memory } = require('./graphiti-memory.js');
const { generateAlert } = require('./alert-generator.js');
const { analyzeSemanticTriggers } = require('./semantic-triggers.js');

const GROUP_ID = "tom-kit-stress";

// Historical stress signatures (would be learned from data)
const STRESS_SIGNATURES = {
  pre_burnout: {
    indicators: [
      "exhaustion mentions increasing",
      "social withdrawal",
      "decision paralysis",
      "task avoidance",
      "irritability"
    ],
    timeline_days: 14
  },
  pre_overwhelm: {
    indicators: [
      "everything piling up",
      "can't keep up",
      "too many demands",
      "no bandwidth"
    ],
    timeline_days: 7
  },
  pre_conflict: {
    indicators: [
      "frustration building",
      "communication strain",
      "resentment mentions",
      "boundary issues"
    ],
    timeline_days: 5
  }
};

/**
 * Analyze current state for stress indicators
 */
async function analyzeStressState(recentMessages = []) {
  const indicators = {
    exhaustion: 0,
    overwhelm: 0,
    withdrawal: 0,
    irritability: 0,
    avoidance: 0
  };
  
  // Analyze recent messages
  for (const msg of recentMessages) {
    const triggers = analyzeSemanticTriggers(msg, []);
    
    for (const trigger of triggers) {
      if (trigger.pattern === "exhaustion") indicators.exhaustion += trigger.confidence;
      if (trigger.pattern === "overwhelm") indicators.overwhelm += trigger.confidence;
      if (trigger.pattern === "social_withdrawal") indicators.withdrawal += trigger.confidence;
      if (trigger.pattern === "frustration") indicators.irritability += trigger.confidence;
      if (trigger.pattern === "avoidance") indicators.avoidance += trigger.confidence;
    }
  }
  
  // Search graph for historical patterns
  const stressHistory = await search({
    query: "stress burnout overwhelmed exhausted couldn't cope",
    group_ids: [GROUP_ID, "tom-kit-dm"],
    max_facts: 10
  });
  
  // Check if current pattern matches historical stress precursors
  const matchScore = calculatePatternMatch(indicators, stressHistory.facts);
  
  return {
    indicators,
    match_score: matchScore,
    risk_level: matchScore > 0.7 ? "high" : matchScore > 0.4 ? "medium" : "low",
    matched_signatures: identifyMatchedSignatures(indicators)
  };
}

/**
 * Calculate how current indicators match historical stress patterns
 */
function calculatePatternMatch(currentIndicators, historicalFacts) {
  if (!historicalFacts || historicalFacts.length === 0) return 0;
  
  // Count how many current indicators appeared before past stress events
  let matchCount = 0;
  const indicatorKeys = Object.keys(currentIndicators).filter(k => currentIndicators[k] > 0);
  
  for (const fact of historicalFacts) {
    const factText = fact.fact.toLowerCase();
    for (const indicator of indicatorKeys) {
      if (factText.includes(indicator)) {
        matchCount++;
      }
    }
  }
  
  // Normalize score
  const maxPossible = indicatorKeys.length * historicalFacts.length;
  return maxPossible > 0 ? matchCount / maxPossible : 0;
}

/**
 * Identify which stress signatures are matching
 */
function identifyMatchedSignatures(indicators) {
  const matched = [];
  
  for (const [signatureName, signature] of Object.entries(STRESS_SIGNATURES)) {
    const matchCount = signature.indicators.filter(ind => {
      const indKey = ind.split(' ')[0]; // crude matching
      return indicators[indKey] > 0;
    }).length;
    
    if (matchCount >= 2) {
      matched.push({
        signature: signatureName,
        matches: matchCount,
        timeline: signature.timeline_days
      });
    }
  }
  
  return matched.sort((a, b) => b.matches - a.matches);
}

/**
 * Log a stress event or precursor
 */
async function logStressEvent(event) {
  const { type, intensity, context, timestamp = new Date().toISOString() } = event;
  
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "StressTracker",
      content: `[${type.toUpperCase()}] Intensity: ${intensity}/10 | ${context.slice(0, 100)}`,
      timestamp
    }]
  });
}

/**
 * Generate early warning alert
 */
async function generateEarlyWarning(analysis) {
  if (analysis.risk_level === "low") return null;
  
  const topSignature = analysis.matched_signatures[0];
  
  if (analysis.risk_level === "high") {
    return generateAlert("stress", "precursor", {
      indicators: Object.entries(analysis.indicators)
        .filter(([k, v]) => v > 0)
        .map(([k, v]) => k)
        .join(", "),
      signature: topSignature?.signature || "general stress pattern",
      timeline: topSignature?.timeline || "days",
      previous_outcome: "burnout/overwhelm"
    }, { tone: "direct" });
  }
  
  // Medium risk - gentler
  return generateAlert("stress", "precursor", {
    indicators: "Several stress signals",
    pattern: "matching historical precursors",
    severity: "moderate"
  }, { tone: "gentle" });
}

/**
 * Suggest interventions based on stress type
 */
function suggestInterventions(analysis) {
  const interventions = {
    pre_burnout: [
      "Immediate: Cancel or defer 50% of non-essential commitments",
      "Today: Schedule 30-min nature walk",
      "This week: Sleep prioritization - no exceptions",
      "Communication: Tell key people you're at capacity"
    ],
    pre_overwhelm: [
      "Immediate: List everything, then circle top 3 only",
      "Today: 2-hour focused work block, then enforced break",
      "Delegate: What can Elliott/Kit/someone else take?",
      "Tonight: Zero work after 7pm"
    ],
    general: [
      "5-minute breathing exercise",
      "Change of scenery - go outside",
      "Quick journaling: what's actually urgent vs perceived",
      "Talk it through with someone"
    ]
  };
  
  const sig = analysis.matched_signatures[0]?.signature;
  return interventions[sig] || interventions.general;
}

/**
 * Daily stress check
 */
async function dailyStressCheck() {
  // Get last 3 days of messages
  const recent = await search({
    query: "recent conversation messages",
    group_ids: ["tom-kit-dm"],
    max_facts: 20
  });
  
  const analysis = await analyzeStressState(recent.facts?.map(f => f.fact) || []);
  
  return {
    ...analysis,
    alert: await generateEarlyWarning(analysis),
    interventions: analysis.risk_level !== "low" ? suggestInterventions(analysis) : null
  };
}

module.exports = {
  analyzeStressState,
  logStressEvent,
  generateEarlyWarning,
  suggestInterventions,
  dailyStressCheck,
  STRESS_SIGNATURES,
  GROUP_ID
};
