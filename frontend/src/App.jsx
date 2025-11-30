import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import SettingsPanel from './components/SettingsPanel';
import { api } from './api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [historyPolicy, setHistoryPolicy] = useState(null);
  const [councilModels, setCouncilModels] = useState([]);
  const [chairmanModel, setChairmanModel] = useState('');
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('llm-council-theme');
    return stored || 'light';
  });
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [personaCompareSettings, setPersonaCompareSettings] = useState(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);



  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConfig = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/config');
      const data = await response.json();
      setConfig(data);
      setCouncilModels(data.council_models || []);
      setChairmanModel(data.chairman_model || '');
      setHistoryPolicy(data.history_defaults || null);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const conv = await api.getConversation(id);
      // Only update if we got a valid conversation with messages array
      if (conv && conv.id && Array.isArray(conv.messages)) {
        setCurrentConversation(conv);
        if (conv?.models) {
          if (conv.models.council && conv.models.council.length) {
            setCouncilModels(conv.models.council);
          } else if (config?.council_models) {
            setCouncilModels(config.council_models);
          }
          if (conv.models.chairman) {
            setChairmanModel(conv.models.chairman);
          } else if (config?.chairman_model) {
            setChairmanModel(config.chairman_model);
          }
        }
        if (conv?.history_policy) {
          setHistoryPolicy(conv.history_policy);
        }
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      // Don't clear the conversation on error - keep what we have
    }
  };

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadConfig();
  }, []);

  // Apply theme to body
  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem('llm-council-theme', theme);
  }, [theme]);

  // Sidebar drag resize handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(e.clientX, 220), 500);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const handleNewConversation = async (systemPrompt) => {
    try {
      const newConv = await api.createConversation(systemPrompt, {
        historyPolicy,
        councilModels,
        chairmanModel,
      });
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
      return newConv.id;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleSendMessage = async (content, options = {}) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      // Create a partial assistant message that will be updated progressively
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      // Add the partial assistant message
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      // Determine which models and persona_map to use
      // If persona compare mode is active, use enabled models and their persona_map
      let modelsToUse = councilModels;
      let personaMapToUse = currentConversation?.persona_map || null;
      let chairmanModelToUse = chairmanModel;
      
      if (personaCompareSettings && personaCompareSettings.enabledModels && personaCompareSettings.enabledModels.length > 0) {
        // Use the enabled models from persona compare mode
        modelsToUse = personaCompareSettings.enabledModels;
        // Use the persona_map from persona compare settings, not from conversation
        personaMapToUse = personaCompareSettings.personaMap || null;
        // Use chairman model from persona compare settings if set
        if (personaCompareSettings.chairmanModel) {
          chairmanModelToUse = personaCompareSettings.chairmanModel;
        }
        console.log('Using persona compare settings:', { modelsToUse, personaMapToUse, chairmanModelToUse });
      } else {
        // Fall back to conversation settings or default
        modelsToUse = councilModels;
        personaMapToUse = currentConversation?.persona_map || null;
        chairmanModelToUse = chairmanModel;
      }

      // Send message with streaming
      await api.sendMessageStream(
        currentConversationId,
        content,
        (eventType, event) => {
          switch (eventType) {
          case 'stage1_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage1 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage1 = event.data;
              lastMsg.loading.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage2 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage2 = event.data;
              lastMsg.metadata = event.metadata;
              lastMsg.loading.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage3 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage3 = event.data;
              lastMsg.loading.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list
            loadConversations();
            // Reload current conversation to get saved message from server
            // Use setTimeout to avoid race condition with state updates
            // Don't reload immediately - the conversation state is already updated via streaming
            // Only reload if we need to sync with server (e.g., after retry)
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            // Update UI to show error in the last message
            // IMPORTANT: Preserve any Stage 1/2/3 data that was already received
            setCurrentConversation((prev) => {
              if (!prev) return prev;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.role === 'assistant') {
                // Preserve existing stage data - don't clear it
                lastMsg.error = event.message || 'An error occurred';
                lastMsg.loading = { stage1: false, stage2: false, stage3: false };
                // If we have Stage 1 data but no error flag, keep it visible
              }
              return { ...prev, messages };
            });
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      },
      {
        historyPolicy,
        councilModels: modelsToUse,
        chairmanModel: chairmanModelToUse,
        personaMap: personaMapToUse,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Only remove optimistic messages if we haven't received any stage data yet
      // If we have Stage 1 data, preserve it
      setCurrentConversation((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        const lastMsg = messages[messages.length - 1];
        // If we have Stage 1 data, keep the messages and just mark as error
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.stage1) {
          lastMsg.error = `Connection error: ${error.message}`;
          lastMsg.loading = { stage1: false, stage2: false, stage3: false };
          return { ...prev, messages };
        }
        // Otherwise, remove the optimistic messages
        return {
          ...prev,
          messages: messages.slice(0, -2),
        };
      });
      setIsLoading(false);
    }
  };

  return (
    <div className={`app ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        currentConversation={currentConversation}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onReloadConversation={loadConversation}
        config={config}
        councilModels={councilModels}
        chairmanModel={chairmanModel}
        historyPolicy={historyPolicy}
        theme={theme}
        style={{ width: sidebarWidth }}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onSettingsChange={(settings) => {
          if (settings.historyPolicy !== undefined) setHistoryPolicy(settings.historyPolicy);
          if (settings.councilModels !== undefined) setCouncilModels(settings.councilModels);
          if (settings.chairmanModel !== undefined) setChairmanModel(settings.chairmanModel);
        }}
        onPersonaCompareChange={(settings) => {
          setPersonaCompareSettings(settings);
        }}
        onConversationDeleted={(deletedId) => {
          // Remove from conversations list
          setConversations(convs => convs.filter(c => c.id !== deletedId));
          // If it was the current conversation, clear it
          if (currentConversationId === deletedId) {
            setCurrentConversationId(null);
            setCurrentConversation(null);
          }
          // Reload conversations list
          loadConversations();
        }}
      />
      <div
        className="sidebar-resizer"
        onMouseDown={() => setIsResizing(true)}
        role="separator"
        aria-orientation="vertical"
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onMessageDeleted={() => {
          if (currentConversationId) {
            loadConversation(currentConversationId);
          }
        }}
      />
      <button
        className={`settings-toggle-btn ${showSettingsPanel ? 'settings-open' : ''}`}
        onClick={() => setShowSettingsPanel(!showSettingsPanel)}
        title={showSettingsPanel ? 'Hide Settings' : 'Show Settings'}
      >
        {showSettingsPanel ? '◀' : '▶'}
      </button>
      {showSettingsPanel && (
        <>
          <div
            className="settings-resizer"
            onMouseDown={() => setIsResizing(true)}
            role="separator"
            aria-orientation="vertical"
          />
          <SettingsPanel
            currentConversationId={currentConversationId}
            currentConversation={currentConversation}
            onNewConversation={handleNewConversation}
            onReloadConversation={loadConversation}
            config={config}
            councilModels={councilModels}
            chairmanModel={chairmanModel}
            historyPolicy={historyPolicy}
            onSettingsChange={(settings) => {
              if (settings.historyPolicy !== undefined) setHistoryPolicy(settings.historyPolicy);
              if (settings.councilModels !== undefined) setCouncilModels(settings.councilModels);
              if (settings.chairmanModel !== undefined) setChairmanModel(settings.chairmanModel);
            }}
            onPersonaCompareChange={(settings) => {
              setPersonaCompareSettings(settings);
            }}
          />
        </>
      )}
    </div>
  );
}

export default App;
