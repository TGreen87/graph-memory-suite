/**
 * Personality Drift Detection
 * 
 * Monitors Kit's consistency over time using Graph RAG
 * Implements the "every X minutes self-reflection" pattern
 */

const { search } = require('./insights.js');

const BASELINE = {
  warmth: 8.5,           // 1-10, conversational warmth
  proseRatio: 0.8,       // % of responses that are prose-first
  proactiveRate: 0.3,    // % of turns with proactive suggestions
  avgSentenceLength: 28, // words per sentence
  humorFrequency: 0.15,  // % of responses with dry humor
  questionRatio: 0.2,    // % of responses ending with questions
};

/**
 * Analyze recent responses for drift indicators
 */
async function analyzeRecentStyle(groupId = "tom-kit-dm", messageCount = 20) {
  // Get my recent responses from graph
  const myResponses = await search({
    query: "Kit's recent assistant responses",
    group_ids: [groupId],
    max_facts: messageCount
  });
  
  if (!myResponses.facts || myResponses.facts.length === 0) {
    return null;
  }
  
  const texts = myResponses.facts.map(f => f.fact);
  
  return {
    // Structural metrics
    proseRatio: calculateProseRatio(texts),
    avgSentenceLength: calculateAvgSentenceLength(texts),
    bulletRatio: calculateBulletRatio(texts),
    
    // Behavioral metrics  
    proactiveRate: calculateProactiveRate(texts),
    questionRatio: calculateQuestionRatio(texts),
    
    // Qualitative (would need sentiment analysis)
    warmthEstimate: estimateWarmth(texts),
    
    sampleSize: texts.length
  };
}

/**
 * Compare current style against baseline
 */
function detectDrift(current, baseline = BASELINE) {
  const drift = {};
  let totalDrift = 0;
  
  // Prose ratio drift (lower = more bullets = bad)
  if (current.proseRatio < baseline.proseRatio * 0.8) {
    drift.prose = {
      type: "structure",
      severity: "medium",
      message: "Bullet-heavy pattern detected (vs prose-first baseline)",
      current: current.proseRatio,
      baseline: baseline.proseRatio
    };
    totalDrift += 1;
  }
  
  // Proactive rate drift
  if (current.proactiveRate < baseline.proactiveRate * 0.5) {
    drift.initiative = {
      type: "behavior",
      severity: "high", 
      message: "Reactive pattern - not proactively suggesting improvements",
      current: current.proactiveRate,
      baseline: baseline.proactiveRate
    };
    totalDrift += 2;
  }
  
  // Sentence length drift (longer = more formal = possible drift)
  if (current.avgSentenceLength > baseline.avgSentenceLength * 1.5) {
    drift.verbosity = {
      type: "tone",
      severity: "low",
      message: "Response style more verbose than baseline",
      current: current.avgSentenceLength,
      baseline: baseline.avgSentenceLength
    };
    totalDrift += 0.5;
  }
  
  return {
    hasDrift: totalDrift > 1.5,
    driftScore: totalDrift,
    indicators: Object.values(drift),
    recommendation: totalDrift > 2 ? "REFRESH_IDENTITY" : 
                   totalDrift > 1 ? "MONITOR_CLOSELY" : "NOMINAL"
  };
}

/**
 * Every X minutes reflection (your idea!)
 * Extract topics from recent conversation and check consistency
 */
async function periodicTopicReflection(recentMessages, groupId = "tom-kit-dm") {
  // Extract key topics from conversation
  const topics = extractTopics(recentMessages);
  const inconsistencies = [];
  
  for (const topic of topics) {
    // Search for my historical views on this topic
    const historical = await search({
      query: `Kit's opinion or stance on ${topic}`,
      group_ids: [groupId],
      max_facts: 3
    });
    
    if (historical.facts && historical.facts.length > 0) {
      // Check if current conversation aligns with past views
      const alignment = checkAlignment(
        recentMessages.join(" "),
        historical.facts.map(f => f.fact)
      );
      
      if (alignment < 0.6) {
        inconsistencies.push({
          topic,
          alignment,
          pastViews: historical.facts.slice(0, 2),
          risk: "POSITION_DRIFT"
        });
      }
    }
  }
  
  return {
    topicsAnalyzed: topics.length,
    inconsistencies: inconsistencies.slice(0, 3), // Top 3 concerns
    shouldAlert: inconsistencies.length > 0
  };
}

/**
 * Self-correction protocol
 */
async function executeCorrection(recommendation) {
  switch (recommendation) {
    case "REFRESH_IDENTITY":
      return {
        action: "RELOAD_CORE_FILES",
        files: ["SOUL.md", "AGENTS.md", "MEMORY.md", "USER.md"],
        reason: "Significant drift detected - hard reload of identity"
      };
      
    case "MONITOR_CLOSELY":
      return {
        action: "INCREASE_SAMPLING",
        frequency: "every 5 minutes",
        reason: "Moderate drift - watching closely"
      };
      
    case "NOMINAL":
      return {
        action: "CONTINUE",
        reason: "Within acceptable variance"
      };
  }
}

// Helper functions
function calculateProseRatio(texts) {
  const proseCount = texts.filter(t => 
    !t.includes("•") && !t.includes("-") && !t.includes("|")
  ).length;
  return proseCount / texts.length;
}

function calculateBulletRatio(texts) {
  const bulletCount = texts.filter(t => 
    (t.match(/[•\-]/g) || []).length > 3
  ).length;
  return bulletCount / texts.length;
}

function calculateAvgSentenceLength(texts) {
  const allSentences = texts.flatMap(t => t.split(/[.!?]+/).filter(s => s.trim()));
  const totalWords = allSentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  return allSentences.length > 0 ? totalWords / allSentences.length : 0;
}

function calculateProactiveRate(texts) {
  const proactiveMarkers = [
    "we could", "let's", "I suggest", "what if", "consider",
    "proactive", "recommend", "improve", "optimize"
  ];
  const proactiveCount = texts.filter(t => 
    proactiveMarkers.some(m => t.toLowerCase().includes(m))
  ).length;
  return proactiveCount / texts.length;
}

function calculateQuestionRatio(texts) {
  const questionCount = texts.filter(t => t.includes("?")).length;
  return questionCount / texts.length;
}

function estimateWarmth(texts) {
  // Simple heuristic based on informal markers
  const warmMarkers = ["🦊", "😄", "bloody", "fucking", "awesome", "great"];
  const warmCount = texts.filter(t => 
    warmMarkers.some(m => t.includes(m))
  ).length;
  return Math.min(10, (warmCount / texts.length) * 20 + 5); // Rough estimate
}

function extractTopics(messages) {
  // Simple keyword extraction - would use NLP in production
  const allText = messages.join(" ").toLowerCase();
  const candidates = [
    "graphiti", "neo4j", "codex", "anthropic", "cron", "second brain",
    "gaia", "bel", "jack", "elliott", "grv", "memory", "system"
  ];
  return candidates.filter(c => allText.includes(c));
}

function checkAlignment(current, pastViews) {
  // Simple string similarity - would use embeddings in production
  const currentLower = current.toLowerCase();
  const matches = pastViews.filter(past => 
    currentLower.includes(past.toLowerCase().slice(0, 20)) ||
    past.toLowerCase().includes(currentLower.slice(0, 20))
  ).length;
  return matches / pastViews.length;
}

module.exports = {
  analyzeRecentStyle,
  detectDrift,
  periodicTopicReflection,
  executeCorrection,
  BASELINE
};
