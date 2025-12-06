import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import Leaderboard from './Leaderboard';
import Settings from './Settings';
import ProgressBar from './ProgressBar';
import { formatCost, formatTokens } from '../utils/costUtils';
import { api } from '../api';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
  onMessageDeleted,
  onConversationUpdate,
  config,
  councilModels,
  chairmanModel,
  historyPolicy,
  onSettingsChange,
  onPersonaCompareChange,
  onModeChange,
  onNewConversation,
  onReloadConversation,
}) {
  const [input, setInput] = useState('');
  const [viewMode, setViewMode] = useState('chat'); // 'chat', 'leaderboard', or 'settings'
  const [localConversation, setLocalConversation] = useState(conversation);
  const messagesEndRef = useRef(null);

  // Sync local conversation with prop, but preserve local state if prop is temporarily null
  useEffect(() => {
    if (conversation) {
      setLocalConversation(conversation);
    }
    // Don't clear localConversation if conversation becomes null temporarily
  }, [conversation]);

  // Compute display conversation (use local if available, otherwise prop)
  const displayConversation = localConversation || conversation;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (displayConversation && displayConversation.messages) {
      scrollToBottom();
    }
  }, [displayConversation]);

  // Calculate total conversation cost
  const [totalConversationCost, setTotalConversationCost] = useState(null);
  const [conversationTokens, setConversationTokens] = useState(null);

  useEffect(() => {
    if (displayConversation?.id) {
      const calculateTotal = async () => {
        try {
          const costData = await api.getConversationCosts(displayConversation.id);
          setTotalConversationCost(costData.total_cost);
          setConversationTokens(costData.total_tokens);
        } catch (error) {
          console.error('Failed to load conversation costs:', error);
          // Calculate from messages if API fails
          let total = 0;
          let tokens = { prompt: 0, completion: 0, total: 0 };
          if (displayConversation.messages) {
            displayConversation.messages.forEach((msg) => {
              if (msg.role === 'assistant' && msg.metadata?.costs) {
                total += msg.metadata.costs.turn_cost || 0;
                if (msg.metadata.costs.turn_tokens) {
                  tokens.prompt += msg.metadata.costs.turn_tokens.prompt || 0;
                  tokens.completion += msg.metadata.costs.turn_tokens.completion || 0;
                  tokens.total += msg.metadata.costs.turn_tokens.total || 0;
                }
              }
            });
          }
          setTotalConversationCost(total);
          setConversationTokens(tokens);
        }
      };
      calculateTotal();
    } else {
      setTotalConversationCost(null);
      setConversationTokens(null);
    }
  }, [displayConversation?.id, displayConversation?.messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!displayConversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>Welcome to LLM Council</h2>
          <p>Create a new conversation to get started</p>
        </div>
      </div>
    );
  }

  const handleRedo = (assistantIndex) => {
    if (!conversation || !conversation.messages) return;
    // Find the nearest user message before this assistant message
    let userContent = null;
    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
      const m = conversation.messages[i];
      if (m.role === 'user' && m.content) {
        userContent = m.content;
        break;
      }
    }
    if (userContent) {
      onSendMessage(userContent, { redo: true });
    }
  };

  const handleCopyText = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleDeleteMessage = async (messageIndex) => {
    if (!conversation?.id) return;
    
    if (!confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
      return;
    }

    try {
      await api.deleteMessage(conversation.id, messageIndex);
      // Reload conversation after deletion
      if (onMessageDeleted) {
        onMessageDeleted();
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message: ' + (error.message || 'Unknown error'));
    }
  };

  const handleRetryStage = async (messageIndex, stage) => {
    if (!localConversation?.id) return;

    try {
      // Set loading state for the specific stage
      setLocalConversation((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        const msg = messages[messageIndex];
        if (msg && msg.role === 'assistant') {
          if (!msg.loading) msg.loading = {};
          msg.loading[`stage${stage}`] = true;
        }
        return { ...prev, messages };
      });

      const result = await api.retryStage(localConversation.id, messageIndex, stage);
      
      // Update the message with the new stage result
      setLocalConversation((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        const msg = messages[messageIndex];
        if (msg && msg.role === 'assistant') {
          if (stage === 1) {
            msg.stage1 = result.data;
          } else if (stage === 2) {
            msg.stage2 = result.data;
            if (result.metadata) {
              msg.metadata = { ...msg.metadata, ...result.metadata };
            }
          } else if (stage === 3) {
            msg.stage3 = result.data;
          }
          if (msg.loading) {
            msg.loading[`stage${stage}`] = false;
          }
        }
        return { ...prev, messages };
      });

      // Reload conversation to get updated data from server
      // Use setTimeout to avoid race condition with state updates
      if (onMessageDeleted) {
        setTimeout(() => {
          onMessageDeleted();
        }, 100);
      }
    } catch (error) {
      console.error('Failed to retry stage:', error);
      alert('Failed to retry stage: ' + (error.message || 'Unknown error'));
      
      // Clear loading state on error
      setLocalConversation((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        const msg = messages[messageIndex];
        if (msg && msg.role === 'assistant' && msg.loading) {
          msg.loading[`stage${stage}`] = false;
        }
        return { ...prev, messages };
      });
    }
  };

  // Show leaderboard view
  if (viewMode === 'leaderboard') {
    return (
      <div className="chat-interface">
        <div className="view-header">
          <div className="view-tabs">
            <button
              className={`view-tab ${viewMode === 'chat' ? 'active' : ''}`}
              onClick={() => setViewMode('chat')}
            >
              Chat
            </button>
            <button
              className={`view-tab ${viewMode === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setViewMode('leaderboard')}
            >
              Leaderboard
            </button>
            <button
              className={`view-tab ${viewMode === 'settings' ? 'active' : ''}`}
              onClick={() => setViewMode('settings')}
            >
              Settings
            </button>
          </div>
        </div>
        <div className="leaderboard-container">
          <Leaderboard />
        </div>
      </div>
    );
  }

  // Show settings view
  if (viewMode === 'settings') {
    return (
      <div className="chat-interface">
        <div className="view-header">
          <div className="view-tabs">
            <button
              className={`view-tab ${viewMode === 'chat' ? 'active' : ''}`}
              onClick={() => setViewMode('chat')}
            >
              Chat
            </button>
            <button
              className={`view-tab ${viewMode === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setViewMode('leaderboard')}
            >
              Leaderboard
            </button>
            <button
              className={`view-tab ${viewMode === 'settings' ? 'active' : ''}`}
              onClick={() => setViewMode('settings')}
            >
              Settings
            </button>
          </div>
        </div>
        <div className="settings-container">
          <Settings
            currentConversationId={conversation?.id}
            currentConversation={conversation}
            onNewConversation={onNewConversation}
            onReloadConversation={onReloadConversation}
            config={config}
            councilModels={councilModels}
            chairmanModel={chairmanModel}
            historyPolicy={historyPolicy}
            onSettingsChange={onSettingsChange}
            onPersonaCompareChange={onPersonaCompareChange}
            onModeChange={onModeChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="view-header">
        <div className="view-tabs">
          <button
            className={`view-tab ${viewMode === 'chat' ? 'active' : ''}`}
            onClick={() => setViewMode('chat')}
          >
            Chat
          </button>
          <button
            className={`view-tab ${viewMode === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setViewMode('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            className={`view-tab ${viewMode === 'settings' ? 'active' : ''}`}
            onClick={() => setViewMode('settings')}
          >
            Settings
          </button>
        </div>
        {displayConversation && (
          <div className="conversation-cost-header">
            <span className="conversation-cost-label">Total:</span>
            <span className="conversation-cost-value">
              {totalConversationCost !== null ? formatCost(totalConversationCost) : 'Calculating...'}
            </span>
            {conversationTokens && conversationTokens.total > 0 && (
              <span className="conversation-cost-tokens">
                ({formatTokens(conversationTokens.total)} tokens)
              </span>
            )}
          </div>
        )}
      </div>
      <div className="messages-container">
        {!displayConversation || !displayConversation.messages || displayConversation.messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start a conversation</h2>
            <p>Ask a question to consult the LLM Council</p>
          </div>
        ) : (
          displayConversation.messages.map((msg, index) => (
            <div key={index} className="message-group">
              {msg.role === 'user' ? (
                <div className="user-message">
                  <div className="message-header">
                    <div className="message-label">You</div>
                    <button
                      className="message-delete-btn"
                      onClick={() => handleDeleteMessage(index)}
                      title="Delete this message"
                    >
                      🗑️
                    </button>
                  </div>
                  <div className="message-content">
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="assistant-message">
                  <div className="message-header">
                    <div className="message-label">LLM Council</div>
                    <button
                      className="message-delete-btn"
                      onClick={() => handleDeleteMessage(index)}
                      title="Delete this message"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Council Rules/System Prompt Info - Show for latest message */}
                  {displayConversation.messages && index === displayConversation.messages.length - 1 && (displayConversation.system_prompt || (displayConversation.persona_map && Object.keys(displayConversation.persona_map).length > 0)) && (
                    <div className="council-rules">
                      <details>
                        <summary className="council-rules-summary">
                          <span>📋 Council Rules & System Prompt</span>
                        </summary>
                        <div className="council-rules-content">
                          {displayConversation.system_prompt && (
                            <div className="system-prompt-display">
                              <strong>System Prompt:</strong>
                              <pre>{displayConversation.system_prompt}</pre>
                            </div>
                          )}
                          {displayConversation.persona_map && Object.keys(displayConversation.persona_map).length > 0 && (
                            <div className="persona-map-display">
                              <strong>Per-Model Personas:</strong>
                              <ul>
                                {Object.entries(displayConversation.persona_map).map(([modelId, prompt]) => {
                                  const personaName = prompt.substring(0, 50);
                                  return (
                                    <li key={modelId}>
                                      <code>{modelId.split('/').pop() || modelId}</code>: {personaName}
                                      {prompt.length > 50 ? '...' : ''}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {(msg.loading?.stage1 || msg.loading?.stage2 || msg.loading?.stage3) && (
                    <ProgressBar 
                      progress={msg.progress} 
                      isLoading={msg.loading?.stage1 || msg.loading?.stage2 || msg.loading?.stage3}
                    />
                  )}

                  {/* Stage 1 */}
                  {msg.loading?.stage1 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>Running Stage 1: Collecting individual responses...</span>
                    </div>
                  )}
                  {msg.stage1 && (
                    <Stage1
                      responses={msg.stage1}
                      onRedo={() => handleRetryStage(index, 1)}
                      onCopy={(text) => handleCopyText(text)}
                      costs={msg.metadata?.costs?.stage1}
                    />
                  )}

                  {/* Stage 2 */}
                  {msg.loading?.stage2 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>Running Stage 2: Peer rankings...</span>
                    </div>
                  )}
                  {msg.stage2 && (
                    <Stage2
                      rankings={msg.stage2}
                      labelToModel={msg.metadata?.label_to_model}
                      aggregateRankings={msg.metadata?.aggregate_rankings}
                      onRedo={() => handleRetryStage(index, 2)}
                      onCopy={(text) => handleCopyText(text)}
                      costs={msg.metadata?.costs?.stage2}
                    />
                  )}

                  {/* Stage 3 - Final Synthesis (shown prominently) */}
                  {msg.loading?.stage3 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>Running Stage 3: Final synthesis...</span>
                    </div>
                  )}
                  {msg.stage3 && (
                    <Stage3
                      finalResponse={msg.stage3}
                      onRedo={() => handleRetryStage(index, 3)}
                      onCopy={(text) => handleCopyText(text)}
                      costs={msg.metadata?.costs?.stage3}
                    />
                  )}

                  {/* Turn Cost Summary */}
                  {msg.metadata?.costs?.turn_cost !== undefined && (
                    <div className="turn-cost-summary">
                      <div className="turn-cost-header">
                        <span className="turn-cost-label">Turn Cost:</span>
                        <span className="turn-cost-value">{formatCost(msg.metadata.costs.turn_cost)}</span>
                      </div>
                      {msg.metadata.costs.turn_tokens && (
                        <div className="turn-cost-tokens">
                          {formatTokens(msg.metadata.costs.turn_tokens.prompt)} prompt + {formatTokens(msg.metadata.costs.turn_tokens.completion)} completion = {formatTokens(msg.metadata.costs.turn_tokens.total)} total tokens
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Consulting the council...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <textarea
          className="message-input"
          placeholder="Ask your question... (Shift+Enter for new line, Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={3}
        />
        <button
          type="submit"
          className="send-button"
          disabled={!input.trim() || isLoading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
