/**
 * Relationship Radar
 * 
 * Monitors and maintains important connections
 * Prevents relationship drift through proactive alerts
 */

const { search, add_memory } = require('./graphiti-memory.js');
const { generateAlert } = require('./alert-generator.js');

const GROUP_ID = "tom-kit-relationships";

// Key relationships to track
const KEY_RELATIONSHIPS = [
  { name: "Elliott", type: "business_partner", drift_threshold_days: 14 },
  { name: "Bel", type: "family", drift_threshold_days: 1 }, // Daily for spouse
  { name: "Jack", type: "family", drift_threshold_days: 1 },
  { name: "Rory", type: "colleague", drift_threshold_days: 21 },
  // Add more as identified
];

/**
 * Log a contact with someone
 */
async function logContact(person, contact) {
  const { type, quality, context, timestamp = new Date().toISOString() } = contact;
  
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "RelationshipTracker",
      content: `[CONTACT] ${person} | Type: ${type} | Quality: ${quality}/10 | ${context.slice(0, 50)}`,
      timestamp
    }]
  });
}

/**
 * Check relationship status for all key people
 */
async function checkRelationshipHealth() {
  const statuses = [];
  
  for (const person of KEY_RELATIONSHIPS) {
    const status = await getRelationshipStatus(person);
    statuses.push(status);
  }
  
  return statuses.sort((a, b) => b.days_since_contact - a.days_since_contact);
}

/**
 * Get status for specific relationship
 */
async function getRelationshipStatus(personConfig) {
  const { name, type, drift_threshold_days } = personConfig;
  
  // Search for last contact
  const contacts = await search({
    query: `contact with ${name} talked to ${name}`,
    group_ids: [GROUP_ID, "tom-kit-dm"],
    max_facts: 5
  });
  
  let daysSince = Infinity;
  let lastContact = null;
  
  if (contacts.facts && contacts.facts.length > 0) {
    lastContact = contacts.facts[0];
    daysSince = (Date.now() - new Date(lastContact.created_at)) / (1000 * 60 * 60 * 24);
  }
  
  const riskRatio = daysSince / drift_threshold_days;
  
  return {
    name,
    type,
    days_since_contact: Math.round(daysSince),
    drift_threshold: drift_threshold_days,
    risk_ratio: riskRatio,
    status: riskRatio > 1 ? "drift_risk" : riskRatio > 0.7 ? "watch" : "healthy",
    last_contact_context: lastContact?.fact?.slice(0, 100) || "No record found"
  };
}

/**
 * Generate relationship maintenance alerts
 */
async function generateRelationshipAlerts() {
  const statuses = await checkRelationshipHealth();
  const alerts = [];
  
  for (const status of statuses) {
    if (status.status === "drift_risk") {
      alerts.push({
        priority: "high",
        person: status.name,
        days: status.days_since_contact,
        message: `${status.days_since_contact} days since meaningful contact with ${status.name}. Drift threshold: ${status.drift_threshold}.`,
        suggestion: suggestReconnect(status)
      });
    } else if (status.status === "watch") {
      alerts.push({
        priority: "medium",
        person: status.name,
        days: status.days_since_contact,
        message: `${status.name} connection cooling (${status.days_since_contact}/${status.drift_threshold} days).`,
        suggestion: `Soft check-in recommended in next few days`
      });
    }
  }
  
  return alerts;
}

/**
 * Suggest reconnection method
 */
function suggestReconnect(status) {
  const suggestions = {
    business_partner: [
      "Quick voice note on current project?",
      "15-min sync call this week?",
      "Share something relevant you saw?"
    ],
    family: [
      "Just checking in - how are you?",
      "Quick call on the way home?",
      "Plan something for this weekend?"
    ],
    colleague: [
      "Drop a quick Slack message?",
      "Grab coffee next week?",
      "Loop them in on something relevant?"
    ]
  };
  
  const typeSuggestions = suggestions[status.type] || suggestions.colleague;
  return typeSuggestions[Math.floor(Math.random() * typeSuggestions.length)];
}

/**
 * Check if message mentions someone we should track
 */
async function checkMentionedPerson(message) {
  for (const person of KEY_RELATIONSHIPS) {
    if (message.toLowerCase().includes(person.name.toLowerCase())) {
      const status = await getRelationshipStatus(person);
      
      if (status.status !== "healthy") {
        return {
          mentioned: true,
          person: person.name,
          status: status.status,
          days_since: status.days_since_contact,
          suggestion: `You mentioned ${person.name} - ${status.days_since_contact} days since last contact. ${suggestReconnect(status)}`
        };
      }
    }
  }
  
  return { mentioned: false };
}

/**
 * Weekly relationship digest
 */
async function generateRelationshipDigest() {
  const statuses = await checkRelationshipHealth();
  
  const atRisk = statuses.filter(s => s.status === "drift_risk");
  const watching = statuses.filter(s => s.status === "watch");
  const healthy = statuses.filter(s => s.status === "healthy");
  
  return {
    summary: `${atRisk.length} at risk, ${watching.length} cooling, ${healthy.length} healthy`,
    at_risk: atRisk,
    watch: watching,
    healthy: healthy,
    action_items: atRisk.map(s => `${s.name}: ${suggestReconnect(s)}`)
  };
}

module.exports = {
  logContact,
  checkRelationshipHealth,
  getRelationshipStatus,
  generateRelationshipAlerts,
  checkMentionedPerson,
  generateRelationshipDigest,
  KEY_RELATIONSHIPS,
  GROUP_ID
};
