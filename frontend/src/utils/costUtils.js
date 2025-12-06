/**
 * Utility functions for formatting and displaying costs.
 */

export function formatCost(cost) {
  if (cost === null || cost === undefined || cost === 0) {
    return '$0.00';
  }
  if (cost < 0.0001) {
    return '<$0.0001';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  return `$${cost.toFixed(4)}`;
}

export function formatTokens(tokens) {
  if (!tokens || tokens === 0) {
    return '0';
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

export function calculateModelCost(usage, modelPricing, modelId) {
  if (!usage || !modelPricing || !modelId) {
    return { cost: 0, tokens: { prompt: 0, completion: 0, total: 0 } };
  }
  
  const pricing = modelPricing[modelId] || {};
  const promptPrice = parsePrice(pricing.prompt);
  const completionPrice = parsePrice(pricing.completion);
  
  if (!promptPrice || !completionPrice) {
    return { 
      cost: 0, 
      tokens: {
        prompt: usage.prompt_tokens || 0,
        completion: usage.completion_tokens || 0,
        total: usage.total_tokens || 0
      }
    };
  }
  
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  
  const promptCost = (promptTokens / 1_000_000) * promptPrice;
  const completionCost = (completionTokens / 1_000_000) * completionPrice;
  const totalCost = promptCost + completionCost;
  
  return {
    cost: totalCost,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: usage.total_tokens || 0
    }
  };
}

function parsePrice(priceStr) {
  if (priceStr === null || priceStr === undefined) {
    return null;
  }
  if (typeof priceStr === 'number') {
    return priceStr;
  }
  if (typeof priceStr === 'string') {
    const cleaned = priceStr.trim().replace('$', '').replace(',', '');
    try {
      return parseFloat(cleaned);
    } catch {
      return null;
    }
  }
  return null;
}

