# Custom System Prompts

LLM Council now supports custom system prompts that can be applied to all stages of the council process.

## How It Works

System prompts are sent to all models in all three stages:

- **Stage 1**: Council members receive the system prompt before answering the user's question
- **Stage 2**: Council members receive the system prompt before ranking responses
- **Stage 3**: The Chairman receives the system prompt before synthesizing the final answer

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
curl -X POST http://localhost:8001/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"system_prompt": "You are an expert in quantum physics."}'
```

### Option 3: No System Prompt

Simply omit the system_prompt parameter and no system message will be prepended.

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

## Technical Details

- System prompts are stored in the conversation JSON file in the `system_prompt` field
- If a conversation has a custom system prompt, it takes precedence over the default
- System prompts are sent as `{"role": "system", "content": "..."}` messages
- All OpenRouter models support system messages
