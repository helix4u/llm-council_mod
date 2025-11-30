"""JSON-based storage for conversations."""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from copy import deepcopy
from .config import DATA_DIR, HISTORY_DEFAULTS, COUNCIL_MODELS, CHAIRMAN_MODEL


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def get_conversation_path(conversation_id: str) -> str:
    """Get the file path for a conversation."""
    return os.path.join(DATA_DIR, f"{conversation_id}.json")


def delete_conversation(conversation_id: str):
    """
    Delete a conversation file.
    
    Args:
        conversation_id: Conversation identifier
    """
    path = get_conversation_path(conversation_id)
    if os.path.exists(path):
        os.remove(path)
    else:
        raise ValueError(f"Conversation {conversation_id} not found")


def create_conversation(conversation_id: str, system_prompt: Optional[str] = None) -> Dict[str, Any]:
    """
    Create a new conversation.

    Args:
        conversation_id: Unique identifier for the conversation
        system_prompt: Optional custom system prompt for this conversation

    Returns:
        New conversation dict
    """
    ensure_data_dir()

    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "New Conversation",
        "system_prompt": system_prompt,
        "messages": [],
        "analyses": [],
        "summary": "",
        "history_policy": deepcopy(HISTORY_DEFAULTS),
        "models": {
            "council": COUNCIL_MODELS,
            "chairman": CHAIRMAN_MODEL,
        },
        "persona_map": {},
    }

    # Save to file
    path = get_conversation_path(conversation_id)
    with open(path, 'w') as f:
        json.dump(conversation, f, indent=2)

    return conversation


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """
    Load a conversation from storage.

    Args:
        conversation_id: Unique identifier for the conversation

    Returns:
        Conversation dict or None if not found
    """
    path = get_conversation_path(conversation_id)

    if not os.path.exists(path):
        return None

    with open(path, 'r') as f:
        return json.load(f)


def save_conversation(conversation: Dict[str, Any]):
    """
    Save a conversation to storage.

    Args:
        conversation: Conversation dict to save
    """
    ensure_data_dir()

    path = get_conversation_path(conversation['id'])
    with open(path, 'w') as f:
        json.dump(conversation, f, indent=2)


def list_conversations() -> List[Dict[str, Any]]:
    """
    List all conversations (metadata only).

    Returns:
        List of conversation metadata dicts
    """
    ensure_data_dir()

    conversations = []
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith('.json'):
            continue
        path = os.path.join(DATA_DIR, filename)
        try:
            with open(path, 'r') as f:
                data = json.load(f)
        except Exception:
            continue

        # Skip files that are not conversation dicts
        if not isinstance(data, dict):
            continue
        if "id" not in data or "created_at" not in data or "messages" not in data:
            continue

        conversations.append({
            "id": data["id"],
            "created_at": data["created_at"],
            "title": data.get("title", "New Conversation"),
            "message_count": len(data.get("messages", []))
        })

    # Sort by creation time, newest first
    conversations.sort(key=lambda x: x["created_at"], reverse=True)

    return conversations


def add_user_message(conversation_id: str, content: str):
    """
    Add a user message to a conversation.

    Args:
        conversation_id: Conversation identifier
        content: User message content
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["messages"].append({
        "role": "user",
        "content": content,
        "created_at": datetime.utcnow().isoformat()
    })

    save_conversation(conversation)


def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Add an assistant message with all 3 stages to a conversation.

    Args:
        conversation_id: Conversation identifier
        stage1: List of individual model responses
        stage2: List of model rankings
        stage3: Final synthesized response
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    # Store only the final response in message history
    conversation["messages"].append({
        "role": "assistant",
        "content": stage3.get("response", ""),
        "model": stage3.get("model"),
        "created_at": datetime.utcnow().isoformat()
    })

    # Store full analysis separately to avoid bloating context
    analysis_entry = {
        "stage1": stage1,
        "stage2": stage2,
        "stage3": stage3,
        "metadata": metadata or {},
        "created_at": datetime.utcnow().isoformat()
    }
    conversation.setdefault("analyses", []).append(analysis_entry)

    save_conversation(conversation)
    
    # Update leaderboard with aggregate rankings if available
    if metadata and metadata.get("aggregate_rankings"):
        try:
            from .leaderboard import update_leaderboard_from_aggregate_rankings
            persona_map = conversation.get("persona_map") or {}
            update_leaderboard_from_aggregate_rankings(
                stage1,
                metadata["aggregate_rankings"],
                persona_map if persona_map else None
            )
        except Exception as e:
            # Don't fail message saving if leaderboard update fails
            print(f"Warning: Failed to update leaderboard: {e}")


def update_conversation_title(conversation_id: str, title: str):
    """
    Update the title of a conversation.

    Args:
        conversation_id: Conversation identifier
        title: New title for the conversation
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["title"] = title
    save_conversation(conversation)


