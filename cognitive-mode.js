/**
 * Creativity vs Executive Cycle Tracker
 * 
 * Detects cognitive mode from message style
 */

const { add_memory, search } = require('./insights.js');

const GROUP_ID = "tom-kit-cognitive-mode";

const MODE_INDICATORS = {
  creative: {
    keywords: ["what if", "imagine", "explore", "possibility", "dream", "vision", "idea", "inspire"],
    sentence_structure: "longer, flowing, associative",
    punctuation: ["...", "!", "?"],
    tempo: "rapid, connected"
  },
  executive: {
    keywords: ["need to", "should", "must", "decide", "plan", "organize", "execute", "implement"],
    sentence_structure: "shorter, direct, action-oriented",
    punctuation: [".", ":"],
    tempo: "measured, deliberate"
  },
  analytical: {
    keywords: ["because", "therefore", "evidence", "data", "analysis", "compare", "evaluate"],
    sentence_structure: "logical, structured",
    punctuation: [".", ";"],
    tempo: "careful, precise"
  },
  reflective: {
    keywords: ["feel", "think", "wonder", "consider", "meaning", "why", "insight"],
    sentence_structure: "exploratory, questioning",
    punctuation: ["?", "..."],
    tempo: "slower, deeper"
  }
};

/**
 * Analyze message for cognitive mode
 */
function analyzeCognitiveMode(message, context = []) {
  const scores = {
    creative: 0,
    executive: 0,
    analytical: 0,
    reflective: 0
  };
  
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);
  
  // Keyword scoring
  for (const [mode, indicators] of Object.entries(MODE_INDICATORS)) {
    for (const keyword of indicators.keywords) {
      if (lower.includes(keyword)) scores[mode] += 2;
    }
  }
  
  // Sentence structure analysis
  const sentences = message.split(/[.!?]/).filter(s => s.trim());
  const avgLength = words.length / (sentences.length || 1);
  
  if (avgLength > 15) scores.creative += 1;
  if (avgLength < 10) scores.executive += 1;
  if (sentences.some(s => s.includes("because") || s.includes("therefore"))) scores.analytical += 1;
  if (sentences.some(s => s.includes("feel") || s.includes("think"))) scores.reflective += 1;
  
  // Punctuation analysis
  if (message.includes("...")) scores.creative += 1;
  if (message.includes(":")) scores.executive += 1;
  
  // Question ratio
  const questionCount = (message.match(/\?/g) || []).length;
  if (questionCount > 2) scores.reflective += 2;
  
  // Determine dominant mode
  const dominant = Object.entries(scores)
    .sort(([,a], [,b]) => b - a)[0];
  
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? (dominant[1] / totalScore) : 0;
  
  return {
    mode: dominant[0],
    confidence: confidence,
    scores: scores,
    indicators: extractIndicators(message, dominant[0])
  };
}

/**
 * Log mode detection
 */
async function logMode(mode, confidence, message) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "CognitiveTracker",
      content: `[MODE] ${mode} | Confidence: ${(confidence * 100).toFixed(0)}% | Msg: ${message.slice(0, 50)} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Check task/mode mismatch
 */
async function checkTaskModeMatch(currentTask, currentMode) {
  const taskRequirements = {
    "coding": ["creative", "analytical"],
    "writing": ["creative", "reflective"],
    "planning": ["executive", "analytical"],
    "deciding": ["executive", "analytical"],
    "reviewing": ["analytical", "executive"],
    "brainstorming": ["creative"],
    "organizing": ["executive"],
    "processing": ["reflective"]
  };
  
  const taskType = classifyTask(currentTask);
  const requiredModes = taskRequirements[taskType] || ["executive"];
  
  const isMatch = requiredModes.includes(currentMode);
  
  if (!isMatch) {
    return {
      mismatch: true,
      task: taskType,
      current_mode: currentMode,
      required_modes: requiredModes,
      suggestion: generateMismatchSuggestion(currentMode, requiredModes[0]),
      severity: calculateSeverity(currentMode, requiredModes)
    };
  }
  
  return { mismatch: false, match: true };
}

/**
 * Find optimal times for each mode
 */
async function findOptimalModeTimes(mode, daysBack = 30) {
  const modeLogs = await search({
    query: `${mode} mode cognitive`,
    group_ids: [GROUP_ID],
    max_facts: 50
  });
  
  const hourDistribution = new Array(24).fill(0);
  
  for (const fact of modeLogs.facts || []) {
    const date = new Date(fact.created_at);
    const hour = date.getHours();
    hourDistribution[hour]++;
  }
  
  // Find peak hours
  const peakHours = hourDistribution
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => `${h.hour}:00`);
  
  return {
    mode: mode,
    peak_hours: peakHours,
    distribution: hourDistribution,
    insight: `${mode} mode most common at ${peakHours[0]}`
  };
}

/**
 * Generate mode transition suggestion
 */
async function suggestModeTransition(fromMode, toTask) {
  const taskMode = classifyTask(toTask);
  const transitions = {
    "creative→executive": "Take 5 min to organize thoughts before executing",
    "executive→creative": "Free-write for 3 min to unlock creative mode",
    "analytical→creative": "Ask 'what if' three times before analyzing",
    "reflective→executive": "Set one concrete next step before acting"
  };
  
  const key = `${fromMode}→${taskMode}`;
  return transitions[key] || "Transition gradually - acknowledge the shift";
}

// Helpers
function extractIndicators(message, mode) {
  const indicators = MODE_INDICATORS[mode];
  const found = indicators.keywords.filter(k => message.toLowerCase().includes(k));
  return found.slice(0, 3);
}

function classifyTask(task) {
  const lower = task.toLowerCase();
  if (lower.includes("code") || lower.includes("build") || lower.includes("dev")) return "coding";
  if (lower.includes("write") || lower.includes("draft")) return "writing";
  if (lower.includes("plan") || lower.includes("schedule")) return "planning";
  if (lower.includes("decide") || lower.includes("choose")) return "deciding";
  if (lower.includes("review") || lower.includes("check")) return "reviewing";
  if (lower.includes("brainstorm") || lower.includes("ideate")) return "brainstorming";
  if (lower.includes("organize") || lower.includes("sort")) return "organizing";
  return "general";
}

function generateMismatchSuggestion(current, required) {
  const suggestions = {
    "creative→executive": "You're in creative flow, but this task needs execution mode. Switch tasks or take a 5-min transition break?",
    "executive→creative": "You're in task-mode, but this needs creativity. Free-write for 3 min first?",
    "reflective→executive": "You're in deep thinking mode. Want to capture insights before switching to action?",
    "analytical→creative": "Analysis mode detected, but this needs ideation. Ask 'what if' first?"
  };
  
  return suggestions[`${current}→${required}`] || 
    `Mode mismatch: ${current} vs ${required} needed`;
}

function calculateSeverity(current, required) {
  const mismatches = {
    "creative→executive": "high",
    "executive→creative": "medium",
    "reflective→executive": "medium",
    "analytical→creative": "low"
  };
  
  return mismatches[`${current}→${required[0]}`] || "medium";
}

module.exports = {
  analyzeCognitiveMode,
  logMode,
  checkTaskModeMatch,
  findOptimalModeTimes,
  suggestModeTransition,
  MODE_INDICATORS,
  GROUP_ID
};
