"""FastAPI backend for LLM Council."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import uuid
import json
import asyncio

from . import storage
from .council import run_full_council, generate_conversation_title, stage1_collect_responses, stage2_collect_rankings, stage3_synthesize_final, calculate_aggregate_rankings
from .config import DEFAULT_SYSTEM_PROMPT
from .openrouter import list_models

app = FastAPI(title="LLM Council API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    system_prompt: str | None = None
    history_policy: Dict[str, Any] | None = None
    council_models: List[str] | None = None
    chairman_model: str | None = None
    persona_map: Dict[str, str] | None = None


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation."""
    content: str
    history_policy: Dict[str, Any] | None = None
    council_models: List[str] | None = None
    chairman_model: str | None = None
    persona_map: Dict[str, str] | None = None


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]
    analyses: List[Dict[str, Any]] | None = None
    summary: str | None = None
    history_policy: Dict[str, Any] | None = None
    system_prompt: str | None = None
    models: Dict[str, Any] | None = None


class UpdateConversationSettings(BaseModel):
    """Update per-conversation settings."""
    history_policy: Dict[str, Any] | None = None
    system_prompt: str | None = None
    council_models: List[str] | None = None
    chairman_model: str | None = None
    persona_map: Dict[str, str] | None = None


class Persona(BaseModel):
    """Council Persona (saved system prompt)."""
    name: str
    system_prompt: str


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/api/personas", response_model=List[Persona])
async def list_personas():
    """List all saved personas."""
    return storage.list_personas()

@app.get("/api/models")
async def get_models(q: str | None = None):
    """Return available OpenRouter models with pricing info (optionally filtered by query)."""
    try:
        return await list_models(query=q)
    except Exception as e:
        # Never fail the UI; return configured fallback on any error
        try:
            return await list_models(query=None)
        except Exception:
            raise HTTPException(status_code=502, detail=f"Failed to fetch models: {e}")


@app.post("/api/personas", response_model=Persona)
async def save_persona(persona: Persona):
    """Save or update a persona."""
    return storage.save_persona(persona.name, persona.system_prompt)


@app.delete("/api/personas/{name}")
async def delete_persona(name: str):
    """Delete a persona."""
    storage.delete_persona(name)
    return {"status": "ok"}


@app.patch("/api/conversations/{conversation_id}/settings", response_model=Conversation)
async def update_conversation_settings(conversation_id: str, request: UpdateConversationSettings):
    """Update conversation settings like history policy or models."""
    models_update = {}
    if request.council_models:
        models_update["council"] = request.council_models
    if request.chairman_model:
        models_update["chairman"] = request.chairman_model

    try:
        conversation = storage.update_conversation_settings(
            conversation_id,
            history_policy=request.history_policy,
            system_prompt=request.system_prompt,
            models=models_update if models_update else None,
            persona_map=request.persona_map,
        )
        return conversation
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found")


