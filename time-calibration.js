/**
 * Time Perception Calibration
 * 
 * Tracks estimates vs actuals to calibrate ADHD time blindness
 */

const { add_memory, search } = require('./graphiti-memory.js');
const { generateAlert } = require('./alert-generator.js');

const GROUP_ID = "tom-kit-time";

/**
 * Log a time estimate
 */
async function logTimeEstimate(task, estimatedMinutes, context = {}) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "TimeTracker",
      content: `[ESTIMATE] "${task}" | Estimated: ${estimatedMinutes}min | Context: ${context.source || 'direct'}`,
      timestamp: new Date().toISOString()
    }]
  });
  
  return { logged: true, task, estimate: estimatedMinutes };
}

/**
 * Log actual time spent
 */
async function logActualTime(task, actualMinutes, notes = "") {
  // Find the estimate
  const estimates = await search({
    query: `estimate for "${task}"`,
    group_ids: [GROUP_ID],
    max_facts: 3
  });
  
  const estimate = estimates.facts?.[0];
  const estimatedMinutes = estimate ? extractMinutes(estimate.fact) : null;
  
  const ratio = estimatedMinutes ? (actualMinutes / estimatedMinutes) : null;
  
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "TimeTracker",
      content: `[ACTUAL] "${task}" | Actual: ${actualMinutes}min | Ratio: ${ratio ? ratio.toFixed(1) + 'x' : 'N/A'} | Notes: ${notes}`,
      timestamp: new Date().toISOString()
    }]
  });
  
  return {
    logged: true,
    task,
    estimate: estimatedMinutes,
    actual: actualMinutes,
    ratio,
    calibration: getCalibrationAdvice(ratio)
  };
}

/**
 * Get calibration factor for a task type
 */
async function getCalibrationFactor(taskType) {
  const history = await search({
    query: `${taskType} time estimate actual ratio`,
    group_ids: [GROUP_ID],
    max_facts: 10
  });
  
  if (!history.facts || history.facts.length < 3) {
    return { factor: 1.5, confidence: "low", sampleSize: history.facts?.length || 0 };
  }
  
  const ratios = history.facts
    .map(f => extractRatio(f.fact))
    .filter(r => r !== null);
  
  if (ratios.length === 0) {
    return { factor: 1.5, confidence: "low", sampleSize: 0 };
  }
  
  // Calculate average ratio (trim outliers)
  ratios.sort((a, b) => a - b);
  const trimmed = ratios.slice(1, -1); // Remove highest and lowest
  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  
  return {
    factor: avg,
    confidence: ratios.length > 5 ? "high" : ratios.length > 2 ? "medium" : "low",
    sampleSize: ratios.length,
    range: { min: Math.min(...ratios), max: Math.max(...ratios) }
  };
}

/**
 * Calibrate an estimate before starting
 */
async function calibrateEstimate(task, userEstimate) {
  // Determine task type
  const taskType = classifyTaskType(task);
  
  // Get calibration factor
  const calibration = await getCalibrationFactor(taskType);
  
  // Calculate calibrated estimate
  const calibrated = Math.round(userEstimate * calibration.factor);
  
  // Generate insight
  let insight = "";
  if (calibration.confidence === "high" && calibration.factor > 2) {
    insight = `Historical data: ${taskType} tasks take ${calibration.factor.toFixed(1)}x longer than estimated`;
  } else if (calibration.confidence === "medium") {
    insight = `Limited data suggests ${calibration.factor.toFixed(1)}x multiplier for ${taskType}`;
  }
  
  return {
    userEstimate,
    calibratedEstimate: calibrated,
    calibrationFactor: calibration.factor,
    confidence: calibration.confidence,
    insight,
    taskType
  };
}

/**
 * Detect when user is estimating in conversation
 */
function detectEstimateIntent(message) {
  const patterns = [
    /(should|will|might)\s+take\s+(?:about|around|~)?\s*(\d+)\s*(min|minute|hour|hr)/i,
    /(\d+)\s*(min|minute|hour|hr)\s+(should|ought to)\s+do\s+it/i,
    /quick\s+(\w+)\s+(?:-|:)\s*(\d+)/i,
    /(?:estimate|guess):?\s*(\d+)\s*(min|hour)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const minutes = parseTimeToMinutes(match[2], match[3]);
      const task = extractTaskFromContext(message);
      return { detected: true, minutes, task, raw: match[0] };
    }
  }
  
  return { detected: false };
}

/**
 * Detect time check-ins
 */
function detectTimeCheckIn(message) {
  const patterns = [
    /(?:done|finished|completed)\s+(?:that|it)/i,
    /(?:took|spent)\s+(\d+)\s*(min|minute|hour|hr)/i,
    /(?:that\s+was|turned\s+out\s+to\s+be)\s+(\d+)\s*(min|hour)/i,
    /(?:way\s+longer|took\s+forever|shorter\s+than\s+expected)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return { 
        detected: true, 
        actualMinutes: match[1] ? parseTimeToMinutes(match[1], match[2]) : null,
        sentiment: extractTimeSentiment(message)
      };
    }
  }
  
  return { detected: false };
}

// Helpers
function extractMinutes(factText) {
  const match = factText.match(/Estimated:\s*(\d+)min/);
  return match ? parseInt(match[1]) : null;
}

function extractRatio(factText) {
  const match = factText.match(/Ratio:\s*([\d.]+)x/);
  return match ? parseFloat(match[1]) : null;
}

function parseTimeToMinutes(value, unit) {
  const num = parseInt(value);
  if (unit?.startsWith('hour') || unit?.startsWith('hr')) {
    return num * 60;
  }
  return num;
}

function classifyTaskType(task) {
  const lower = task.toLowerCase();
  if (lower.includes("code") || lower.includes("build") || lower.includes("dev")) return "coding";
  if (lower.includes("write") || lower.includes("draft")) return "writing";
  if (lower.includes("meeting") || lower.includes("call")) return "meeting";
  if (lower.includes("email") || lower.includes("message")) return "communication";
  if (lower.includes("research") || lower.includes("read")) return "research";
  if (lower.includes("design") || lower.includes("create")) return "creative";
  return "general";
}

function extractTaskFromContext(message) {
  // Simple extraction - would use NLP in production
  const sentences = message.split(/[.!?]/);
  for (const sent of sentences) {
    if (sent.includes("take") || sent.includes("should")) {
      return sent.trim().slice(0, 50);
    }
  }
  return "unspecified task";
}

function extractTimeSentiment(message) {
  const lower = message.toLowerCase();
  if (lower.includes("longer") || lower.includes("forever") || lower.includes("took ages")) {
    return "underestimated";
  }
  if (lower.includes("shorter") || lower.includes("quick") || lower.includes("faster")) {
    return "overestimated";
  }
  return "neutral";
}

function getCalibrationAdvice(ratio) {
  if (!ratio) return "Log estimates to build calibration data";
  if (ratio > 3) return "Significant underestimation - use 3x multiplier";
  if (ratio > 2) return "Consistent underestimation - double your estimates";
  if (ratio > 1.5) return "Mild underestimation - add 50% buffer";
  if (ratio < 0.8) return "Overestimation - you're faster than you think!";
  return "Good calibration - estimates are accurate";
}

module.exports = {
  logTimeEstimate,
  logActualTime,
  getCalibrationFactor,
  calibrateEstimate,
  detectEstimateIntent,
  detectTimeCheckIn,
  GROUP_ID
};
