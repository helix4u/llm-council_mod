"""Configuration for the LLM Council."""

import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Council members - list of OpenRouter model identifiers
COUNCIL_MODELS = [
    "openai/gpt-5.1-codex-mini",
    "openai/gpt-oss-20b:free",
    "kwaipilot/kat-coder-pro:free",
    "x-ai/grok-4.1-fast:free",
]

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = "tngtech/deepseek-r1t2-chimera:free"

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"

# History compaction defaults
HISTORY_DEFAULTS = {
    "max_turns": int(os.getenv("HISTORY_MAX_TURNS", 6)),
    # Approximate token budget for context messages (user + assistant), not counting system prompt
    "max_tokens": int(os.getenv("HISTORY_MAX_TOKENS", 4000)),
    # Strategy: 'trim' (drop oldest into summary)
    "strategy": os.getenv("HISTORY_STRATEGY", "trim"),
}

# Default system prompt (optional - can be overridden per conversation)
# Set this in .env as DEFAULT_SYSTEM_PROMPT if you want a global default
DEFAULT_SYSTEM_PROMPT = os.getenv("DEFAULT_SYSTEM_PROMPT")
