import { useState } from 'react';
import { api } from '../api';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  theme,
  onToggleTheme,
  onConversationDeleted,
}) {
  const [systemPrompt, setSystemPrompt] = useState('');

  const handleDeleteConversation = async (e, conversationId) => {
    e.stopPropagation(); // Prevent selecting the conversation when clicking delete
    
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return;
    }

    try {
      await api.deleteConversation(conversationId);
      if (onConversationDeleted) {
        onConversationDeleted(conversationId);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('Failed to delete conversation: ' + (error.message || 'Unknown error'));
    }
  };


  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>LLM Council</h1>
        <button
          className="new-conversation-btn"
          onClick={() => onNewConversation(systemPrompt)}
        >
          + New Conversation
        </button>
        <div className="theme-toggle">
          <label>
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={onToggleTheme}
            />{' '}
            Dark mode
          </label>
        </div>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="no-conversations">No conversations yet</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${conv.id === currentConversationId ? 'active' : ''
                }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="conversation-content">
                <div className="conversation-title">
                  {conv.title || 'New Conversation'}
                </div>
                <div className="conversation-meta">
                  {conv.message_count} messages
                </div>
              </div>
              <button
                className="conversation-delete-btn"
                onClick={(e) => handleDeleteConversation(e, conv.id)}
                title="Delete conversation"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
