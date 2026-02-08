/**
 * Natural Alert Generator
 * 
 * Converts metrics/data into conversational, non-robotic alerts
 * that feel like Kit, not a notification system.
 */

const TONE_VARIATIONS = {
  casual: {
    openers: [
      "Heads up",
      "Quick pattern check",
      "Noticing something",
      "Saw this",
      "FYI",
      "Random observation"
    ],
    connectors: [
      "Usually means",
      "Pattern shows",
      "Historically",
      "Your data suggests",
      "Last 3 times this happened"
    ],
    closers: [
      "Want me to {action}?",
      "Thoughts?",
      "Keep an eye on it?",
      "Sound about right?",
      "Adjust or ignore?"
    ]
  },
  gentle: {
    openers: [
      "Maybe not now, but",
      "When you have a sec",
      "No rush, but",
      "File under 'later' if needed"
    ],
    connectors: [
      "I've noticed",
      "There's a pattern where",
      "Soft signal that"
    ],
    closers: [
      "Up to you",
      "Just logging it",
      "Your call",
      "No action needed unless you want"
    ]
  },
  direct: {
    openers: [
      "Pattern alert",
      "Heads up",
      "Detected"
    ],
    connectors: [
      "Clear correlation:",
      "Data shows",
      "Consistent pattern:"
    ],
    closers: [
      "Recommend: {action}",
      "Suggested adjustment:",
      "Consider:"
    ]
  }
};

const ALERT_TEMPLATES = {
  energy: {
    pre_crash: [
      "{opener} - {connector} {trigger} usually precedes a {duration} energy drop. {closer}",
      "{opener}: {context} detected. Pattern: {prediction}. {closer}",
      "You're in the zone on {activity}, which is great, but {connector} this intensity level → crash in ~{timeframe}. {closer}"
    ],
    recovery_window: [
      "{opener}: {connector} your recovery window is now - {timeframe} before it gets harder. {closer}",
      "Soft signal: you're at {percentage} of typical daily energy. {connector} most effective reset is {activity}. {closer}"
    ],
    mismatch: [
      "{opener} - you're attempting {high_energy_task} but {connector} you're in {low_energy_state} mode. {closer}",
      "Mismatch alert: {current_activity} requires {required_state}, but your pattern shows {actual_state}. {closer}"
    ]
  },
  
  loops: {
    stale: [
      "{opener}: {topic} from {timeframe} still open. {connector} it usually means either done-and-forgot or still-important. {closer}",
      "Dangling thread: {topic} ({days} days). Archive or schedule?",
      "{count} conversations this week without close-out. {connector} open loops = cognitive drag. Want a quick review?"
    ],
    relationship: [
      "{opener}: {days} days since contact with {person}. {connector} your drift-risk threshold is ~{threshold}. {closer}",
      "Relationship maintenance: {person} thread cooling ({days} days). Quick ping or intentional space?"
    ]
  },
  
  decisions: {
    load_high: [
      "{opener} - that's decision #{count} today. {connector} quality drops after {limit}. {closer}",
      "Decision load: {count} significant choices in {timeframe}. {connector} you're in the fatigue zone. {closer}"
    ],
    quality_risk: [
      "{opener}: this choice has {complexity} complexity, but {connector} you're at {fatigue_level} fatigue. {closer}"
    ]
  },
  
  stress: {
    precursor: [
      "{opener}: current pattern matches {count} previous pre-burnout sequences. {connector} intervention window is now. {closer}",
      "Stress signal: {indicators}. {connector} these preceded {previous_outcome}. {closer}"
    ]
  }
};

/**
 * Generate a natural, conversational alert
 */
function generateAlert(type, subtype, data, options = {}) {
  const tone = options.tone || detectToneContext(data);
  const template = pickTemplate(type, subtype);
  const variations = TONE_VARIATIONS[tone];
  
  // Fill template
  let alert = template
    .replace(/{opener}/g, pickRandom(variations.openers))
    .replace(/{connector}/g, pickRandom(variations.connectors))
    .replace(/{closer}/g, pickRandom(variations.closers));
  
  // Fill data fields
  for (const [key, value] of Object.entries(data)) {
    alert = alert.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  
  return alert;
}

/**
 * Detect appropriate tone based on context
 */
function detectToneContext(data) {
  if (data.urgency > 0.7) return 'direct';
  if (data.stressed || data.fatigue > 0.6) return 'gentle';
  return 'casual';
}

/**
 * Pick a template, avoiding recent repeats
 */
function pickTemplate(type, subtype) {
  const templates = ALERT_TEMPLATES[type]?.[subtype] || 
                    ALERT_TEMPLATES[type]?.default ||
                    ["{opener}: {message}. {closer}"];
  
  // Could track recent usage and pick least-recent
  return pickRandom(templates);
}

/**
 * Batch multiple alerts into one natural message
 */
function batchAlerts(alerts, maxItems = 3) {
  if (alerts.length === 0) return null;
  if (alerts.length === 1) return alerts[0];
  if (alerts.length > maxItems) {
    return `${pickRandom(TONE_VARIATIONS.casual.openers)} - ${alerts.length} things I'm noticing:\n\n${alerts.slice(0, maxItems).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n${pickRandom(TONE_VARIATIONS.casual.closers).replace('{action}', 'dive deeper')}`;
  }
  
  return `${pickRandom(TONE_VARIATIONS.casual.openers)}:\n\n${alerts.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n${pickRandom(TONE_VARIATIONS.casual.closers).replace('{action}', 'prioritize')}`;
}

/**
 * Track alert effectiveness
 */
const alertHistory = new Map();

function logAlert(type, alert, response) {
  const key = `${type}:${hashAlert(alert)}`;
  const history = alertHistory.get(key) || { sent: 0, ignored: 0, useful: 0 };
  
  history.sent++;
  
  // Analyze response
  if (response.includes('thanks') || response.includes('useful') || 
      response.includes('good catch') || response.includes('yeah')) {
    history.useful++;
  } else if (response.includes('skip') || response.includes('not now') ||
             response.includes('stop') || response.length < 5) {
    history.ignored++;
  }
  
  alertHistory.set(key, history);
  
  // Adjust if needed
  if (history.sent > 3 && history.ignored / history.sent > 0.7) {
    return { action: 'REDUCE_FREQUENCY', type };
  }
  
  return { action: 'CONTINUE' };
}

// Helpers
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hashAlert(alert) {
  // Simple hash for tracking
  return alert.slice(0, 30).replace(/\s/g, '');
}

module.exports = {
  generateAlert,
  batchAlerts,
  logAlert,
  ALERT_TEMPLATES,
  TONE_VARIATIONS
};
