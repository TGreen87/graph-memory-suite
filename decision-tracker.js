/**
 * Decision Follow-Through Tracker
 * 
 * Tracks: Decision → Commitment → Execution/Abandonment
 */

const { add_memory, search } = require('./graphiti-memory.js');

const GROUP_ID = "tom-kit-decisions";

/**
 * Log a new decision
 */
async function logDecision(decision, rationale, expectedOutcome) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "DecisionTracker",
      content: `[DECIDED] "${decision}" | Rationale: ${rationale} | Expected: ${expectedOutcome} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Log commitment to decision
 */
async function logCommitment(decision, actionPlan) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "DecisionTracker",
      content: `[COMMITTED] "${decision}" | Plan: ${actionPlan} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Log execution progress
 */
async function logProgress(decision, progress, notes) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "DecisionTracker",
      content: `[PROGRESS] "${decision}" | Status: ${progress}% | Notes: ${notes} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Close decision (completed or abandoned)
 */
async function closeDecision(decision, outcome, actualResult) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "DecisionTracker",
      content: `[CLOSED] "${decision}" | Outcome: ${outcome} | Actual: ${actualResult} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Find abandoned decisions
 */
async function findAbandonedDecisions(daysThreshold = 30) {
  const allDecisions = await search({
    query: "decided commitment plan action",
    group_ids: [GROUP_ID],
    max_facts: 30
  });
  
  // Group by decision
  const decisionMap = new Map();
  
  for (const fact of allDecisions.facts || []) {
    const decisionText = extractDecisionText(fact.fact);
    if (!decisionMap.has(decisionText)) {
      decisionMap.set(decisionText, []);
    }
    decisionMap.get(decisionText).push(fact);
  }
  
  // Find abandoned ones
  const abandoned = [];
  const now = new Date();
  
  for (const [decision, facts] of decisionMap) {
    const hasClose = facts.some(f => f.fact.includes("[CLOSED]"));
    const hasProgress = facts.some(f => f.fact.includes("[PROGRESS]") && extractProgress(f.fact) > 0);
    
    if (!hasClose && !hasProgress) {
      const lastActivity = new Date(facts[facts.length - 1].created_at);
      const daysStale = (now - lastActivity) / (1000 * 60 * 60 * 24);
      
      if (daysStale > daysThreshold) {
        abandoned.push({
          decision: decision.slice(0, 60),
          days_abandoned: Math.round(daysStale),
          decided_date: facts[0].created_at,
          last_activity: lastActivity
        });
      }
    }
  }
  
  return abandoned.sort((a, b) => b.days_abandoned - a.days_abandoned);
}

/**
 * Find in-progress decisions
 */
async function findInProgressDecisions() {
  const all = await search({
    query: "decided commitment progress",
    group_ids: [GROUP_ID],
    max_facts: 20
  });
  
  const inProgress = [];
  const decisionMap = new Map();
  
  for (const fact of all.facts || []) {
    const decision = extractDecisionText(fact.fact);
    if (!decisionMap.has(decision)) {
      decisionMap.set(decision, { facts: [], progress: 0 });
    }
    
    if (fact.fact.includes("[PROGRESS]")) {
      const progress = extractProgress(fact.fact);
      if (progress > decisionMap.get(decision).progress) {
        decisionMap.get(decision).progress = progress;
      }
    }
    
    decisionMap.get(decision).facts.push(fact);
  }
  
  for (const [decision, data] of decisionMap) {
    const hasClose = data.facts.some(f => f.fact.includes("[CLOSED]"));
    if (!hasClose && data.progress > 0 && data.progress < 100) {
      inProgress.push({
        decision: decision.slice(0, 60),
        progress: data.progress,
        last_update: data.facts[data.facts.length - 1].created_at
      });
    }
  }
  
  return inProgress.sort((a, b) => b.progress - a.progress);
}

/**
 * Calculate decision success rate
 */
async function calculateDecisionSuccess(daysBack = 90) {
  const decisions = await search({
    query: "decided closed outcome",
    group_ids: [GROUP_ID],
    max_facts: 50
  });
  
  let completed = 0;
  let abandoned = 0;
  let abandonedAfterProgress = 0;
  
  const decisionMap = new Map();
  
  for (const fact of decisions.facts || []) {
    const decision = extractDecisionText(fact.fact);
    if (!decisionMap.has(decision)) {
      decisionMap.set(decision, []);
    }
    decisionMap.get(decision).push(fact);
  }
  
  for (const [decision, facts] of decisionMap) {
    const closeFact = facts.find(f => f.fact.includes("[CLOSED]"));
    if (closeFact) {
      const outcome = extractOutcome(closeFact.fact);
      if (outcome === "completed" || outcome === "success") {
        completed++;
      } else if (outcome === "abandoned") {
        const hadProgress = facts.some(f => f.fact.includes("[PROGRESS]"));
        if (hadProgress) abandonedAfterProgress++;
        else abandoned++;
      }
    }
  }
  
  const total = completed + abandoned + abandonedAfterProgress;
  
  return {
    total_tracked: total,
    completed,
    abandoned,
    abandoned_after_progress: abandonedAfterProgress,
    completion_rate: total > 0 ? ((completed / total) * 100).toFixed(1) + "%" : "N/A",
    pattern: identifyPattern(completed, abandoned, abandonedAfterProgress)
  };
}

/**
 * Detect decision in conversation
 */
function detectDecisionIntent(message) {
  const patterns = [
    { regex: /(?:I['ve]|have)\s+(?:decided|chosen)\s+to?/i, type: "decision" },
    { regex: /(?:we're|I'm)\s+(?:going to|gonna)\s+/i, type: "commitment" },
    { regex: /(?:from now on|starting today|effective immediately)/i, type: "policy_change" },
    { regex: /(?:my decision is|I've made up my mind)/i, type: "definitive" }
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match) {
      return {
        detected: true,
        type: pattern.type,
        decision: extractDecisionFromMessage(message),
        confidence: "high"
      };
    }
  }
  
  return { detected: false };
}

// Helpers
function extractDecisionText(factText) {
  const match = factText.match(/"(.+?)"/);
  return match ? match[1] : factText.slice(0, 50);
}

function extractProgress(factText) {
  const match = factText.match(/Status:\s*(\d+)%/);
  return match ? parseInt(match[1]) : 0;
}

function extractOutcome(factText) {
  const match = factText.match(/Outcome:\s*(\w+)/);
  return match ? match[1].toLowerCase() : "unknown";
}

function extractDecisionFromMessage(message) {
  const patterns = [
    /(?:decided|chosen)\s+(?:to\s+)?(.+?)(?:\.|$|\s+because)/i,
    /(?:going to|gonna)\s+(.+?)(?:\.|$|\s+starting)/i,
    /from now on,?\s+(.+?)(?:\.|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1].trim().slice(0, 80);
  }
  
  return message.slice(0, 80);
}

function identifyPattern(completed, abandoned, abandonedAfterProgress) {
  if (completed > abandoned + abandonedAfterProgress) {
    return "Strong finisher - decisions usually get completed";
  } else if (abandonedAfterProgress > completed) {
    return "Sunk cost pattern - starts strong, abandons near finish";
  } else if (abandoned > completed) {
    return "Decision trap - makes decisions but doesn't act";
  } else {
    return "Mixed pattern - varies by decision type";
  }
}

module.exports = {
  logDecision,
  logCommitment,
  logProgress,
  closeDecision,
  findAbandonedDecisions,
  findInProgressDecisions,
  calculateDecisionSuccess,
  detectDecisionIntent,
  GROUP_ID
};
