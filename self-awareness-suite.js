/**
 * Self-Awareness Suite - Master Integration
 * 
 * Coordinates all 16 monitoring apps into unified alerts
 */

const energyPredictor = require('./energy-predictor.js');
const loopHunter = require('./loop-hunter.js');
const decisionFatigue = require('./decision-fatigue.js');
const relationshipRadar = require('./relationship-radar.js');
const stressPrecursor = require('./stress-precursor.js');
const driftDetection = require('./drift-detection.js');
const timeCalibration = require('./time-calibration.js');
const commitmentTracker = require('./commitment-tracker.js');
const recoveryTracker = require('./recovery-tracker.js');
const decisionTracker = require('./decision-tracker.js');
const learningTracker = require('./learning-tracker.js');
const valueAlignment = require('./value-alignment.js');
const partnershipHealth = require('./partnership-health.js');
const cognitiveMode = require('./cognitive-mode.js');
const { analyzeSemanticTriggers } = require('./semantic-triggers.js');
const { recommendTools, formatRecommendations } = require('./recommendation-engine.js');
const { generateAlert } = require('./alert-generator.js');

const CONFIG = {
  // User-specific settings
  userName: process.env.USER_NAME || "Elliott",
  agentName: process.env.AGENT_NAME || "Fern",
  groupId: process.env.MEMORY_GROUP || "elliott-fern-dm",
  
  // Alert frequency caps
  maxAlertsPerHour: 3,
  maxAlertsPerDay: 8,
  
  // Quiet hours
  quietStart: 23, // 11pm
  quietEnd: 8,    // 8am
  
  // Sensitivity
  energyThreshold: 0.7,
  stressThreshold: 0.6,
  loopDaysThreshold: 7
};

/**
 * Initialize the self-awareness suite
 */
async function initializeSuite() {
  console.log(`🧠 Self-Awareness Suite initialized for ${CONFIG.userName} + ${CONFIG.agentName}`);
  console.log(`   Group: ${CONFIG.groupId}`);
  console.log(`   Apps: 16 monitoring tools active`);
  return { status: "active", apps: 16 };
}

/**
 * Process incoming message and generate appropriate alerts
 */
async function processMessage(message, conversationHistory = []) {
  const alerts = [];
  const now = new Date();
  const hour = now.getHours();
  
  // Skip quiet hours
  if (hour >= CONFIG.quietStart || hour < CONFIG.quietEnd) {
    return { alerts: [], reason: "quiet_hours" };
  }
  
  // 1. Semantic trigger detection
  const triggers = analyzeSemanticTriggers(message, conversationHistory);
  
  // 2. Tool recommendations
  const recommendations = await recommendTools(message, conversationHistory);
  
  // 3. Check each app based on triggers
  for (const trigger of triggers) {
    switch (trigger.pattern) {
      case "exhaustion":
      case "post_meeting":
      case "high_workload":
        const energyCheck = await energyPredictor.predictEnergyCrash(4);
        if (energyCheck.alert) {
          alerts.push(generateAlert("energy", "pre_crash", energyCheck, { tone: "gentle" }));
        }
        break;
        
      case "decision_paralysis":
      case "frustration":
        const decisionCheck = await decisionFatigue.assessFatigue(conversationHistory.length);
        if (decisionCheck.alert) {
          alerts.push(generateAlert("decision_fatigue", "high_load", decisionCheck));
        }
        break;
        
      case "deflection":
      case "suppression":
        const stressCheck = await stressPrecursor.checkPrecursors(CONFIG.groupId);
        if (stressCheck.alert) {
          alerts.push(generateAlert("stress", "early_warning", stressCheck));
        }
        break;
        
      case "procrastination_signal":
        const loopCheck = await loopHunter.detectNewLoop(message, { person: CONFIG.userName });
        if (loopCheck) {
          alerts.push(generateAlert("loops", "new_detected", { topic: loopCheck.topic }));
        }
        break;
    }
  }
  
  // 4. Check cognitive mode mismatch
  const mode = cognitiveMode.analyzeCognitiveMode(message, conversationHistory);
  // If user is in creative mode but task needs executive, suggest transition
  
  // 5. Periodic checks (every 10 messages)
  if (conversationHistory.length % 10 === 0) {
    // Check for stale loops
    const staleLoops = await loopHunter.findStaleLoops(CONFIG.loopDaysThreshold);
    if (staleLoops.length > 0) {
      alerts.push(await loopHunter.generateLoopAlert(staleLoops));
    }
    
    // Check commitments
    const upcoming = await commitmentTracker.findUpcomingCommitments(3);
    const dueSoon = upcoming.filter(c => c.days_until <= 1);
    if (dueSoon.length > 0) {
      alerts.push(generateAlert("commitments", "due_soon", { count: dueSoon.length }));
    }
  }
  
  // Deduplicate and limit
  const uniqueAlerts = [...new Set(alerts)].slice(0, CONFIG.maxAlertsPerHour);
  
  return {
    alerts: uniqueAlerts,
    triggers: triggers.length,
    recommendations: recommendations.slice(0, 2),
    mode: mode.mode
  };
}

/**
 * Generate morning digest
 */
async function generateMorningDigest() {
  const sections = [];
  
  // Energy forecast
  const forecast = await energyPredictor.generateEnergyForecast([]);
  if (forecast.risk_level !== "low") {
    sections.push(`⚡ Energy: ${forecast.risk_level} risk today`);
  }
  
  // Stale loops
  const loops = await loopHunter.findStaleLoops(7);
  if (loops.length > 0) {
    sections.push(`🔄 ${loops.length} open loops need attention`);
  }
  
  // Upcoming commitments
  const commitments = await commitmentTracker.findUpcomingCommitments(3);
  if (commitments.length > 0) {
    sections.push(`📅 ${commitments.length} commitments due soon`);
  }
  
  // Value alignment check
  const alignment = await valueAlignment.checkValueAlignment();
  if (alignment.misalignments.length > 0) {
    sections.push(`⚖️ Priority check: ${alignment.summary}`);
  }
  
  return {
    title: `Good morning, ${CONFIG.userName}`,
    sections: sections,
    total_alerts: sections.length
  };
}

/**
 * Learn from user feedback
 */
async function learnFromFeedback(alertType, wasHelpful, userResponse) {
  // Adjust sensitivity based on feedback
  if (!wasHelpful) {
    console.log(`[LEARN] ${alertType} alert was not helpful - reducing frequency`);
    // Implementation: store feedback, adjust thresholds
  }
}

module.exports = {
  initializeSuite,
  processMessage,
  generateMorningDigest,
  learnFromFeedback,
  CONFIG
};