@app.get("/api/health")
async def health():
    """API health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/api/config")
async def get_config():
    """Get current configuration."""
    from .config import COUNCIL_MODELS, CHAIRMAN_MODEL, HISTORY_DEFAULTS
    return {
        "council_models": COUNCIL_MODELS,
        "chairman_model": CHAIRMAN_MODEL,
        "history_defaults": HISTORY_DEFAULTS
    }


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    """List all conversations (metadata only)."""
    return storage.list_conversations()


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    conversation = storage.create_conversation(conversation_id, request.system_prompt)

    models_update = {}
    if request.council_models:
        models_update["council"] = request.council_models
    if request.chairman_model:
        models_update["chairman"] = request.chairman_model

    if request.history_policy or models_update or request.system_prompt is not None or request.persona_map is not None:
        conversation = storage.update_conversation_settings(
            conversation_id,
            history_policy=request.history_policy,
            system_prompt=request.system_prompt,
            models=models_update if models_update else None,
            persona_map=request.persona_map,
        )

    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Enrich assistant messages with stored analysis for UI convenience
    analyses = conversation.get("analyses", [])
    if analyses:
        enriched_messages = []
        assistant_idx = 0
        for msg in conversation["messages"]:
            msg_copy = dict(msg)
            if msg.get("role") == "assistant" and assistant_idx < len(analyses):
                analysis = analyses[assistant_idx]
                msg_copy.update({
                    "stage1": analysis.get("stage1"),
                    "stage2": analysis.get("stage2"),
                    "stage3": analysis.get("stage3"),
                    "metadata": analysis.get("metadata"),
                })
                assistant_idx += 1
            enriched_messages.append(msg_copy)
        conversation = {**conversation, "messages": enriched_messages}
    return conversation


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and run the 3-stage council process.
    Returns the complete response with all stages.
    """
    # Check if conversation exists
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Add user message
    storage.add_user_message(conversation_id, request.content)

    # Apply any incoming history policy override
    if request.history_policy:
        storage.update_conversation_settings(conversation_id, history_policy=request.history_policy)
    if request.persona_map is not None:
        storage.update_conversation_settings(conversation_id, persona_map=request.persona_map)
    # Apply incoming model overrides
    models_update = {}
    if request.council_models:
        models_update["council"] = request.council_models
    if request.chairman_model:
        models_update["chairman"] = request.chairman_model
    if models_update:
        storage.update_conversation_settings(conversation_id, models=models_update)

    # Compact history to keep only needed context
    conversation = storage.compact_and_save(conversation_id, policy=request.history_policy or conversation.get("history_policy"))

    # If this is the first message, generate a title
    if is_first_message:
        title = await generate_conversation_title(request.content)
        storage.update_conversation_title(conversation_id, title)

    # Resolve prompts and models
    system_prompt = conversation.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
    models_cfg = conversation.get("models", {}) or {}
    council_models = models_cfg.get("council")
    chairman_model = models_cfg.get("chairman")
    if not council_models:
        try:
            from .config import COUNCIL_MODELS
            council_models = COUNCIL_MODELS
        except Exception:
            council_models = []
    if not chairman_model:
        try:
            from .config import CHAIRMAN_MODEL
            chairman_model = CHAIRMAN_MODEL
        except Exception:
            chairman_model = None

    # Build context for models: include optional summary as a system note, plus compacted message history
    history_messages = []
    if conversation.get("summary"):
        history_messages.append({"role": "system", "content": f"Conversation summary so far: {conversation['summary']}"})
    history_messages.extend(conversation.get("messages", []))

    # Get persona_map from conversation or request
    persona_map = conversation.get("persona_map") or request.persona_map

    # Run the 3-stage council process
    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        request.content,
        history_messages=history_messages,
        system_prompt=system_prompt,
        council_models=council_models,
        chairman_model=chairman_model,
        history_summary=conversation.get("summary", ""),
        persona_map=persona_map
    )
    
    # Note: Stage 2 in run_full_council already uses models from stage1_results

    # Add assistant message with all stages (analysis stored separately)
    storage.add_assistant_message(
        conversation_id,
        stage1_results,
        stage2_results,
        stage3_result,
        metadata=metadata
    )

    # Return the complete response with metadata
    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    # Check if conversation exists
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    async def event_generator():
        try:
            # Add user message
            storage.add_user_message(conversation_id, request.content)

            # Apply incoming history policy override
            if request.history_policy:
                storage.update_conversation_settings(conversation_id, history_policy=request.history_policy)
            if request.persona_map is not None:
                storage.update_conversation_settings(conversation_id, persona_map=request.persona_map)
            models_update = {}
            if request.council_models:
                models_update["council"] = request.council_models
            if request.chairman_model:
                models_update["chairman"] = request.chairman_model
            if models_update:
                storage.update_conversation_settings(conversation_id, models=models_update)

            # Compact history
            conversation_compacted = storage.compact_and_save(conversation_id, policy=request.history_policy or conversation.get("history_policy"))

            # Start title generation in parallel (don't await yet)
            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            # Resolve system prompt and models
            system_prompt = conversation_compacted.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
            models_cfg = conversation_compacted.get("models", {}) or {}
            council_models = models_cfg.get("council")
            chairman_model = models_cfg.get("chairman")

            # Build history messages (summary + compacted turns)
            history_messages = []
            if conversation_compacted.get("summary"):
                history_messages.append({"role": "system", "content": f"Conversation summary so far: {conversation_compacted['summary']}"})
            history_messages.extend(conversation_compacted.get("messages", []))

            # Get persona_map from conversation or request
            persona_map = conversation_compacted.get("persona_map") or request.persona_map

            # Stage 1: Collect responses
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(
                history_messages,
                system_prompt=system_prompt,
                models=council_models,
                persona_map=persona_map
            )
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2: Collect rankings
            # Use the models that actually responded in Stage 1, not the configured models
            actual_models = [result['model'] for result in stage1_results]
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            try:
                stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results, system_prompt=system_prompt, models=actual_models)
                aggregate_rankings = []
                try:
                    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
                except Exception as agg_error:
                    print(f"Error calculating aggregate rankings: {agg_error}")
                    # Continue with empty aggregate rankings rather than failing
                    aggregate_rankings = []
                yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"
            except Exception as stage2_error:
                print(f"Error in Stage 2: {stage2_error}")
                import traceback
                traceback.print_exc()
                # Send empty results rather than failing completely
                stage2_results = []
                label_to_model = {}
                aggregate_rankings = []
                yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # Stage 3: Synthesize final answer
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results, system_prompt=system_prompt, chairman_model=chairman_model, history_summary=conversation_compacted.get("summary", ""))
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            # Wait for title generation if it was started
            if title_task:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            # Save complete assistant message
            storage.add_assistant_message(
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result,
                metadata={"label_to_model": label_to_model, "aggregate_rankings": aggregate_rankings}
            )

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            # Send error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
