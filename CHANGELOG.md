# Changelog

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
