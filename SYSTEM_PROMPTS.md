# Custom System Prompts & Personas

LLM Council supports multiple ways to customize system prompts and personas for different stages and models.

## How It Works

System prompts can be applied in different ways:

### Shared System Prompt (Council Mode)
A single system prompt is sent to all models in all three stages:
- **Stage 1**: Council members receive the system prompt before answering the user's question
- **Stage 2**: Council members receive the system prompt before ranking responses
- **Stage 3**: The Chairman receives the system prompt before synthesizing the final answer

### Per-Model Personas (Persona Compare Mode)
In Persona Compare Mode, each enabled model can have its own unique persona:
- **Stage 1**: Each council member receives their assigned persona (if any) before answering
- **Stage 2**: Each council member receives their assigned persona (if any) before ranking
- **Stage 3**: Chairman receives its own persona (if assigned)

## Usage Options

### Option 1: Global Default (via .env)

Set a default system prompt for ALL conversations:

```bash
DEFAULT_SYSTEM_PROMPT=You are an expert programmer. Always provide code examples and best practices.
```

### Option 2: Per-Conversation (via API)

Create a conversation with a custom system prompt:

```javascript
// Frontend API call
const newConv = await api.createConversation({
  system_prompt: "You are a helpful AI assistant specialized in explaining complex topics to beginners."
});
```

```bash
# Direct API call
curl -X POST http://localhost:8002/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"system_prompt": "You are an expert in quantum physics."}'
```

### Option 3: Persona Compare Mode (Per-Model Personas)

Use the sidebar to switch to Persona Compare Mode, then:
1. Select which models to enable
2. Assign a saved persona to each enabled model
3. Apply to conversation - this creates a `persona_map` that maps model IDs to system prompts

Each model will receive its own persona during all stages.

### Option 4: No System Prompt

Simply omit the system_prompt/persona_map parameters and no system messages will be prepended.

## Examples

**Code Review Assistant:**

```
system_prompt: "You are a senior software engineer reviewing code. Focus on best practices, security, and performance."
```

**Educational Tutor:**

```
system_prompt: "You are a patient teacher. Always explain concepts step-by-step with examples."
```

**Creative Writing Coach:**

```
system_prompt: "You are a creative writing coach. Provide constructive feedback while encouraging creativity."
```

## Persona Management

Personas are saved system prompts that can be reused:

- **Save Persona**: Create a persona from the sidebar with a custom name
- **Apply to Conversation**: Use a single persona as the system prompt for entire conversation
- **Persona Compare**: Assign different personas to different models in the same conversation
- **Storage**: Personas are stored in `data/personas/personas.json`
- **Persistence**: Persona assignments are saved per-conversation in `persona_map` field

## Technical Details

- **Shared prompts**: Stored in conversation JSON as `system_prompt` field
- **Per-model personas**: Stored in conversation JSON as `persona_map: Dict[str, str]` mapping model IDs to system prompts
- **Precedence**: If both exist, per-model personas take precedence over shared system prompt for those models
- **Default**: If a conversation has a custom system prompt, it takes precedence over `.env` default
- **Format**: System prompts are sent as `{"role": "system", "content": "..."}` messages
- **Model Support**: All OpenRouter models support system messages
- **Matching**: Persona_map tries exact model ID match first, then falls back to base model name matching (e.g., "hermes-4-405b" matches "nousresearch/hermes-4-405b")
