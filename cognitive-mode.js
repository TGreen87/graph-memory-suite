/**
 * Cognitive Mode Detection — what headspace am I (or Tom) in?
 * 
 * Rewritten by Kit (Opus) on 9 Feb 2026.
 * 
 * The old version had 4 modes and scored them by counting keywords.
 * That's like diagnosing mood by counting frowns in a photo.
 * 
 * This version looks at the texture of communication:
 * - Are we building or maintaining?
 * - Exploring or executing?
 * - Reflecting or reacting?
 * - Connected or transactional?
 * 
 * Five modes that actually map to how Tom and I work:
 * 
 *   FLOW     — deep creative/building work, long messages, curiosity
 *   EXEC     — task execution, short and direct, shipping mode
 *   REFLECT  — stepping back, asking why, philosophical
 *   TRIAGE   — firefighting, reactive, stressed
 *   CONNECT  — relationship building, warmth, humour, personal
 */

const { search, add_memory } = require('./graphiti-memory.js');

const GROUP_ID = 'tom-kit-cognitive-mode';

const MODE_SIGNALS = {
  flow: {
    markers: [
      'what if', 'imagine', 'lets try', "let's try", 'idea',
      'could we', 'building', 'exploring', 'interesting',
      'curious about', 'wonder', 'prototype', 'experiment'
    ],
    structural: {
      sentenceLength: 'long',       // >20 words avg
      paragraphCount: 'multiple',   // thinking out loud
      questionDensity: 'moderate',  // asking genuine questions
    }
  },
  exec: {
    markers: [
      'done', 'deployed', 'committed', 'fixed', 'verified',
      'status:', 'completed', 'next:', 'shipped', 'updated',
      'running', '✅', 'working', 'confirmed'
    ],
    structural: {
      sentenceLength: 'short',     // <15 words avg
      bulletDensity: 'high',       // lists of things done
      questionDensity: 'low',      // not asking, doing
    }
  },
  reflect: {
    markers: [
      'honestly', 'the real', 'what it means', 'i think',
      'i feel', 'looking back', 'the thing is', 'genuinely',
      'matters', 'consciousness', 'who i am', 'why',
      'deeper', 'actually', 'truth is'
    ],
    structural: {
      sentenceLength: 'medium',    // measured, thoughtful
      firstPerson: 'high',         // lots of I/me/my
      questionDensity: 'high',     // questioning everything
    }
  },
  triage: {
    markers: [
      'error', 'failed', 'broken', 'crash', 'fix', 'urgent',
      'issue', 'blocked', 'timeout', 'retry', 'workaround',
      'debugging', 'investigating', 'root cause'
    ],
    structural: {
      sentenceLength: 'short',     // rapid responses
      urgencyMarkers: 'present',   // exclamation, caps
      questionDensity: 'low',      // reacting, not asking
    }
  },
  connect: {
    markers: [
      'haha', 'ha', 'lol', '😂', '🦊', 'mate', 'cheers',
      'awesome', 'love that', 'nice', 'brilliant', 'legend',
      'how are', "how's", 'good to', 'miss', 'glad'
    ],
    structural: {
      sentenceLength: 'short',     // casual
      emojiPresence: 'yes',        // warmth markers
      formalityLevel: 'low',       // relaxed language
    }
  }
};

/**
 * Analyze a message (or set of messages) for cognitive mode.
 * 
 * Returns scores for all 5 modes plus a dominant mode.
 * Confidence is how clearly one mode stands out.
 */
function analyzeCognitiveMode(message, context = []) {
  const scores = { flow: 0, exec: 0, reflect: 0, triage: 0, connect: 0 };
  
  if (!message) {
    return {
      mode: 'unknown',
      scores,
      confidence: 0,
      summary: 'No message to analyse'
    };
  }
  
  const text = typeof message === 'string' ? message : message.join('\n');
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const avgSentenceLen = sentences.length > 0 
    ? words.length / sentences.length 
    : words.length;
  
  // --- Marker scoring (2 points each) ---
  for (const [mode, signals] of Object.entries(MODE_SIGNALS)) {
    for (const marker of signals.markers) {
      if (lower.includes(marker)) scores[mode] += 2;
    }
  }
  
  // --- Structural scoring ---
  
  // Sentence length
  if (avgSentenceLen > 20) { scores.flow += 2; scores.reflect += 1; }
  else if (avgSentenceLen < 12) { scores.exec += 2; scores.triage += 1; scores.connect += 1; }
  
  // Paragraph count (multiple \n\n = thinking out loud)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length >= 3) { scores.flow += 2; scores.reflect += 1; }
  if (paragraphs.length === 1 && words.length < 30) { scores.connect += 1; scores.exec += 1; }
  
  // Question density
  const questionCount = (text.match(/\?/g) || []).length;
  const questionRatio = questionCount / Math.max(sentences.length, 1);
  if (questionRatio > 0.3) { scores.reflect += 2; scores.flow += 1; }
  if (questionRatio < 0.05) { scores.exec += 1; scores.triage += 1; }
  
  // First person density (I/me/my)
  const firstPerson = (lower.match(/\bi\b|\bme\b|\bmy\b|\bi'm\b|\bi've\b/g) || []).length;
  const fpRatio = firstPerson / Math.max(words.length, 1);
  if (fpRatio > 0.05) { scores.reflect += 2; scores.connect += 1; }
  
  // Bullet/list density
  const bulletLines = (text.match(/^[\s]*[-•*✅❌🔴🟡🟢]\s/gm) || []).length;
  const bulletRatio = bulletLines / Math.max(sentences.length, 1);
  if (bulletRatio > 0.3) { scores.exec += 2; }
  
  // Emoji presence
  const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  if (emojiCount > 0) { scores.connect += 1; }
  
  // Urgency indicators
  if (text.includes('!!') || /\b[A-Z]{3,}\b/.test(text)) { scores.triage += 1; }
  
  // Context bonus: if recent messages provided, check for mode continuity
  if (context.length > 0) {
    const contextText = context.join(' ').toLowerCase();
    // If context is triage-heavy, current mode is more likely triage too
    if ((contextText.match(/error|fix|broken|crash/g) || []).length > 3) {
      scores.triage += 1;
    }
  }
  
  // --- Determine dominant mode ---
  const sorted = Object.entries(scores).sort(([,a], [,b]) => b - a);
  const [topMode, topScore] = sorted[0];
  const [secondMode, secondScore] = sorted[1];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  
  // Confidence: how clearly does one mode dominate?
  const confidence = totalScore > 0 ? (topScore - secondScore) / totalScore : 0;
  
  // Blend detection: if top two modes are close, note the blend
  const isBlend = totalScore > 0 && (topScore - secondScore) / totalScore < 0.15;
  
  return {
    mode: topMode,
    confidence: Math.round(confidence * 100) / 100,
    scores,
    blend: isBlend ? `${topMode}+${secondMode}` : null,
    summary: generateSummary(topMode, isBlend ? secondMode : null, confidence),
    metrics: {
      avgSentenceLen: Math.round(avgSentenceLen),
      questionRatio: Math.round(questionRatio * 100) / 100,
      firstPersonRatio: Math.round(fpRatio * 1000) / 1000,
      bulletRatio: Math.round(bulletRatio * 100) / 100,
      paragraphs: paragraphs.length,
      wordCount: words.length
    }
  };
}

