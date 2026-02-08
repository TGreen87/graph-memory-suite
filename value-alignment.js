/**
 * Value Alignment Monitor
 * 
 * Compares time spent vs stated priorities
 */

const { add_memory, search } = require('./graphiti-memory.js');

const GROUP_ID = "tom-kit-values";

// Tom's stated priorities (editable)
const STATED_PRIORITIES = [
  { name: "Family (Bel, Jack)", rank: 1, ideal_allocation: 30 },
  { name: "Business/GAIA", rank: 2, ideal_allocation: 25 },
  { name: "Health/Wellbeing", rank: 3, ideal_allocation: 15 },
  { name: "GRV Work", rank: 4, ideal_allocation: 20 },
  { name: "Personal Growth", rank: 5, ideal_allocation: 10 }
];

/**
 * Log time allocation
 */
async function logTimeAllocation(category, minutes, activity) {
  await add_memory({
    group_id: GROUP_ID,
    messages: [{
      role_type: "system",
      role: "ValueTracker",
      content: `[TIME] Category: ${category} | Duration: ${minutes}min | Activity: ${activity} | Date: ${new Date().toISOString()}`,
      timestamp: new Date().toISOString()
    }]
  });
}

/**
 * Calculate actual time allocation
 */
async function calculateAllocation(daysBack = 7) {
  const timeLogs = await search({
    query: "time category duration activity",
    group_ids: [GROUP_ID],
    max_facts: 100
  });
  
  const allocation = {};
  let totalMinutes = 0;
  
  for (const fact of timeLogs.facts || []) {
    const category = extractCategory(fact.fact);
    const minutes = extractMinutes(fact.fact);
    
    if (category && minutes) {
      allocation[category] = (allocation[category] || 0) + minutes;
      totalMinutes += minutes;
    }
  }
  
  // Convert to percentages
  const percentages = {};
  for (const [category, minutes] of Object.entries(allocation)) {
    percentages[category] = totalMinutes > 0 ? 
      ((minutes / totalMinutes) * 100).toFixed(1) : 0;
  }
  
  return {
    total_tracked_hours: (totalMinutes / 60).toFixed(1),
    allocation_minutes: allocation,
    allocation_percent: percentages,
    days_analyzed: daysBack
  };
}

/**
 * Check alignment with stated priorities
 */
async function checkValueAlignment() {
  const actual = await calculateAllocation(7);
  const misalignments = [];
  
  for (const priority of STATED_PRIORITIES) {
    const actualPct = parseFloat(actual.allocation_percent[priority.name]) || 0;
    const idealPct = priority.ideal_allocation;
    const variance = actualPct - idealPct;
    
    if (Math.abs(variance) > 10) { // More than 10% off
      misalignments.push({
        priority: priority.name,
        rank: priority.rank,
        ideal: idealPct,
        actual: actualPct,
        variance: variance.toFixed(1),
        status: variance < 0 ? "under_allocated" : "over_allocated"
      });
    }
  }
  
  return {
    alignment_score: calculateAlignmentScore(misalignments),
    misalignments: misalignments.sort((a, b) => 
      Math.abs(parseFloat(b.variance)) - Math.abs(parseFloat(a.variance))
    ),
    summary: generateSummary(misalignments)
  };
}

/**
 * Detect activity category from message
 */
function detectCategory(message) {
  const categories = {
    "Family (Bel, Jack)": ["bel", "jack", "family", "home", "kids", "son"],
    "Business/GAIA": ["gaia", "elliott", "business", "client", "venture", "startup"],
    "Health/Wellbeing": ["gym", "exercise", "meditation", "walk", "sleep", "doctor"],
    "GRV Work": ["grv", "work", "meeting", "colleague", "office", "hr"],
    "Personal Growth": ["learning", "reading", "course", "study", "practice"]
  };
  
  const lower = message.toLowerCase();
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }
  
  return "Uncategorized";
}

/**
 * Generate weekly alignment report
 */
async function generateAlignmentReport() {
  const alignment = await checkValueAlignment();
  const actual = await calculateAllocation(7);
  
  const report = {
    alignment_score: alignment.alignment_score,
    biggest_gap: alignment.misalignments[0] || null,
    time_breakdown: actual.allocation_percent,
    insight: alignment.summary,
    suggestion: generateSuggestion(alignment.misalignments)
  };
  
  return report;
}

// Helpers
function extractCategory(factText) {
  const match = factText.match(/Category:\s*(.+?)\s*\|/);
  return match ? match[1].trim() : null;
}

function extractMinutes(factText) {
  const match = factText.match(/Duration:\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function calculateAlignmentScore(misalignments) {
  if (misalignments.length === 0) return 100;
  
  const totalVariance = misalignments.reduce((sum, m) => 
    sum + Math.abs(parseFloat(m.variance)), 0
  );
  
  return Math.max(0, 100 - (totalVariance / misalignments.length));
}

function generateSummary(misalignments) {
  if (misalignments.length === 0) {
    return "Time allocation aligns well with stated priorities";
  }
  
  const under = misalignments.filter(m => m.status === "under_allocated");
  const over = misalignments.filter(m => m.status === "over_allocated");
  
  if (under.length > 0 && under[0].rank <= 2) {
    return `Top priority "${under[0].priority}" is under-allocated by ${Math.abs(under[0].variance)}%`;
  }
  
  if (over.length > 0) {
    return `"${over[0].priority}" taking ${over[0].variance}% more time than intended`;
  }
  
  return `${misalignments.length} priorities misaligned from ideal allocation`;
}

function generateSuggestion(misalignments) {
  const critical = misalignments.find(m => m.rank <= 2 && m.status === "under_allocated");
  
  if (critical) {
    return `Consider blocking time for "${critical.priority}" - stated as #${critical.rank} priority but receiving ${critical.actual}% vs ${critical.ideal}% target`;
  }
  
  return "Review time allocation - some priorities need rebalancing";
}

module.exports = {
  logTimeAllocation,
  calculateAllocation,
  checkValueAlignment,
  detectCategory,
  generateAlignmentReport,
  STATED_PRIORITIES,
  GROUP_ID
};
