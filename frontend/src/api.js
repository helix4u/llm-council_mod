/**
 * API client for the LLM Council backend.
 */

const API_BASE = 'http://localhost:8002';

export const api = {
  /**
   * List all conversations.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   * @param {string} systemPrompt - Optional system prompt
   */
  async createConversation(systemPrompt = null, options = {}) {
    const { historyPolicy = null, councilModels = null, chairmanModel = null } = options;
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        history_policy: historyPolicy,
        council_models: councilModels,
        chairman_model: chairmanModel,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    return response.json();
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`
    );
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json();
  },

  /**
   * Send a message in a conversation.
   */
  async sendMessage(conversationId, content, options = {}) {
    const { historyPolicy = null } = options;
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, history_policy: historyPolicy }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    return response.json();
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, onEvent, options = {}) {
    const { historyPolicy = null, councilModels = null, chairmanModel = null, personaMap = null } = options;
    const controller = new AbortController();
    
    // Calculate adaptive timeout: base 120s + 30s per model
    // This accounts for Stage 1 (models run in parallel but still take time),
    // Stage 2 (rankings), and Stage 3 (synthesis of all responses)
    const numModels = councilModels?.length || 3; // Default to 3 if not specified
    const adaptiveTimeout = 120000 + (numModels * 30000); // 2 min base + 30s per model
    // Cap at 10 minutes to prevent excessive waits
    const maxTimeout = Math.min(adaptiveTimeout, 600000);
    
    let timeoutId = setTimeout(() => controller.abort(), maxTimeout);
    
    // Function to reset timeout on activity (ping messages or data)
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), maxTimeout);
    };

    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          history_policy: historyPolicy,
          council_models: councilModels,
          chairman_model: chairmanModel,
          persona_map: personaMap,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      clearTimeout(timeoutId);
      throw new Error('Failed to send message');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value);
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';

      for (const line of parts) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        try {
          const event = JSON.parse(data);
          
          // Reset timeout on any activity (including ping messages)
          resetTimeout();
          
          // Handle ping messages (keepalive) - they reset timeout but don't trigger events
          if (event.type === 'ping') {
            continue; // Just reset timeout, don't pass to onEvent
          }
          
          onEvent(event.type, event);
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      }
    }

    clearTimeout(timeoutId);
  },

  /**
   * List all personas.
   */
  async listPersonas() {
    const response = await fetch(`${API_BASE}/api/personas`);
    if (!response.ok) {
      throw new Error('Failed to list personas');
    }
    return response.json();
  },

  /**
   * Save a persona.
   */
  async savePersona(name, systemPrompt) {
    const response = await fetch(`${API_BASE}/api/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, system_prompt: systemPrompt }),
    });
    if (!response.ok) {
      throw new Error('Failed to save persona');
    }
    return response.json();
  },

  /**
   * Delete a persona.
   */
  async deletePersona(name) {
    const response = await fetch(`${API_BASE}/api/personas/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete persona');
    }
    return response.json();
  },

  /**
   * Update a conversation's settings (history policy, models, system prompt).
   */
  async updateConversationSettings(conversationId, payload) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      const err = new Error(text || 'Failed to update conversation settings');
      err.status = response.status;
      throw err;
    }
    return response.json();
  },

  /**
   * List available OpenRouter models.
   */
  async listModels(query = '') {
    const url = new URL(`${API_BASE}/api/models`);
    if (query) url.searchParams.set('q', query);
    const response = await fetch(url.toString());
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to fetch models');
    }
    return response.json();
  },

  /**
   * Get leaderboard statistics.
   */
  async getLeaderboard(model = null, persona = null) {
    const url = new URL(`${API_BASE}/api/leaderboard`);
    if (model) url.searchParams.set('model', model);
    if (persona) url.searchParams.set('persona', persona);
    const response = await fetch(url.toString());
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to fetch leaderboard');
    }
    return response.json();
  },
};
