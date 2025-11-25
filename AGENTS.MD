# AGENTS.md - Codex Notes for LLM Council

This file documents Codex-specific guidance and deviations from the historical CLAUDE.md artifact.

## Purpose
- Keep the council orchestration aligned across agents (Claude, Codex, others).
- Record implementation decisions unique to Codex runs (multi-turn history, model picker, pricing).

## Storage & Context
- **History policy**: per-conversation `history_policy` with `max_turns`, `max_tokens`, `strategy=trim`.
- **What we persist**: system prompt, user turns, final assistant replies. Stage 1/2 analysis is stored separately in `analyses` and NOT used for context building.
- **Compaction**: when limits are hit we drop oldest turns into a bounded `summary` (<=2000 chars) and keep only recent turns for context.
- **Context building**: models see `[system_prompt] + [summary as system note] + [trimmed turns] + [latest user]`.

## Models
- Default models still come from `config.py`, but conversations can override council + chairman via API/UI.
- `/api/models` proxies OpenRouter model catalog (includes prompt/completion pricing) for UI selection. Chairman now uses the same searchable list as council via the sidebar search box.

## API Changes
- `POST /api/conversations` accepts `history_policy`, `council_models`, `chairman_model`.
- `PATCH /api/conversations/{id}/settings` updates policy/models/system prompt per conversation.
- `GET /api/models` lists OpenRouter models for user selection with pricing metadata.
- `GET /api/conversations/{id}` enriches assistant messages with stored analyses for UI, while keeping storage lean.
- Rate limiting: OpenRouter client retries 429/503 with exponential backoff and caps concurrency (2) for parallel calls.

## Frontend Notes
- Multi-turn chat enabled (input always visible).
- Settings panel lets users set history caps and select council/chairman models with price hints.
- Applying settings writes to backend and updates in-memory defaults for new turns/conversations.
- Per-stage controls: Stage1/2/3 now include “Redo” (re-run last turn) and “Copy” buttons.
- Persona Compare (beta): sidebar mode toggle shows per-model persona prompt inputs; applied as system prompt to the current conversation (UI only for now).

## Technical Reminders
- `stage3_synthesize_final` restored; ensure it always receives the compact summary for coherence.
- Token estimation is coarse (`len/4`); replace with tokenizer-specific counts if/when a tokenizer is available.
- Keep `summary` bounded to prevent runaway storage; prefer semantic summarization in future iterations.

## Workflow
- Log feature changes in `CHANGELOG.md`.
- Track upcoming work in `TODO.md`.
