"""Cost calculation utilities for tracking API usage costs."""

from typing import Dict, Any, List, Optional


def calculate_message_cost(
    usage: Dict[str, Any],
    model: str,
    model_pricing: Dict[str, Dict[str, Any]]
) -> float:
    """
    Calculate the cost of a single API call based on usage and model pricing.
    
    Args:
        usage: Usage dict with 'prompt_tokens' and 'completion_tokens'
        model: Model identifier
        model_pricing: Dict mapping model IDs to pricing info with 'prompt' and 'completion' prices per MTok
    
    Returns:
        Cost in USD
    """
    pricing = model_pricing.get(model, {})
    prompt_price = pricing.get('prompt')
    completion_price = pricing.get('completion')
    
    if not prompt_price or not completion_price:
        return 0.0
    
    # Convert prices from per MTok to per token
    prompt_tokens = usage.get('prompt_tokens', 0)
    completion_tokens = usage.get('completion_tokens', 0)
    
    # Prices are typically in format like "$0.5" or "0.5" per MTok (million tokens)
    def parse_price(price_str: Any) -> float:
        if price_str is None:
            return 0.0
        if isinstance(price_str, (int, float)):
            return float(price_str)
        if isinstance(price_str, str):
            # Remove $ and whitespace
            cleaned = price_str.strip().replace('$', '').replace(',', '')
            try:
                return float(cleaned)
            except ValueError:
                return 0.0
        return 0.0
    
    prompt_price_per_mtok = parse_price(prompt_price)
    completion_price_per_mtok = parse_price(completion_price)
    
    # Calculate cost: (tokens / 1,000,000) * price_per_mtok
    prompt_cost = (prompt_tokens / 1_000_000) * prompt_price_per_mtok
    completion_cost = (completion_tokens / 1_000_000) * completion_price_per_mtok
    
    return prompt_cost + completion_cost


def calculate_stage1_costs(
    stage1_results: List[Dict[str, Any]],
    model_pricing: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate total costs for Stage 1 (council responses).
    
    Returns:
        Dict with 'total_cost', 'per_model_costs', and 'total_tokens'
    """
    total_cost = 0.0
    per_model_costs = {}
    total_tokens = {'prompt': 0, 'completion': 0, 'total': 0}
    
    for result in stage1_results:
        model = result.get('model', 'unknown')
        usage = result.get('usage', {})
        
        if usage:
            cost = calculate_message_cost(usage, model, model_pricing)
            total_cost += cost
            
            if model not in per_model_costs:
                per_model_costs[model] = {'cost': 0.0, 'tokens': {'prompt': 0, 'completion': 0, 'total': 0}}
            
            per_model_costs[model]['cost'] += cost
            per_model_costs[model]['tokens']['prompt'] += usage.get('prompt_tokens', 0)
            per_model_costs[model]['tokens']['completion'] += usage.get('completion_tokens', 0)
            per_model_costs[model]['tokens']['total'] += usage.get('total_tokens', 0)
            
            total_tokens['prompt'] += usage.get('prompt_tokens', 0)
            total_tokens['completion'] += usage.get('completion_tokens', 0)
            total_tokens['total'] += usage.get('total_tokens', 0)
    
    return {
        'total_cost': total_cost,
        'per_model_costs': per_model_costs,
        'total_tokens': total_tokens
    }


def calculate_stage2_costs(
    stage2_results: List[Dict[str, Any]],
    model_pricing: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """Calculate total costs for Stage 2 (rankings)."""
    return calculate_stage1_costs(stage2_results, model_pricing)


def calculate_stage3_costs(
    stage3_result: Dict[str, Any],
    model_pricing: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate costs for Stage 3 (final synthesis).
    
    Returns:
        Dict with 'cost', 'tokens', and 'model'
    """
    model = stage3_result.get('model', 'unknown')
    usage = stage3_result.get('usage', {})
    
    cost = calculate_message_cost(usage, model, model_pricing) if usage else 0.0
    
    return {
        'cost': cost,
        'tokens': {
            'prompt': usage.get('prompt_tokens', 0),
            'completion': usage.get('completion_tokens', 0),
            'total': usage.get('total_tokens', 0)
        },
        'model': model
    }


def calculate_total_conversation_cost(
    analyses: List[Dict[str, Any]],
    model_pricing: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate total cost for an entire conversation.
    
    Args:
        analyses: List of analysis entries from conversation
        model_pricing: Dict mapping model IDs to pricing info
    
    Returns:
        Dict with 'total_cost', 'per_message_costs', 'per_stage_costs', and 'total_tokens'
    """
    total_cost = 0.0
    per_message_costs = []
    total_tokens = {'prompt': 0, 'completion': 0, 'total': 0}
    
    for analysis in analyses:
        message_cost = 0.0
        message_tokens = {'prompt': 0, 'completion': 0, 'total': 0}
        
        # Stage 1 costs
        stage1 = analysis.get('stage1', [])
        stage1_costs = calculate_stage1_costs(stage1, model_pricing)
        message_cost += stage1_costs['total_cost']
        message_tokens['prompt'] += stage1_costs['total_tokens']['prompt']
        message_tokens['completion'] += stage1_costs['total_tokens']['completion']
        message_tokens['total'] += stage1_costs['total_tokens']['total']
        
        # Stage 2 costs
        stage2 = analysis.get('stage2', [])
        stage2_costs = calculate_stage2_costs(stage2, model_pricing)
        message_cost += stage2_costs['total_cost']
        message_tokens['prompt'] += stage2_costs['total_tokens']['prompt']
        message_tokens['completion'] += stage2_costs['total_tokens']['completion']
        message_tokens['total'] += stage2_costs['total_tokens']['total']
        
        # Stage 3 costs
        stage3 = analysis.get('stage3', {})
        stage3_costs = calculate_stage3_costs(stage3, model_pricing)
        message_cost += stage3_costs['cost']
        message_tokens['prompt'] += stage3_costs['tokens']['prompt']
        message_tokens['completion'] += stage3_costs['tokens']['completion']
        message_tokens['total'] += stage3_costs['tokens']['total']
        
        per_message_costs.append({
            'cost': message_cost,
            'tokens': message_tokens,
            'created_at': analysis.get('created_at')
        })
        
        total_cost += message_cost
        total_tokens['prompt'] += message_tokens['prompt']
        total_tokens['completion'] += message_tokens['completion']
        total_tokens['total'] += message_tokens['total']
    
    return {
        'total_cost': total_cost,
        'per_message_costs': per_message_costs,
        'total_tokens': total_tokens,
        'message_count': len(per_message_costs)
    }

