/**
 * Proactive Graph Insight Generator
 * 
 * Queries Graphiti to find non-obvious patterns and connections
 * that complement ADHD associative thinking.
 */

const GRAPHITI_URL = process.env.GRAPHITI_URL || "http://localhost:18000";

/**
 * Find recurring themes in conversations
 */
async function findRecurringThemes(groupId, daysBack = 30) {
  const response = await fetch(`${GRAPHITI_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "What topics or concepts appear most frequently in recent conversations?",
      group_ids: [groupId],
      max_facts: 20
    })
  });
  return await response.json();
}

/**
 * Find emotional patterns
 */
async function findEmotionalPatterns(groupId) {
  const emotions = ["stress", "excited", "overwhelmed", "frustrated", "hopeful", "tired"];
  const patterns = [];
  
  for (const emotion of emotions) {
    const response = await fetch(`${GRAPHITI_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `When does Tom feel ${emotion}?`,
        group_ids: [groupId],
        max_facts: 5
      })
    });
    const result = await response.json();
    if (result.facts?.length > 2) {
      patterns.push({ emotion, count: result.facts.length, facts: result.facts });
    }
  }
  
  return patterns;
}

/**
 * Find cross-domain connections
 */
async function findCrossDomainConnections(groupId) {
  const domains = ["work", "family", "health", "projects", "stress"];
  const connections = [];
  
  for (const domain of domains) {
    const response = await fetch(`${GRAPHITI_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `What ${domain} topics connect to other areas of Tom's life?`,
        group_ids: [groupId],
        max_facts: 5
      })
    });
    const result = await response.json();
    if (result.facts?.length > 0) {
      connections.push({ domain, facts: result.facts });
    }
  }
  
  return connections;
}

/**
 * Generate weekly insight digest
 */
async function generateWeeklyInsights() {
  const groupId = "tom-kit-dm";
  
  // Collect data
  const [themes, emotions, connections] = await Promise.all([
    findRecurringThemes(groupId),
    findEmotionalPatterns(groupId),
    findCrossDomainConnections(groupId)
  ]);
  
  // Build insight report
  const insights = [];
  
  // High-frequency themes
  if (themes.facts?.length > 5) {
    const topThemes = themes.facts.slice(0, 3).map(f => f.fact);
    insights.push({
      type: "recurring",
      priority: "medium",
      message: `📊 Recurring topics this week:\n${topThemes.join("\n")}`
    });
  }
  
  // Emotional patterns
  if (emotions.length > 0) {
    const topEmotion = emotions.sort((a, b) => b.count - a.count)[0];
    if (topEmotion.count >= 3) {
      insights.push({
        type: "emotional",
        priority: "high",
        message: `🎭 Pattern noticed: "${topEmotion.emotion}" appeared ${topEmotion.count} times recently`
      });
    }
  }
  
  // Cross-domain connections
  const strongConnections = connections.filter(c => c.facts.length >= 3);
  if (strongConnections.length > 0) {
    insights.push({
      type: "connection",
      priority: "medium",
      message: `🔗 ${strongConnections.length} areas showing strong interconnection in recent conversations`
    });
  }
  
  return insights.filter(i => i.priority === "high" || insights.length <= 3);
}

/**
 * Check for immediate insight opportunity
 */
async function checkForInsight(currentMessage, recentContext) {
  const groupId = "tom-kit-dm";
  
  // Search for related past topics
  const response = await fetch(`${GRAPHITI_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: currentMessage.slice(0, 100),
      group_ids: [groupId],
      max_facts: 3
    })
  });
  
  const result = await response.json();
  
  // If we found related facts from >7 days ago, surface connection
  if (result.facts?.length > 0) {
    const oldFacts = result.facts.filter(f => {
      const daysSince = (Date.now() - new Date(f.created_at)) / (1000 * 60 * 60 * 24);
      return daysSince > 7;
    });
    
    if (oldFacts.length > 0) {
      return {
        hasInsight: true,
        type: "connection",
        message: `💡 This connects to something we discussed ${Math.round((Date.now() - new Date(oldFacts[0].created_at)) / (1000 * 60 * 60 * 24))} days ago: "${oldFacts[0].fact.slice(0, 100)}..."`,
        fullFact: oldFacts[0]
      };
    }
  }
  
  return { hasInsight: false };
}

module.exports = {
  generateWeeklyInsights,
  checkForInsight,
  findRecurringThemes,
  findEmotionalPatterns,
  findCrossDomainConnections
};
