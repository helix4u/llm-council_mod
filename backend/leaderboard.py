"""Leaderboard tracking for model and persona performance."""

import json
import os
from typing import List, Dict, Any, Optional
from pathlib import Path
from collections import defaultdict
from .config import DATA_DIR


LEADERBOARD_FILE = "leaderboard.json"


def get_leaderboard_path() -> str:
    """Get the file path for leaderboard storage."""
    return os.path.join(DATA_DIR, LEADERBOARD_FILE)


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def load_leaderboard() -> Dict[str, Any]:
    """
    Load leaderboard data from storage.
    
    Returns:
        Dict with structure: {
            "entries": {
                "model_id|persona_name": {
                    "model": "model_id",
                    "persona": "persona_name" or None,
                    "participations": 0,
                    "total_rank_sum": 0.0,
                    "wins": 0,
                    "total_votes": 0,
                    "last_updated": "iso_timestamp"
                }
            }
        }
    """
    ensure_data_dir()
    path = get_leaderboard_path()
    
    if not os.path.exists(path):
        return {"entries": {}}
    
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {"entries": {}}


def save_leaderboard(data: Dict[str, Any]):
    """Save leaderboard data to storage."""
    ensure_data_dir()
    path = get_leaderboard_path()
    
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def get_entry_key(model: str, persona: Optional[str] = None) -> str:
    """Generate a unique key for a model+persona combination."""
    persona_str = persona or "None"
    return f"{model}|{persona_str}"


def update_leaderboard_from_aggregate_rankings(
    stage1_results: List[Dict[str, Any]],
    aggregate_rankings: List[Dict[str, Any]],
    persona_map: Optional[Dict[str, str]] = None
):
    """
    Update leaderboard based on Stage 1 results and aggregate rankings.
    
    Args:
        stage1_results: List of Stage 1 responses with 'model' key
        aggregate_rankings: List of aggregate rankings with 'model', 'average_rank', 'rankings_count'
        persona_map: Optional mapping of model IDs to system prompts (persona system prompts)
    """
    from datetime import datetime
    
    leaderboard = load_leaderboard()
    entries = leaderboard.setdefault("entries", {})
    
    # Create a mapping: model_id -> persona_name
    # We need to look up personas by their system_prompt since persona_map uses system_prompts
    model_to_persona_name = {}
    if persona_map:
        # Try to load personas to map system_prompts to names
        try:
            from .storage import list_personas
            personas = list_personas()
            prompt_to_name = {p["system_prompt"]: p["name"] for p in personas}
            
            # Build model -> persona_name mapping
            for model_id, system_prompt in persona_map.items():
                persona_name = prompt_to_name.get(system_prompt)
                if persona_name:
                    model_to_persona_name[model_id] = persona_name
                    # Also add mapping for base model name (without prefix)
                    model_base = model_id.split('/')[-1].split(':')[0]
                    if model_base != model_id:
                        model_to_persona_name[model_base] = persona_name
        except Exception:
            # If we can't load personas, just use None
            pass
    
    # Track which models participated (from Stage 1)
    participating_models = {result['model'] for result in stage1_results}
    
    # Create a mapping of model -> rank from aggregate_rankings
    model_rank_map = {}
    for idx, ranking in enumerate(aggregate_rankings, start=1):
        model = ranking.get('model')
        if model:
            model_rank_map[model] = {
                'rank': idx,  # Position in ranking (1 = best)
                'average_rank': ranking.get('average_rank', idx),
                'votes': ranking.get('rankings_count', 0)
            }
    
    # Update entries for each model that participated
    timestamp = datetime.utcnow().isoformat()
    
    for model in participating_models:
        # Determine persona name for this model
        persona_name = None
        if model_to_persona_name:
            # Try exact match first
            persona_name = model_to_persona_name.get(model)
            if not persona_name:
                # Try matching by base model name
                model_base = model.split('/')[-1].split(':')[0]
                persona_name = model_to_persona_name.get(model_base)
        
        entry_key = get_entry_key(model, persona_name)
        
        if entry_key not in entries:
            entries[entry_key] = {
                "model": model,
                "persona": persona_name,
                "participations": 0,
                "total_rank_sum": 0.0,
                "wins": 0,
                "total_votes": 0,
                "last_updated": timestamp
            }
        
        entry = entries[entry_key]
        
        # Update participation count
        entry["participations"] += 1
        
        # Update ranking stats if this model was ranked
        if model in model_rank_map:
            rank_data = model_rank_map[model]
            entry["total_rank_sum"] += rank_data['average_rank']
            entry["total_votes"] += rank_data['votes']
            
            # Check if this was a win (rank #1)
            if rank_data['rank'] == 1:
                entry["wins"] += 1
        
        entry["last_updated"] = timestamp
    
    save_leaderboard(leaderboard)


def get_leaderboard_stats(
    filter_model: Optional[str] = None,
    filter_persona: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get leaderboard statistics, optionally filtered.
    
    Args:
        filter_model: Optional model ID to filter by
        filter_persona: Optional persona name to filter by
    
    Returns:
        List of leaderboard entries sorted by average rank (best first)
    """
    leaderboard = load_leaderboard()
    entries = leaderboard.get("entries", {})
    
    results = []
    
    for entry_key, entry_data in entries.items():
        model = entry_data.get("model", "")
        persona = entry_data.get("persona")
        
        # Apply filters
        if filter_model and model != filter_model:
            continue
        if filter_persona is not None:
            if filter_persona == "None" and persona is not None:
                continue
            if filter_persona != "None" and persona != filter_persona:
                continue
        
        participations = entry_data.get("participations", 0)
        total_rank_sum = entry_data.get("total_rank_sum", 0.0)
        wins = entry_data.get("wins", 0)
        total_votes = entry_data.get("total_votes", 0)
        
        # Calculate average rank (lower is better)
        # If no rankings yet, use a high number to sort to bottom
        if participations > 0 and total_rank_sum > 0:
            avg_rank = total_rank_sum / participations
        else:
            avg_rank = 999.0  # High number for unranked entries
        
        # Calculate win rate
        win_rate = (wins / participations * 100) if participations > 0 else 0.0
        
        results.append({
            "model": model,
            "persona": persona,
            "participations": participations,
            "average_rank": round(avg_rank, 2),
            "wins": wins,
            "win_rate": round(win_rate, 1),
            "total_votes": total_votes,
            "last_updated": entry_data.get("last_updated", "")
        })
    
    # Sort by average rank (lower is better), then by participations (more is better)
    results.sort(key=lambda x: (x["average_rank"], -x["participations"]))
    
    return results

