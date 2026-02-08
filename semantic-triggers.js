/**
 * Semantic Trigger System
 * 
 * Detects patterns beyond keywords using sentiment, context, and behavior
 */

const SENTIMENT_PATTERNS = {
  exhaustion: {
    keywords: ["exhausted", "tired", "drained", "wiped", "done", "spent"],
    sentiment: "negative",
    intensity: "high",
    context: ["work", "meeting", "day", "week"]
  },
  overwhelm: {
    keywords: ["overwhelmed", "too much", "drowning", "can't cope", "breaking"],
    sentiment: "negative", 
    intensity: "high",
    context: ["everything", "all at once", "piling up"]
  },
  frustration: {
    keywords: ["frustrated", "annoyed", "pissed off", "fucking hell", "sick of"],
    sentiment: "negative",
    intensity: "medium-high",
    context: ["this", "that", "it", "they"]
  },
  decision_paralysis: {
    keywords: ["can't decide", "don't know what to do", "stuck", "paralyzed"],
    sentiment: "confused",
    intensity: "medium",
    context: ["choice", "option", "path", "direction"]
  },
  avoidance: {
    keywords: ["later", "tomorrow", "not now", "maybe next week", "eventually"],
    sentiment: "avoidant",
    intensity: "low-medium",
    context: ["task", "thing", "conversation", "call"]
  },
  social_withdrawal: {
    keywords: ["don't want to see anyone", "leave me alone", "can't people"],
    sentiment: "negative",
    intensity: "high",
    context: ["people", "social", "group", "family"]
  },
  creative_flow: {
    keywords: ["in the zone", "flowing", "crushing it", "on fire", "unstoppable"],
    sentiment: "positive",
    intensity: "high",
    context: ["work", "building", "creating", "coding"]
  },
  reflection_request: {
    keywords: ["what do you think", "your thoughts", "am I crazy", "does this make sense"],
    sentiment: "seeking",
    intensity: "medium",
    context: ["pattern", "situation", "behavior", "choice"]
  }
};

/**
 * Analyze message for semantic triggers (not just keyword matching)
 */
function analyzeSemanticTriggers(message, conversationContext = []) {
  const lowerMsg = message.toLowerCase();
  const detected = [];
  
  for (const [patternName, pattern] of Object.entries(SENTIMENT_PATTERNS)) {
    // Check keywords (base match)
    const keywordMatch = pattern.keywords.some(kw => lowerMsg.includes(kw));
    
    if (keywordMatch) {
      // Check context words for confirmation
      const contextMatch = pattern.context.some(ctx => 
        lowerMsg.includes(ctx) || 
        conversationContext.some(c => c.toLowerCase().includes(ctx))
      );
      
      // Calculate confidence
      const confidence = contextMatch ? 0.85 : 0.65;
      
      detected.push({
        pattern: patternName,
        confidence,
        sentiment: pattern.sentiment,
        intensity: pattern.intensity,
        trigger_phrase: extractTriggerPhrase(message, pattern.keywords)
      });
    }
  }
  
  // Additional semantic detection (beyond keywords)
  detected.push(...detectImplicitPatterns(message, conversationContext));
  
  return detected.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Detect implicit patterns (not keyword-based)
 */
function detectImplicitPatterns(message, context) {
  const implicit = [];
  const lowerMsg = message.toLowerCase();
  
  // Pattern: Deflection ("It's fine" when it's not)
  if (lowerMsg.includes("it's fine") || lowerMsg.includes("i'm fine")) {
    const recentNegative = context.slice(-3).some(c => 
      c.toLowerCase().includes("stressed") ||
      c.toLowerCase().includes("worried") ||
      c.toLowerCase().includes("problem")
    );
    if (recentNegative) {
      implicit.push({
        pattern: "deflection",
        confidence: 0.7,
        sentiment: "suppressed",
        intensity: "medium",
        note: "Possible suppression of real feelings"
      });
    }
  }
  
  // Pattern: Repeated complaint (same issue, different words)
  // Would need graph search for this
  
  // Pattern: Sudden topic shift (avoidance)
  if (context.length > 0) {
    const lastTopic = extractTopic(context[context.length - 1]);
    const currentTopic = extractTopic(message);
    if (lastTopic && currentTopic && lastTopic !== currentTopic && 
        message.length < 50 && lowerMsg.includes("anyway")) {
      implicit.push({
        pattern: "topic_avoidance",
        confidence: 0.6,
        sentiment: "avoidant",
        intensity: "low",
        note: "Possible avoidance of previous topic"
      });
    }
  }
  
  // Pattern: Time references indicating procrastination
  const timePushRegex = /(next week|later|tomorrow|someday|eventually|when i have time)/i;
  if (timePushRegex.test(message) && context.some(c => c.includes("need to") || c.includes("should"))) {
    implicit.push({
      pattern: "procrastination_signal",
      confidence: 0.75,
      sentiment: "avoidant",
      intensity: "medium",
      note: "Task deferral pattern detected"
    });
  }
  
  return implicit;
}

/**
 * Extract the specific phrase that triggered detection
 */
function extractTriggerPhrase(message, keywords) {
  for (const kw of keywords) {
    const index = message.toLowerCase().indexOf(kw);
    if (index !== -1) {
      // Get surrounding context
      const start = Math.max(0, index - 20);
      const end = Math.min(message.length, index + kw.length + 20);
      return message.slice(start, end).trim();
    }
  }
  return message.slice(0, 50);
}

/**
 * Extract topic from message (simple version)
 */
function extractTopic(message) {
  // Would use NLP in production
  const topics = ["work", "family", "health", "coding", "meeting", "elliott", "bel", "jack"];
  for (const topic of topics) {
    if (message.toLowerCase().includes(topic)) return topic;
  }
  return null;
}

module.exports = {
  analyzeSemanticTriggers,
  detectImplicitPatterns,
  SENTIMENT_PATTERNS
};
