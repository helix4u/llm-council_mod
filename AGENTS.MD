# AGENTS.md - Implementation Notes for LLM Council

This file documents implementation decisions and features for maintaining consistency across development sessions.

## Purpose
- Keep the council orchestration aligned across development sessions.
- Record implementation decisions for history policy, personas, model management, and UI features.
- Document API contracts and data flow between frontend and backend.

## Storage & Context
- **History policy**: per-conversation `history_policy` with `max_turns`, `max_tokens`, `strategy=trim`.
- **What we persist**: system prompt, user turns, final assistant replies. Stage 1/2 analysis is stored separately in `analyses` and NOT used for context building.
- **Persona storage**: personas are stored as JSON files in `data/personas/` directory with name and system_prompt.
- **Conversation persona_map**: stored per-conversation as `persona_map: Dict[str, str]` mapping model IDs to system prompts.
- **Compaction**: when limits are hit we drop oldest turns into a bounded `summary` (<=2000 chars) and keep only recent turns for context.
- **Context building**: models see `[system_prompt (from persona_map if present)] + [summary as system note] + [trimmed turns] + [latest user]`.

## Models
- Default models come from `config.py`, but conversations can override council + chairman via API/UI.
- `/api/models` proxies OpenRouter model catalog (includes prompt/completion pricing) for UI selection.
- Models can be selected from full catalog in both Council Mode and Persona Compare Mode.
- In Persona Compare Mode, users select specific models to enable, then assign personas to each enabled model.
- **Stage 2 models**: Stage 2 uses the actual models that responded in Stage 1, not the configured models. This ensures rankings match the models that actually produced responses.

## Persona Management
- **Save/Delete**: Personas can be saved and deleted via the sidebar UI.
- **Apply to conversation**: Single persona can be applied to entire conversation as system prompt.
- **Persona Compare Mode**: Multiple personas can be assigned to different models individually.
- **Per-model personas**: Each enabled model in Persona Compare Mode can have its own persona assigned.
- **Persistence**: Persona assignments persist in localStorage and are merged with conversation's persona_map.
- **Preview**: Real-time preview shows which models will run with which personas before applying.

## Persistence (localStorage)
- `llm-council-mode`: Current mode ('council' or 'persona-compare')
- `llm-council-selected-models`: Selected council models
- `llm-council-persona-assignments`: Persona assignments (modelId -> {personaName})
- `llm-council-persona-compare-models`: Enabled models in Persona Compare Mode
- `llm-council-theme`: UI theme preference ('light' or 'dark')

## API Changes
- `POST /api/conversations` accepts `history_policy`, `council_models`, `chairman_model`, `persona_map`.
- `PATCH /api/conversations/{id}/settings` updates policy/models/system prompt/persona_map per conversation.
- `POST /api/conversations/{id}/message` and `/message/stream` accept `persona_map` in request body.
- `GET /api/models` lists OpenRouter models for user selection with pricing metadata.
- `GET /api/conversations/{id}` enriches assistant messages with stored analyses for UI, while keeping storage lean.
- `GET /api/personas`, `POST /api/personas`, `DELETE /api/personas/{name}` for persona management.
- Rate limiting: OpenRouter client retries 429/503 with exponential backoff and caps concurrency (2) for parallel calls.

## Frontend Notes
- **Multi-turn chat**: Input always visible, full conversation history maintained.
- **Two modes**: 
  - **Council Mode**: Traditional mode with shared system prompt, configurable council models
  - **Persona Compare Mode**: Select specific models and assign individual personas to each
- **Settings panel**: History caps, council/chairman model selection with price hints, persona management.
- **Model selection**: Can select from all available OpenRouter models, not limited to council selection.
- **Search/filter**: Both mode selection lists support search/filter by model ID or name.
- **Applying settings**: Writes to backend and updates in-memory defaults for new turns/conversations.
- **Per-stage controls**: Stage1/2/3 include "Redo" (re-run last turn) and "Copy" buttons.
- **Persona Compare flow**:
  1. Switch to Persona Compare mode
  2. Select models to enable (checkboxes)
  3. Assign personas to enabled models (dropdowns)
  4. Preview shows what will run
  5. Apply to conversation saves persona_map
  6. When sending messages, enabled models with persona_map are used
- **Error handling**: Robust error handling in Stage 2 prevents chat from going blank on ranking errors.

## Data Flow - Persona Compare Mode
1. User selects models in Persona Compare Mode UI
2. User assigns personas to enabled models
3. `buildPersonaMap()` constructs persona_map from enabled models and assignments
4. `onPersonaCompareChange` notifies App.jsx of enabled models and persona_map
5. User clicks "Apply Personas" -> `PATCH /api/conversations/{id}/settings` with persona_map
6. When sending message -> `POST /api/conversations/{id}/message/stream` with:
   - `council_models`: enabled models from persona compare settings
   - `persona_map`: constructed persona_map
7. Backend uses persona_map in `stage1_collect_responses` to apply per-model system prompts
8. Stage 2 uses models from Stage 1 results, not configured models

## Technical Reminders
- `stage3_synthesize_final` restored; ensure it always receives the compact summary for coherence.
- Token estimation is coarse (`len/4`); replace with tokenizer-specific counts if/when a tokenizer is available.
- Keep `summary` bounded to prevent runaway storage; prefer semantic summarization in future iterations.
- Persona_map matching: Backend tries exact model ID match first, then falls back to base model name matching.
- Stage 2 robustness: Wrapped in try-except to handle malformed rankings gracefully.

## Workflow
- Log feature changes in `CHANGELOG.md`.
- Track upcoming work in `TODO.md`.