PERSONAS_FILE = "personas.json"


def get_personas_path() -> str:
    """Get the file path for personas storage."""
    return os.path.join(DATA_DIR, PERSONAS_FILE)


def list_personas() -> List[Dict[str, str]]:
    """
    List all saved personas.

    Returns:
        List of dicts with 'name' and 'system_prompt'
    """
    ensure_data_dir()
    path = get_personas_path()
    
    if not os.path.exists(path):
        return []
        
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError:
        return []


def save_persona(name: str, system_prompt: str) -> Dict[str, str]:
    """
    Save or update a persona.

    Args:
        name: Name of the persona
        system_prompt: The system prompt content

    Returns:
        The saved persona dict
    """
    ensure_data_dir()
    personas = list_personas()
    
    # Check if exists, update if so
    updated = False
    for p in personas:
        if p["name"] == name:
            p["system_prompt"] = system_prompt
            updated = True
            break
    
    if not updated:
        personas.append({"name": name, "system_prompt": system_prompt})
    
    path = get_personas_path()
    with open(path, 'w') as f:
        json.dump(personas, f, indent=2)
        
    return {"name": name, "system_prompt": system_prompt}


def delete_persona(name: str):
    """
    Delete a persona by name.

    Args:
        name: Name of the persona to delete
    """
    ensure_data_dir()
    personas = list_personas()
    personas = [p for p in personas if p["name"] != name]
    
    path = get_personas_path()
    with open(path, 'w') as f:
        json.dump(personas, f, indent=2)


def estimate_tokens(text: str) -> int:
    """Rough token estimate (4 chars ~= 1 token)."""
    return max(1, len(text) // 4)


def compact_conversation(conversation: Dict[str, Any], policy: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Apply history compaction based on policy constraints."""
    policy = policy or HISTORY_DEFAULTS
    max_turns = policy.get("max_turns")
    max_tokens = policy.get("max_tokens")
    messages = conversation.get("messages", [])
    summary = conversation.get("summary", "") or ""

    # Trim by turn count (user+assistant pairs)
    if max_turns is not None and max_turns > 0:
        limit = max_turns * 2
        if len(messages) > limit:
            dropped = messages[:-limit]
            messages = messages[-limit:]
            dropped_text = "; ".join([f"{m.get('role')}: {m.get('content','')[:200]}" for m in dropped])
            summary = (summary + "\n" + dropped_text).strip()

    # Trim by approximate token budget
    def total_tokens(msgs: List[Dict[str, Any]]) -> int:
        return sum(estimate_tokens(m.get("content", "")) for m in msgs)

    while max_tokens and total_tokens(messages) > max_tokens and len(messages) > 1:
        removed = messages.pop(0)
        summary_piece = f"{removed.get('role')}: {removed.get('content','')[:200]}"
        summary = (summary + "\n" + summary_piece).strip()

    # Cap summary length to avoid runaway growth
    if len(summary) > 2000:
        summary = summary[-2000:]

    conversation["messages"] = messages
    conversation["summary"] = summary
    conversation["history_policy"] = policy
    return conversation


def compact_and_save(conversation_id: str, policy: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Load, compact, save, and return the conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    compacted = compact_conversation(conversation, policy=policy)
    save_conversation(compacted)
    return compacted


def delete_message(conversation_id: str, message_index: int):
    """
    Delete a message from a conversation by index.
    
    Args:
        conversation_id: Conversation identifier
        message_index: Index of the message to delete (0-based)
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    
    messages = conversation.get("messages", [])
    if message_index < 0 or message_index >= len(messages):
        raise ValueError(f"Message index {message_index} out of range")
    
    # Delete the message
    deleted = messages.pop(message_index)
    
    # If it was an assistant message, also remove the corresponding analysis
    if deleted.get("role") == "assistant":
        analyses = conversation.get("analyses", [])
        # Find the corresponding analysis (assistant messages correspond to analyses)
        assistant_count = sum(1 for m in messages[:message_index] if m.get("role") == "assistant")
        if assistant_count < len(analyses):
            analyses.pop(assistant_count)
            conversation["analyses"] = analyses
    
    save_conversation(conversation)
    return conversation


def update_conversation_settings(
    conversation_id: str,
    history_policy: Optional[Dict[str, Any]] = None,
    system_prompt: Optional[str] = None,
    models: Optional[Dict[str, Any]] = None,
    persona_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Update per-conversation settings like history policy, system prompt, or models."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    if history_policy:
        conversation["history_policy"] = {**conversation.get("history_policy", {}), **history_policy}
    if system_prompt is not None:
        conversation["system_prompt"] = system_prompt
    if models:
        conversation["models"] = {**conversation.get("models", {}), **models}
    if persona_map is not None:
        conversation["persona_map"] = persona_map

    save_conversation(conversation)
    return conversation
