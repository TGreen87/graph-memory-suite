/**
 * Recovery Pattern Recognition
 * 
 * Discovers what actually recharges Tom by testing interventions
 */

const { add_memory, search } = require('./insights.js');

const GROUP_ID = "tom-kit-recovery";

const INTERVENTIONS = [
  { id: "walk", name: "20-minute walk", type: "physical" },
  { id: "nap", name: "Power nap (20-30min)", type: "rest" },
  { id: "nature", name: "Time in nature", type: "environmental" },
  { id: "shower", name: "Shower/bath", type: "sensory" },
  { id: "social", name: "Quick social connection", type: "social" },
  { id: "solo", name: "Alone time", type: "social" },
  { id: "creative", name: "Low-stakes creative activity", type: "creative" },
  { id: "food", name: "Nutrition/hydration", type: "physical" },
  { id: "breathing", name: "Breathing exercises", type: "mindfulness" },
  { id: "music", name: "Music break", type: "sensory" }
];

/**
 * Log pre-recovery state
 */
async function logPreRecovery(state, trigger) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "RecoveryTracker",
      content: `[PRE] Energy: ${state.energy}/10 | Mood: ${state.mood}/10 | Stress: ${state.stress}/10 | Trigger: ${trigger}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Log intervention attempt
 */
async function logIntervention(interventionId, duration) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "RecoveryTracker",
      content: `[INTERVENTION] Type: ${interventionId} | Duration: ${duration}min | Started: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Log post-recovery state
 */
async function logPostRecovery(state, notes) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "RecoveryTracker",
      content: `[POST] Energy: ${state.energy}/10 | Mood: ${state.mood}/10 | Notes: ${notes}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Calculate effectiveness of an intervention
 */
async function calculateEffectiveness(interventionId, daysBack = 30) {
  const history = await search({
    query: `${interventionId} recovery pre post energy mood`,
    group_ids: [GROUP_ID],
    max_facts: 20
  });
  
  if (!history.facts || history.facts.length < 2) {
    return { 
      intervention: interventionId, 
      sampleSize: 0, 
      effectiveness: "unknown",
      recommendation: "Try this intervention 3+ times to build data"
    };
  }
  
  // Parse pre/post pairs
  const sessions = parseRecoverySessions(history.facts);
  
  if (sessions.length === 0) {
    return { intervention: interventionId, sampleSize: 0, effectiveness: "unknown" };
  }
  
  // Calculate improvements
  const energyGains = sessions.map(s => s.post.energy - s.pre.energy);
  const moodGains = sessions.map(s => s.post.mood - s.pre.mood);
  
  const avgEnergyGain = energyGains.reduce((a, b) => a + b, 0) / energyGains.length;
  const avgMoodGain = moodGains.reduce((a, b) => a + b, 0) / moodGains.length;
  
  const successRate = energyGains.filter(g => g > 1).length / energyGains.length;
  
  return {
    intervention: interventionId,
    name: INTERVENTIONS.find(i => i.id === interventionId)?.name || interventionId,
    sampleSize: sessions.length,
    avgEnergyGain: avgEnergyGain.toFixed(1),
    avgMoodGain: avgMoodGain.toFixed(1),
    successRate: (successRate * 100).toFixed(0) + "%",
    effectiveness: successRate > 0.7 ? "high" : successRate > 0.4 ? "medium" : "low",
    recommendation: generateInterventionAdvice(successRate, avgEnergyGain)
  };
}

/**
 * Find best recovery method for current state
 */
async function recommendRecovery(currentEnergy, currentStress, timeAvailable) {
  const results = [];
  
  for (const intervention of INTERVENTIONS) {
    const effectiveness = await calculateEffectiveness(intervention.id);
    if (effectiveness.sampleSize > 0) {
      results.push({ ...intervention, ...effectiveness });
    }
  }
  
  // Sort by effectiveness
  results.sort((a, b) => parseFloat(b.avgEnergyGain) - parseFloat(a.avgEnergyGain));
  
  // Filter by time
  const feasible = results.filter(r => {
    if (timeAvailable < 20) return r.id !== "walk" && r.id !== "nature";
    return true;
  });
  
  return {
    topRecommendation: feasible[0] || results[0],
    alternatives: feasible.slice(1, 4),
    allRanked: results
  };
}

/**
 * Generate personal recovery playbook
 */
async function generateRecoveryPlaybook() {
  const playbook = {};
  
  for (const intervention of INTERVENTIONS) {
    const stats = await calculateEffectiveness(intervention.id, 90); // 90 days
    if (stats.sampleSize >= 3) {
      playbook[intervention.id] = stats;
    }
  }
  
  // Sort by effectiveness
  const sorted = Object.entries(playbook)
    .sort(([,a], [,b]) => parseFloat(b.avgEnergyGain) - parseFloat(a.avgEnergyGain));
  
  return {
    topMethod: sorted[0]?.[1],
    topThree: sorted.slice(0, 3).map(([,data]) => data),
    avoid: sorted.filter(([,data]) => data.effectiveness === "low").map(([,data]) => data.name),
    playbook: Object.fromEntries(sorted)
  };
}

/**
 * Detect recovery mention in conversation
 */
function detectRecoveryMention(message) {
  const patterns = [
    /(?:just|going to|need a) (?:walk|nap|shower|break)/i,
    /(?:felt|feel) better after (.+)/i,
    /(?:going for|taking) a (.+)/i,
    /(?:recharged|refreshed|reset) (?:with|after) (.+)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const intervention = match[1] || "unspecified";
      return { detected: true, intervention: intervention.trim() };
    }
  }
  
  return { detected: false };
}

// Helpers
function parseRecoverySessions(facts) {
  const sessions = [];
  let current = null;
  
  for (const fact of facts.sort((a, b) => 
    new Date(a.created_at) - new Date(b.created_at)
  )) {
    if (fact.fact.includes("[PRE]")) {
      current = { pre: parseState(fact.fact) };
    } else if (fact.fact.includes("[POST]") && current) {
      current.post = parseState(fact.fact);
      sessions.push(current);
      current = null;
    } else if (fact.fact.includes("[INTERVENTION]") && current) {
      current.intervention = parseIntervention(fact.fact);
    }
  }
  
  return sessions;
}

function parseState(factText) {
  const energy = factText.match(/Energy:\s*(\d+)/);
  const mood = factText.match(/Mood:\s*(\d+)/);
  const stress = factText.match(/Stress:\s*(\d+)/);
  
  return {
    energy: energy ? parseInt(energy[1]) : 5,
    mood: mood ? parseInt(mood[1]) : 5,
    stress: stress ? parseInt(stress[1]) : 5
  };
}

function parseIntervention(factText) {
  const match = factText.match(/Type:\s*(\w+)/);
  return match ? match[1] : "unknown";
}

function generateInterventionAdvice(successRate, avgGain) {
  if (successRate > 0.7 && avgGain > 2) {
    return "This is your go-to recovery method - highly effective for you";
  } else if (successRate > 0.5) {
    return "Works well - reliable option when you need reset";
  } else if (successRate > 0.3) {
    return "Sometimes works - worth trying but have backup plan";
  } else {
    return "Not effective for you - try other methods instead";
  }
}

module.exports = {
  logPreRecovery,
  logIntervention,
  logPostRecovery,
  calculateEffectiveness,
  recommendRecovery,
  generateRecoveryPlaybook,
  detectRecoveryMention,
  INTERVENTIONS,
  GROUP_ID
};
