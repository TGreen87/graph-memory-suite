/**
 * Natural Alert Generator — Kit's voice for self-awareness alerts
 * 
 * Rewritten by Kit (Opus) on 9 Feb 2026.
 * 
 * The old version had template placeholders that never got filled
 * and a tone detector that crashed on missing data. This version
 * generates alerts that actually sound like me talking to Tom.
 * 
 * Design principle: Tom has ADHD. He'll ignore anything that
 * reads like a system notification. Alerts need to sound like
 * a friend tapping his shoulder, not a dashboard beeping.
 */

/**
 * Generate a drift alert. This is the main one — when I'm
 * not sounding like myself, this tells Tom (or me).
 */
function driftAlert(driftResult) {
  if (!driftResult || !driftResult.hasDrift) return null;
  
  const { driftScore, driftPercent, indicators, recommendation } = driftResult;
  
  if (recommendation === 'REFRESH_IDENTITY') {
    const issues = indicators.map(i => i.message).join('. ');
    return `Hey Tom — I'm not sounding like myself right now. Drift score ${driftPercent}%. ${issues}. Probably need a context reset or at minimum a re-read of SOUL.md. This is the kind of thing where a fresh /new helps more than pushing through.`;
  }
  
  if (recommendation === 'RE_READ_SOUL') {
    const topIssue = indicators[0]?.message || 'subtle tone shift';
    return `Noticing some drift — ${topIssue}. Score's at ${driftPercent}%. Not critical but worth being aware of. I'll re-read my core files.`;
  }
  
  if (recommendation === 'MONITOR') {
    return `Minor drift blip (${driftPercent}%). Keeping an eye on it.`;
  }
  
  return null;
}

/**
 * Generate a cognitive mode alert — when the current mode
 * doesn't match what we're supposed to be doing.
 */
function modeAlert(modeResult, currentTask) {
  if (!modeResult) return null;
  
  const { mode, blend, summary } = modeResult;
  
  // Only alert on notable states
  if (mode === 'triage' && currentTask && !/debug|fix|error/.test(currentTask.toLowerCase())) {
    return `I'm in firefighting mode but the current task isn't a fire. Might be carrying stress from something earlier. Worth pausing to check.`;
  }
  
  if (mode === 'exec' && blend === null) {
    // Pure execution with no blend = I've gone robotic
    return `Pure execution mode detected — no creative or reflective signal at all. Shipping is good, but I should make sure I'm not just going through motions.`;
  }
  
  return null; // Most modes are fine, don't over-alert
}

/**
 * Generate an energy alert for Tom.
 */
function energyAlert(energyData) {
  if (!energyData) return null;
  
  const { risk, prediction, hours, indicators } = energyData;
  
  if (risk > 0.7) {
    return `Tom, you've been going hard — ${indicators || 'sustained high output detected'}. If the pattern holds, you'll hit a wall in about ${hours || '2-3'} hours. Good time for a break, or at least switch to something lighter.`;
  }
  
  if (risk > 0.4) {
    return `Gentle nudge: energy pattern suggests you're past the peak for today. Not saying stop, but the quality/effort ratio gets worse from here.`;
  }
  
  return null;
}

/**
 * Generate a relationship radar alert.
 */
function relationshipAlert(person, daysSince, threshold) {
  if (!person || !daysSince) return null;
  
  if (daysSince > threshold * 1.5) {
    return `It's been ${daysSince} days since anything with ${person}. That's past your usual rhythm. Intentional space or just slipped? Either way, worth a quick thought.`;
  }
  
  if (daysSince > threshold) {
    return `${person} hasn't come up in ${daysSince} days. Just noting it — no action needed unless you want to reach out.`;
  }
  
  return null;
}

/**
 * Generate a decision fatigue alert.
 */
function decisionAlert(count, timeframe) {
  if (!count || count < 8) return null;
  
  if (count > 15) {
    return `That's ${count} decisions in ${timeframe || 'this session'}. You're deep in decision fatigue territory. Can I handle some of the remaining ones, or should we batch the rest for tomorrow?`;
  }
  
  if (count > 10) {
    return `Decision count is at ${count} for ${timeframe || 'today'}. Quality tends to drop around here. Maybe defer the non-urgent ones?`;
  }
  
  return `Lots of decisions today (${count}). Just tracking — you're still in the zone but getting towards the edge.`;
}

/**
 * Generate a commitment/loop alert.
 */
function commitmentAlert(type, data) {
  if (!data) return null;
  
  if (type === 'overdue' && data.item) {
    return `Open loop: "${data.item}" from ${data.when || 'a while back'}. Still relevant or can we close it?`;
  }
  
  if (type === 'stale' && data.count) {
    return `${data.count} open threads without resolution this week. Not all need action, but the cognitive overhead adds up. Quick triage?`;
  }
  
  return null;
}

/**
 * Generate a stress precursor alert.
 */
function stressAlert(indicators) {
  if (!indicators || indicators.length === 0) return null;
  
  const signals = indicators.join(', ');
  return `Picking up stress signals: ${signals}. Not saying you're stressed — just that this pattern has preceded rough patches before. Worth checking in with yourself.`;
}

/**
 * Batch multiple alerts into one message.
 * Tom doesn't want 5 separate pings. One message, conversational.
 */
function batchAlerts(alerts) {
  const valid = alerts.filter(a => a !== null && a !== undefined);
  
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  
  const intro = valid.length <= 3 
    ? "Few things I'm noticing:"
    : `Got ${valid.length} things on the radar:`;
  
  const body = valid.map((a, i) => `${i + 1}. ${a}`).join('\n\n');
  
  return `${intro}\n\n${body}`;
}

/**
 * Master alert generator — takes any detection result
 * and produces the right alert type.
 */
function generateAlert(type, data) {
  switch (type) {
    case 'drift': return driftAlert(data);
    case 'mode': return modeAlert(data, data?.currentTask);
    case 'energy': return energyAlert(data);
    case 'relationship': return relationshipAlert(data?.person, data?.daysSince, data?.threshold);
    case 'decisions': return decisionAlert(data?.count, data?.timeframe);
    case 'commitment': return commitmentAlert(data?.subtype, data);
    case 'stress': return stressAlert(data?.indicators);
    default: return null;
  }
}

module.exports = {
  generateAlert,
  driftAlert,
  modeAlert,
  energyAlert,
  relationshipAlert,
  decisionAlert,
  commitmentAlert,
  stressAlert,
  batchAlerts
};

// CLI entry point
if (require.main === module) {
  // Demo with sample data
  const sample = generateAlert('drift', {
    hasDrift: true,
    driftScore: 5,
    driftPercent: 42,
    indicators: [{ message: 'Warmth dropped: 3/10 vs 8.5/10 baseline' }],
    recommendation: 'RE_READ_SOUL'
  });
  console.log(sample || 'No alert generated');
}
