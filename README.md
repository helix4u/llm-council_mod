# LLM Council

![llmcouncil](header.jpg)

The idea of this repo is that instead of asking a question to your favorite LLM provider (e.g. OpenAI GPT 5.1, Google Gemini 3.0 Pro, Anthropic Claude Sonnet 4.5, xAI Grok 4, eg.c), you can group them into your "LLM Council". This repo is a simple, local web app that essentially looks like ChatGPT except it uses OpenRouter to send your query to multiple LLMs, it then asks them to review and rank each other's work, and finally a Chairman LLM produces the final response.

In a bit more detail, here is what happens when you submit a query:

1. **Stage 1: First opinions**. The user query is given to all LLMs individually, and the responses are collected. The individual responses are shown in a "tab view", so that the user can inspect them all one by one.
2. **Stage 2: Review**. Each individual LLM is given the responses of the other LLMs. Under the hood, the LLM identities are anonymized so that the LLM can't play favorites when judging their outputs. The LLM is asked to rank them in accuracy and insight.
3. **Stage 3: Final response**. The designated Chairman of the LLM Council takes all of the model's responses and compiles them into a single final answer that is presented to the user.

## Vibe Code Alert

This project was 99% vibe coded as a fun Saturday hack because I wanted to explore and evaluate a number of LLMs side by side in the process of [reading books together with LLMs](https://x.com/karpathy/status/1990577951671509438). It's nice and useful to see multiple responses side by side, and also the cross-opinions of all LLMs on each other's outputs. I'm not going to support it in any way, it's provided here as is for other people's inspiration and I don't intend to improve it. Code is ephemeral now and libraries are over, ask your LLM to change it in whatever way you like.

## Setup

### 1. Install Dependencies

The project uses [uv](https://docs.astral.sh/uv/) for project management.

**Backend:**
```bash
uv sync
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 2. Configure API Key

Create a `.env` file in the project root:

```bash
# Copy .env.example to .env and edit it
cp .env.example .env
# Or create .env manually with:
OPENROUTER_API_KEY=sk-or-v1-...
```

Get your API key at [openrouter.ai](https://openrouter.ai/). Make sure to purchase the credits you need, or sign up for automatic top up.

### 3. Configure Models (Optional)

You can customize models in two ways:

**Option A: Edit `backend/config.py`** (default models):
```python
COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "google/gemini-3-pro-preview",
    "anthropic/claude-sonnet-4.5",
    "x-ai/grok-4",
]

CHAIRMAN_MODEL = "google/gemini-3-pro-preview"
```

**Option B: Use the UI** (recommended):
- Models can be selected directly in the sidebar
- Choose from all available OpenRouter models
- Selections persist across sessions
- Switch between Council Mode and Persona Compare Mode

## Running the Application

**Option 1: Use the start script**
```bash
./start.sh
```

**Option 2: Run manually**

Terminal 1 (Backend):
```bash
uv run python -m backend.main
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

## Tech Stack

- **Backend:** FastAPI (Python 3.10+), async httpx, OpenRouter API
- **Frontend:** React + Vite, react-markdown for rendering
- **Storage:** JSON files in `data/conversations/`
- **Package Management:** uv for Python, npm for JavaScript

## Git Setup

This project is ready for version control. To initialize git:

```bash
# Initialize git repository (if not already initialized)
git init

# Add all files
git add .

# Make your first commit
git commit -m "Initial commit"

# Add your remote repository
git remote add origin https://github.com/helix4u/llm-council_mod.git

# Push to repository
git push -u origin main
```

**Note:** Make sure to:
- Never commit your `.env` file (it's already in `.gitignore`)
- Never commit the `data/` folder (conversations are stored here)
- Review `.gitignore` to ensure sensitive files aren't tracked

## Features

### Core Functionality
- **Three-Stage Council Process**: Individual responses → Cross-model ranking → Final synthesis
- **Multi-Turn Conversations**: Full conversation history with configurable retention policies
- **OpenRouter Integration**: Access to 100+ LLM models with pricing information
- **Anonymized Ranking**: Models rank responses without knowing which model produced them

### Persona Management
- **Save Personas**: Create and save reusable system prompts as named personas
- **Apply to Conversation**: Apply a single persona as system prompt to entire conversation
- **Persona Compare Mode**: Assign different personas to individual council models
- **Per-Model Personas**: Each model can have its own unique persona/perspective

### Model Management
- **Model Catalog**: Browse and select from all available OpenRouter models
- **Search/Filter**: Quickly find models by ID or name
- **Persistent Selections**: Your model choices are saved in localStorage
- **Pricing Display**: See prompt and completion pricing for each model

### User Experience
- **Two Modes**: Switch between Council Mode (traditional) and Persona Compare Mode
- **Preview**: See which models and personas will run before applying
- **Dark Mode**: Toggle between light and dark themes
- **Error Handling**: Robust error handling prevents crashes on API failures
- **Per-Stage Controls**: Redo or copy individual stage results

## Persona Compare Mode

Persona Compare Mode allows you to assign different personas (system prompts) to individual models in your council:

1. **Switch to Persona Compare Mode** in the sidebar
2. **Select Models**: Choose which models to enable from the full catalog
3. **Assign Personas**: For each enabled model, select a persona from your saved personas
4. **Preview**: Review which models will run with which personas
5. **Apply**: Save the configuration to the current conversation
6. **Send Messages**: The enabled models with their assigned personas will be used

This is useful for:
- Comparing different perspectives on the same question
- Testing how different personalities affect responses
- Creating specialized roles (e.g., one model as "skeptical critic", another as "optimistic supporter")

## Repository

This is a modified version of the original [llm-council](https://github.com/karpathy/llm-council) project with extensive enhancements:

- ✅ **Persona Compare Mode**: Fully functional per-model persona assignment
- ✅ **Persistent Settings**: Model selections, personas, and mode preferences saved locally
- ✅ **Enhanced UI**: Improved model selection, search, preview, and organization
- ✅ **Robust Error Handling**: Graceful degradation when models fail or rankings are malformed
- ✅ **Stage 2 Fixes**: Uses actual models from Stage 1, not stale configured models
- ✅ **Persona Management**: Full CRUD operations for personas
- ✅ **Dark Mode**: Theme toggle with persistence

Forked from [karpathy/llm-council](https://github.com/karpathy/llm-council) and maintained at [helix4u/llm-council_mod](https://github.com/helix4u/llm-council_mod).
