/**
 * External Commitment Tracker
 * 
 * Tracks promises made to others to prevent "oh shit I forgot"
 */

const { add_memory, search } = require('./graphiti-memory.js');

const GROUP_ID = "tom-kit-commitments";

/**
 * Detect commitment in conversation
 */
async function detectCommitment(message, context) {
  const patterns = [
    // Direct promises
    { regex: /I('ll| will| can| could) .+ (?:for you|to you|by|before)/i, type: "promise" },
    { regex: /(promise|commit) .+ (?:to|that|by)/i, type: "commitment" },
    { regex: /(send|give|show|review|look at) .+ (?:to|by|before)/i, type: "deliverable" },
    
    // Time-bound agreements
    { regex: /(?:by|before|no later than) .+ (?:Friday|Monday|tomorrow|next week|\d{1,2}(th|st|nd)?)/i, type: "time_bound" },
    
    // Follow-up commitments
    { regex: /(follow up|get back to|circle back) .+ (?:on|about|with)/i, type: "follow_up" },
    
    // Meeting/Call promises
    { regex: /(schedule|set up|book) .+ (?:meeting|call|chat) .+ (?:with|for)/i, type: "scheduling" }
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match) {
      const commitment = {
        what: extractWhat(message),
        to_whom: extractRecipient(context, message),
        by_when: extractDeadline(message),
        type: pattern.type,
        context: message,
        created_at: new Date().toISOString(),
        status: "open"
      };
      
      // Log to graph
      await add_memory({
        group_id: GROUP_ID,
        messages: [{
          role_type: "system",
          role: "CommitmentTracker",
          content: `[COMMITMENT] To: ${commitment.to_whom} | What: ${commitment.what} | By: ${commitment.by_when} | Type: ${commitment.type}`,
          timestamp: commitment.created_at
        }]
      });
      
      return { detected: true, commitment };
    }
  }
  
  return { detected: false };
}

/**
 * Find upcoming commitments
 */
async function findUpcomingCommitments(days = 7) {
  const all = await search({
    query: "commitment promise to deliver by deadline",
    group_ids: [GROUP_ID],
    max_facts: 20
  });
  
  const upcoming = [];
  const now = new Date();
  
  for (const fact of all.facts || []) {
    const deadline = extractDeadlineFromFact(fact.fact);
    if (deadline) {
      const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
      if (daysUntil >= 0 && daysUntil <= days) {
        upcoming.push({
          what: extractWhatFromFact(fact.fact),
          to_whom: extractRecipientFromFact(fact.fact),
          deadline: deadline,
          days_until: Math.ceil(daysUntil),
          urgency: daysUntil < 2 ? "high" : daysUntil < 5 ? "medium" : "low"
        });
      }
    }
  }
  
  return upcoming.sort((a, b) => a.days_until - b.days_until);
}

/**
 * Find overdue commitments
 */
async function findOverdueCommitments() {
  const all = await search({
    query: "commitment promise deadline",
    group_ids: [GROUP_ID],
    max_facts: 20
  });
  
  const overdue = [];
  const now = new Date();
  
  for (const fact of all.facts || []) {
    // Check if closed
    if (fact.fact.includes("[CLOSED]") || fact.fact.includes("[CANCELLED]")) {
      continue;
    }
    
    const deadline = extractDeadlineFromFact(fact.fact);
    if (deadline && deadline < now) {
      const daysOverdue = Math.floor((now - deadline) / (1000 * 60 * 60 * 24));
      overdue.push({
        what: extractWhatFromFact(fact.fact),
        to_whom: extractRecipientFromFact(fact.fact),
        days_overdue: daysOverdue,
        severity: daysOverdue > 7 ? "critical" : daysOverdue > 3 ? "high" : "medium"
      });
    }
  }
  
  return overdue.sort((a, b) => b.days_overdue - a.days_overdue);
}

/**
 * Close a commitment
 */
async function closeCommitment(what, how) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "CommitmentTracker",
      content: `[CLOSED] "${what}" | How: ${how} | Closed: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Cancel a commitment
 */
async function cancelCommitment(what, reason) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "CommitmentTracker",
      content: `[CANCELLED] "${what}" | Reason: ${reason} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Generate morning commitment digest
 */
async function generateCommitmentDigest() {
  const upcoming = await findUpcomingCommitments(7);
  const overdue = await findOverdueCommitments();
  
  if (upcoming.length === 0 && overdue.length === 0) {
    return null;
  }
  
  const sections = [];
  
  if (overdue.length > 0) {
    sections.push({
      type: "overdue",
      title: `⚠️ ${overdue.length} overdue commitment${overdue.length > 1 ? 's' : ''}`,
      items: overdue.slice(0, 3).map(o => 
        `${o.what} (to ${o.to_whom}, ${o.days_overdue} days late)`
      )
    });
  }
  
  if (upcoming.length > 0) {
    const urgent = upcoming.filter(u => u.urgency === "high");
    if (urgent.length > 0) {
      sections.push({
        type: "urgent",
        title: `📅 ${urgent.length} due soon`,
        items: urgent.map(u => 
          `${u.what} (to ${u.to_whom}, ${u.days_until === 0 ? 'today' : u.days_until === 1 ? 'tomorrow' : u.days_until + ' days'})`
        )
      });
    }
  }
  
  return sections;
}

// Helpers
function extractWhat(message) {
  const patterns = [
    /(?:send|give|show|review) (.+?) (?:to|by|before)/i,
    /(?:I['ll]|will|can) (.+?) (?:for|to)/i,
    /(?:follow up|get back) (?:on|about) (.+?)(?:$|\.|by)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1].trim().slice(0, 50);
  }
  
  return message.slice(0, 50);
}

function extractRecipient(context, message) {
  // Check context for recent mentions
  if (context?.recentMentions) {
    for (const person of ["Rory", "Elliott", "Bel", "Jack", "Mushu"]) {
      if (context.recentMentions.includes(person)) return person;
    }
  }
  
  // Check message
  const patterns = [
    /(?:to|for)\s+(\w+)(?:\s|$)/i,
    /(?:with)\s+(\w+)(?:\s|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1];
  }
  
  return "someone";
}

function extractDeadline(message) {
  const now = new Date();
  
  if (message.match(/tomorrow/i)) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  if (message.match(/next week/i)) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  if (message.match(/Friday/i)) {
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    return new Date(now.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
  }
  if (message.match(/Monday/i)) {
    const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
    return new Date(now.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000);
  }
  
  // Extract specific dates
  const dateMatch = message.match(/(\d{1,2})(?:th|st|nd)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (dateMatch) {
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(dateMatch[2]);
    return new Date(now.getFullYear(), month, parseInt(dateMatch[1]));
  }
  
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Default 1 week
}

function extractWhatFromFact(fact) {
  const match = fact.match(/What:\s*(.+?)\s*\|/);
  return match ? match[1] : "unknown";
}

function extractRecipientFromFact(fact) {
  const match = fact.match(/To:\s*(.+?)\s*\|/);
  return match ? match[1] : "someone";
}

function extractDeadlineFromFact(fact) {
  const match = fact.match(/By:\s*(.+?)(?:\s*\||$)/);
  if (match) {
    const date = new Date(match[1]);
    return isNaN(date) ? null : date;
  }
  return null;
}

module.exports = {
  detectCommitment,
  findUpcomingCommitments,
  findOverdueCommitments,
  closeCommitment,
  cancelCommitment,
  generateCommitmentDigest,
  GROUP_ID
};