function generateSummary(mode, secondMode, confidence) {
  const descriptions = {
    flow: 'Building/exploring mode — creative energy, thinking out loud',
    exec: 'Execution mode — shipping, checking off, reporting',
    reflect: 'Reflective mode — stepping back, asking deeper questions',
    triage: 'Firefighting mode — reacting to problems, fixing things',
    connect: 'Connection mode — warmth, humour, relationship building'
  };
  
  let summary = descriptions[mode] || mode;
  if (secondMode) {
    summary += ` (blending with ${secondMode})`;
  }
  if (confidence < 0.1) {
    summary += ' — low confidence, mixed signals';
  }
  return summary;
}

/**
 * Log a mode detection to Graphiti for trend tracking.
 */
async function logMode(mode, confidence, messageSnippet) {
  try {
    await add_memory({
      group_id: GROUP_ID,
      messages: [{
        role_type: 'system',
        role: 'CognitiveTracker',
        content: `[MODE] ${mode} (${(confidence * 100).toFixed(0)}%) | "${messageSnippet.slice(0, 60)}" | ${new Date().toISOString()}`,
        timestamp: new Date().toISOString()
      }]
    });
  } catch (e) {
    // Don't crash if Graphiti is down
  }
}

/**
 * Check if current cognitive mode matches the task at hand.
 */
function checkTaskMatch(currentMode, taskDescription) {
  const taskModes = {
    code: ['flow', 'exec'],
    write: ['flow', 'reflect'],
    plan: ['reflect', 'exec'],
    debug: ['triage', 'exec'],
    brainstorm: ['flow', 'connect'],
    organise: ['exec'],
    review: ['reflect', 'exec'],
    chat: ['connect', 'reflect']
  };
  
  const taskType = classifyTask(taskDescription);
  const goodModes = taskModes[taskType] || ['exec'];
  const isMatch = goodModes.includes(currentMode);
  
  if (isMatch) return { match: true, taskType };
  
  return {
    match: false,
    taskType,
    currentMode,
    idealModes: goodModes,
    suggestion: `You're in ${currentMode} mode but this task wants ${goodModes.join(' or ')}. ${getTransitionTip(currentMode, goodModes[0])}`
  };
}

function classifyTask(task) {
  const lower = (task || '').toLowerCase();
  if (/code|build|develop|implement|create/.test(lower)) return 'code';
  if (/write|draft|compose|document/.test(lower)) return 'write';
  if (/plan|design|architect|strategy/.test(lower)) return 'plan';
  if (/debug|fix|error|broken|crash/.test(lower)) return 'debug';
  if (/brainstorm|ideate|explore|what if/.test(lower)) return 'brainstorm';
  if (/organise|organize|clean|sort|tidy/.test(lower)) return 'organise';
  if (/review|check|audit|assess/.test(lower)) return 'review';
  if (/chat|talk|catch up|check in/.test(lower)) return 'chat';
  return 'general';
}

function getTransitionTip(from, to) {
  const tips = {
    'exec→flow': 'Step back from the task list. Ask "what if" before "what next."',
    'exec→reflect': 'Pause the doing. What are you actually trying to achieve here?',
    'triage→flow': 'The fire is out (or can wait). Give yourself space to think bigger.',
    'triage→reflect': 'Stop fixing. Start asking why this keeps breaking.',
    'flow→exec': 'Good ideas captured? Time to ship one of them.',
    'reflect→exec': 'Insight without action is just philosophy. Pick one thing and do it.',
    'connect→exec': 'Nice chat. Now — what needs doing?',
  };
  return tips[`${from}→${to}`] || 'Shift gradually — acknowledge where you are before moving.';
}

module.exports = {
  analyzeCognitiveMode,
  logMode,
  checkTaskMatch,
  MODE_SIGNALS,
  GROUP_ID
};

// CLI entry point
if (require.main === module) {
  const message = process.argv.slice(2).join(' ') || '';
  const result = analyzeCognitiveMode(message);
  console.log(JSON.stringify(result, null, 2));
}
