# Changelog

## 2025-12-06
- **Cost Tracking & Estimation**: Comprehensive cost calculation and display
  - Real-time cost calculation for each turn (Stage 1, 2, 3 costs)
  - Per-model cost breakdown in Stage 1 and Stage 2
  - Conversation-level total cost and token usage displayed in header
  - Turn-level cost summary after each assistant message
  - Cost calculation based on OpenRouter pricing and actual token usage
  - API endpoint: `GET /api/conversations/{id}/costs` returns total cost and tokens
- **Progress Bar**: Meaningful progress tracking during council process
  - Visual progress bar showing overall completion percentage
  - Stage-by-stage breakdown: Stage 1 (X/Y models), Stage 2 (X/Y rankings), Stage 3 (synthesizing/complete)
  - Real-time updates as models complete in Stage 1
  - Progress events sent from backend as each model finishes
- **Settings Tab**: Centralized settings interface
  - New "Settings" tab in main content area (alongside Chat and Leaderboard)
  - Tabbed interface: Mode Selection, Ranking Rules, Chairman Instructions
  - All settings consolidated: mode selection, model configuration, persona management, history policy
  - Council Mode preview showing selected models and pricing
  - Regular Chat Mode for direct LLM interaction (bypasses council stages)
  - Custom ranking and chairman prompt templates
  - Apply button to save all settings to conversation
- **Bug Fixes**:
  - Fixed React Hooks order violation in ChatInterface (moved hooks before early return)
  - Fixed cost calculation endpoint to use message metadata instead of deprecated analyses field
  - Fixed asyncio import conflict in streaming endpoint

## 2025-01-XX
- **Leaderboard Feature**: Cumulative performance tracking for models and personas
  - Automatic tracking of model+persona combinations across all conversations
  - Metrics: average rank, wins, win rate, participations, total votes
  - Leaderboard view accessible via tab in main content area (right side)
  - Filtering by model ID or persona name
  - Sorting by average rank, wins, or participations
  - Data stored in `data/conversations/leaderboard.json`
  - Updates automatically when conversations complete with aggregate rankings
  - API endpoint: `GET /api/leaderboard` with optional query parameters

## 2025-01-XX (Previous)
- **Persona Compare Mode**: Fully functional per-model persona assignment system
  - Select models from full catalog (not limited to council models)
  - Assign individual personas to each enabled model
  - Preview shows which models will run with which personas
  - Persona_map properly applied in all stages when sending messages
- **Persistence**: Model selections, persona assignments, mode, and theme preferences now persist in localStorage
- **Stage 2 Fix**: Now uses actual models from Stage 1 results instead of stale configured models
- **Error Handling**: Robust error handling in Stage 2 prevents chat from going blank on ranking failures
- **UI Improvements**: Enhanced model selection UI, search/filter functionality, better organization
- **Documentation**: Updated README, AGENTS.md, and SYSTEM_PROMPTS.md to reflect all current features
- **Git Setup**: Added .gitattributes for line ending consistency, .env.example template, updated .gitignore

## 2025-11-23
- Added per-conversation history policy (max turns/tokens) with compaction summary; persisted only system/user/final messages.
- Restored Stage 3 synthesis and passed compact history context through all stages.
- Added OpenRouter model catalog endpoint with pricing and UI picker; conversation-level model overrides supported.
- Enabled multi-turn chat input; separated analysis storage from conversational context.
- Introduced `AGENTS.md` (Codex notes) and `TODO.md` for ongoing work tracking.
- Added dark theme toggle, model search/refresh UI, and fallback model list when OpenRouter auth/rate limits block catalog fetch; improved settings apply UX/error surfacing.
- Added per-stage redo + copy buttons, chairman model search box, and a Persona Compare (beta) mode with per-model persona assignments. Rate-limit handling now retries 429/503 with limited concurrency. UI styling unified to neutral grays in dark mode.
