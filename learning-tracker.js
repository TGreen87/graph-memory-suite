/**
 * Learning Integration Loop
 * 
 * Tracks: "I learned X" → implementation → results
 */

const { add_memory, search } = require('./graphiti-memory.js');

const GROUP_ID = "tom-kit-learning";

/**
 * Log new learning/concept
 */
async function logLearning(concept, source, context) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "LearningTracker",
      content: `[LEARNED] "${concept}" | Source: ${source} | Context: ${context} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Log implementation attempt
 */
async function logImplementation(concept, action, result) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "LearningTracker",
      content: `[IMPLEMENTED] "${concept}" | Action: ${action} | Result: ${result} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Find unimplemented learnings
 */
async function findUnimplementedLearnings(daysThreshold = 30) {
  const learnings = await search({
    query: "learned concept interesting discovered",
    group_ids: [GROUP_ID],
    max_facts: 30
  });
  
  const unimplemented = [];
  const now = Date.now();
  
  for (const fact of learnings.facts || []) {
    const concept = extractConcept(fact.fact);
    const age = (now - new Date(fact.created_at)) / (1000 * 60 * 60 * 24);
    
    // Check if implemented
    const implementations = await search({
      query: `implemented "${concept}" action result`,
      group_ids: [GROUP_ID],
      max_facts: 3
    });
    
    const hasImplementation = implementations.facts && implementations.facts.length > 0;
    
    if (!hasImplementation && age > 3) { // Give 3 days grace period
      unimplemented.push({
        concept: concept.slice(0, 60),
        learned_date: fact.created_at,
        days_since: Math.round(age),
        source: extractSource(fact.fact)
      });
    }
  }
  
  return unimplemented.sort((a, b) => b.days_since - a.days_since);
}

/**
 * Find successfully implemented learnings
 */
async function findSuccessfulImplementations(daysBack = 90) {
  const implementations = await search({
    query: "implemented result success positive effective",
    group_ids: [GROUP_ID],
    max_facts: 20
  });
  
  const successes = [];
  
  for (const fact of implementations.facts || []) {
    const concept = extractConcept(fact.fact);
    const result = extractResult(fact.fact);
    
    if (isPositiveResult(result)) {
      successes.push({
        concept: concept.slice(0, 60),
        result: result.slice(0, 100),
        implemented_date: fact.created_at
      });
    }
  }
  
  return successes;
}

/**
 * Calculate learning effectiveness
 */
async function calculateLearningEffectiveness(daysBack = 90) {
  const learnings = await search({
    query: "learned concept",
    group_ids: [GROUP_ID],
    max_facts: 50
  });
  
  const implementations = await search({
    query: "implemented",
    group_ids: [GROUP_ID],
    max_facts: 50
  });
  
  const totalLearned = learnings.facts?.length || 0;
  const totalImplemented = implementations.facts?.length || 0;
  
  // Find which learnings got implemented
  const implementedConcepts = new Set();
  for (const fact of implementations.facts || []) {
    implementedConcepts.add(extractConcept(fact.fact));
  }
  
  const learnedConcepts = learnings.facts?.map(f => extractConcept(f.fact)) || [];
  const withImplementation = learnedConcepts.filter(c => 
    implementedConcepts.has(c)
  ).length;
  
  return {
    total_learned: totalLearned,
    total_implemented: totalImplemented,
    implementation_rate: totalLearned > 0 ? 
      ((withImplementation / totalLearned) * 100).toFixed(1) + "%" : "N/A",
    insight: generateInsight(totalLearned, withImplementation)
  };
}

/**
 * Detect learning mention in conversation
 */
function detectLearningIntent(message) {
  const patterns = [
    { regex: /(?:learned|discovered|realized|found out) (?:that)? (.+)/i, type: "realization" },
    { regex: /(?:interesting|fascinating) (?:that|how) (.+)/i, type: "interest" },
    { regex: /(?:never knew|didn't know) (?:that)? (.+)/i, type: "new_knowledge" },
    { regex: /(?:reading|watching|listening to) (.+?) (?:and|which) (.+)/i, type: "media_learning" }
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match) {
      return {
        detected: true,
        type: pattern.type,
        concept: (match[1] || match[2] || "").slice(0, 100),
        confidence: "medium"
      };
    }
  }
  
  return { detected: false };
}

/**
 * Suggest experiment for learning
 */
async function suggestExperiment(concept) {
  const similar = await search({
    query: `${concept} implemented action experiment`,
    group_ids: [GROUP_ID],
    max_facts: 3
  });
  
  if (similar.facts && similar.facts.length > 0) {
    const pastAction = extractAction(similar.facts[0].fact);
    return {
      suggestion: `You tried "${pastAction}" with similar concepts. Want to adapt that?`,
      based_on: pastAction
    };
  }
  
  // Generic suggestions by concept type
  if (concept.includes("habit") || concept.includes("routine")) {
    return { suggestion: "Try it for 7 days and log results" };
  }
  if (concept.includes("technique") || concept.includes("method")) {
    return { suggestion: "Apply it to one current task and compare results" };
  }
  if (concept.includes("tool") || concept.includes("app")) {
    return { suggestion: "Use it for 3 tasks this week, then evaluate" };
  }
  
  return { suggestion: "Pick one small way to try this today" };
}

// Helpers
function extractConcept(factText) {
  const match = factText.match(/"(.+?)"/);
  return match ? match[1] : factText.slice(0, 50);
}

function extractSource(factText) {
  const match = factText.match(/Source:\s*(.+?)\s*\|/);
  return match ? match[1] : "unknown";
}

function extractResult(factText) {
  const match = factText.match(/Result:\s*(.+?)(?:\s*\||$)/);
  return match ? match[1] : "";
}

function extractAction(factText) {
  const match = factText.match(/Action:\s*(.+?)\s*\|/);
  return match ? match[1] : "";
}

function isPositiveResult(result) {
  const positive = ["worked", "success", "helped", "improved", "effective", "great", "good"];
  return positive.some(p => result.toLowerCase().includes(p));
}

function generateInsight(total, implemented) {
  const rate = total > 0 ? implemented / total : 0;
  
  if (rate > 0.5) {
    return "Strong integrator - you actually use what you learn";
  } else if (rate > 0.2) {
    return "Moderate implementation - selective about what you apply";
  } else if (total > 10) {
    return "Collector pattern - learning without integration. Consider intentional application.";
  } else {
    return "Early tracking - need more data for pattern analysis";
  }
}

module.exports = {
  logLearning,
  logImplementation,
  findUnimplementedLearnings,
  findSuccessfulImplementations,
  calculateLearningEffectiveness,
  detectLearningIntent,
  suggestExperiment,
  GROUP_ID
};
