import { useState, useEffect } from 'react';
import { api } from '../api';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  currentConversation,
  onSelectConversation,
  onNewConversation,
  onReloadConversation,
  config,
  councilModels,
  chairmanModel,
  historyPolicy,
  onSettingsChange,
  theme,
  onToggleTheme,
  onPersonaCompareChange,
}) {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [maxTurns, setMaxTurns] = useState(historyPolicy?.max_turns || 6);
  const [maxTokens, setMaxTokens] = useState(historyPolicy?.max_tokens || 4000);
  const [selectedCouncil, setSelectedCouncil] = useState(() => {
    // Try to load from localStorage first, then fall back to props
    try {
      const stored = localStorage.getItem('llm-council-selected-models');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
    return councilModels || [];
  });
  const [selectedChair, setSelectedChair] = useState(chairmanModel || '');
  const [modelQuery, setModelQuery] = useState('');
  const [modelsError, setModelsError] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applySuccess, setApplySuccess] = useState(false);
  const [personaApplySuccess, setPersonaApplySuccess] = useState(false);
  const [personaApplyError, setPersonaApplyError] = useState('');
  const [chairmanSearch, setChairmanSearch] = useState('');
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem('llm-council-mode');
    return stored || 'council';
  }); // 'council' | 'persona-compare'
  const [personaAssignments, setPersonaAssignments] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-persona-assignments');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [personaCompareModels, setPersonaCompareModels] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-persona-compare-models');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [personaModelFilter, setPersonaModelFilter] = useState('');

  useEffect(() => {
    setMaxTurns(historyPolicy?.max_turns || 6);
    setMaxTokens(historyPolicy?.max_tokens || 4000);
  }, [historyPolicy]);

  useEffect(() => {
    // Only update from props if we don't have persisted data
    if (selectedCouncil.length === 0 && councilModels && councilModels.length > 0) {
      setSelectedCouncil(councilModels);
    }
    setSelectedChair(chairmanModel || '');
  }, [councilModels, chairmanModel]);

  // Persist council model selections
  useEffect(() => {
    if (selectedCouncil.length > 0) {
      localStorage.setItem('llm-council-selected-models', JSON.stringify(selectedCouncil));
    }
  }, [selectedCouncil]);

  // Persist mode changes
  useEffect(() => {
    localStorage.setItem('llm-council-mode', mode);
  }, [mode]);

  // Persist persona assignments
  useEffect(() => {
    localStorage.setItem('llm-council-persona-assignments', JSON.stringify(personaAssignments));
  }, [personaAssignments]);

  // Persist persona compare model selection
  useEffect(() => {
    if (mode === 'persona-compare') {
      localStorage.setItem('llm-council-persona-compare-models', JSON.stringify(personaCompareModels));
    }
  }, [personaCompareModels, mode]);

  // Load persona assignments from conversation's persona_map
  // Merge with persisted assignments instead of overwriting
  useEffect(() => {
    if (currentConversation?.persona_map && personas.length > 0) {
      // Create a reverse lookup: system_prompt -> persona name
      const promptToPersona = {};
      personas.forEach(p => {
        promptToPersona[p.system_prompt] = p.name;
      });

      // Build personaAssignments from persona_map
      const conversationAssignments = {};
      Object.entries(currentConversation.persona_map).forEach(([modelId, systemPrompt]) => {
        const personaName = promptToPersona[systemPrompt];
        if (personaName) {
          conversationAssignments[modelId] = { personaName };
        }
      });
      
      // Merge with existing persisted assignments, prioritizing conversation ones
      setPersonaAssignments((prev) => ({
        ...prev,
        ...conversationAssignments,
      }));
      
      // Also update persona compare models if needed
      if (mode === 'persona-compare' && Object.keys(conversationAssignments).length > 0) {
        const modelIds = Object.keys(conversationAssignments);
        setPersonaCompareModels((prev) => {
          // Merge, keeping order from conversation
          const combined = [...new Set([...modelIds, ...prev])];
          return combined;
        });
      }
    }
  }, [currentConversation?.persona_map, personas, mode]);

  const fallbackModelsFromProps = () => {
    const base = [
      ...(config?.council_models || []),
      ...(councilModels || []),
      chairmanModel || '',
      config?.chairman_model || '',
    ].filter(Boolean);
    const unique = Array.from(new Set(base));
    return unique.map((id) => ({
      id,
      name: id,
      pricing: { prompt: null, completion: null },
      source: 'config',
    }));
  };

  const loadPersonas = async () => {
    try {
      const data = await api.listPersonas();
      setPersonas(data);
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  };

  const loadModels = async (query = '') => {
    setModelsLoading(true);
    setModelsError('');
    try {
      const data = await api.listModels(query);
      if (!data || data.length === 0) {
        const fallback = fallbackModelsFromProps();
        setAvailableModels(fallback);
        setModelsError(
          fallback.length
            ? 'Using configured models (catalog empty or blocked).'
            : 'Failed to fetch models. Check API key or network.'
        );
      } else {
        setAvailableModels(data);
        setModelsError('');
      }
    } catch (error) {
      console.error('Failed to fetch models list:', error);
      const fallback = fallbackModelsFromProps();
      if (fallback.length) {
        setAvailableModels(fallback);
        setModelsError('Using configured models (catalog unreachable).');
      } else {
        setModelsError('Failed to fetch models. Check API key or network.');
      }
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    loadPersonas();
    loadModels();
  }, []);

  // When config/council props arrive, ensure we have a fallback list
  useEffect(() => {
    if (availableModels.length === 0) {
      const fallback = fallbackModelsFromProps();
      if (fallback.length) {
        setAvailableModels(fallback);
        setModelsError((prev) =>
          prev ? prev : 'Using configured models (no catalog).'
        );
      }
    }
    setSelectedCouncil(councilModels || []);
    setSelectedChair(chairmanModel || '');
  }, [config, councilModels, chairmanModel]);

  const handleSavePersona = async () => {
    const name = prompt('Enter a name for this persona:');
    if (!name) return;

    try {
      await api.savePersona(name, systemPrompt);
      await loadPersonas();
      setSelectedPersona(name);
    } catch (error) {
      console.error('Failed to save persona:', error);
      alert('Failed to save persona');
    }
  };

  const handleDeletePersona = async () => {
    if (!selectedPersona) return;
    if (!confirm(`Delete persona "${selectedPersona}"?`)) return;

    try {
      await api.deletePersona(selectedPersona);
      await loadPersonas();
      setSelectedPersona('');
      setSystemPrompt('');
    } catch (error) {
      console.error('Failed to delete persona:', error);
      alert('Failed to delete persona');
    }
  };

  const handleApplyPersona = async () => {
    setPersonaApplyError('');
    setPersonaApplySuccess(false);
    let targetConversationId = currentConversationId;

    // If no conversation yet, create one so persona can be applied
    if (!targetConversationId) {
      targetConversationId = await onNewConversation(systemPrompt || null);
    }

    if (!targetConversationId) {
      setPersonaApplyError('Create a conversation first.');
      return;
    }

    const doUpdate = async (convId) => {
      return api.updateConversationSettings(convId, {
        system_prompt: systemPrompt || null,
      });
    };

    try {
      try {
        await doUpdate(targetConversationId);
      } catch (err) {
        if (err.status === 404) {
          // Auto-create and retry once
          const newId = await onNewConversation(systemPrompt || null);
          if (!newId) throw err;
          targetConversationId = newId;
          await doUpdate(newId);
        } else {
          throw err;
        }
      }
      setPersonaApplySuccess(true);
      setTimeout(() => setPersonaApplySuccess(false), 3000);
    } catch (error) {
      console.error('Failed to apply persona:', error);
      setPersonaApplyError(error.message || 'Failed to apply persona');
    }
  };

  const handleApplySettings = async () => {
    setApplyError('');
    setApplySuccess(false);
    let targetConversationId = currentConversationId;

    // If no conversation yet, create one so settings can be applied
    if (!targetConversationId) {
        targetConversationId = await onNewConversation(systemPrompt || null);
    }

    if (!targetConversationId) {
      setApplyError('Create a conversation first.');
      return;
    }

    const safeMaxTurns = Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : undefined;
    const safeMaxTokens = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : undefined;
    const historyPayload =
      safeMaxTurns || safeMaxTokens
        ? {
            ...(safeMaxTurns ? { max_turns: safeMaxTurns } : {}),
            ...(safeMaxTokens ? { max_tokens: safeMaxTokens } : {}),
          }
        : null;
    const doUpdate = async (convId) => {
      return api.updateConversationSettings(convId, {
          history_policy: historyPayload,
          council_models: selectedCouncil,
          chairman_model: selectedChair,
          system_prompt: systemPrompt || null,
      });
    };

    try {
      try {
        await doUpdate(targetConversationId);
      } catch (err) {
        if (err.status === 404) {
          // Auto-create and retry once
          const newId = await onNewConversation(systemPrompt || null);
          if (!newId) throw err;
          targetConversationId = newId;
          await doUpdate(newId);
        } else {
          throw err;
        }
      }
      onSettingsChange?.({
        historyPolicy: historyPayload || historyPolicy,
        councilModels: selectedCouncil,
        chairmanModel: selectedChair,
      });
      setApplySuccess(true);
    } catch (error) {
      console.error('Failed to apply settings:', error);
      setApplyError(error.message || 'Failed to apply settings');
    }
  };

  const toggleCouncilSelection = (modelId) => {
    setSelectedCouncil((prev) => {
      let updated;
      if (prev.includes(modelId)) {
        updated = prev.filter((m) => m !== modelId);
      } else {
        // Add in sorted order to maintain consistency
        updated = [...prev, modelId].sort((a, b) => a.localeCompare(b));
      }
      return updated;
    });
  };

  // If no council selected but we have models, preselect all as a sane default
  useEffect(() => {
    if (selectedCouncil.length === 0 && availableModels.length > 0) {
      setSelectedCouncil(availableModels.map((m) => m.id));
    }
  }, [availableModels]);

  const formatPrice = (value) => {
    if (value === null || value === undefined || value === '') return 'n/a';
    const str = String(value).trim();
    if (str.startsWith('$')) return str;
    return `$${str}`;
  };

  // Build the persona_map that will be used when sending messages in persona compare mode
  const buildPersonaMap = () => {
    if (mode !== 'persona-compare' || personaCompareModels.length === 0) {
      return null;
    }

    const personaLookup = personas.reduce((acc, p) => {
      acc[p.name] = p.system_prompt;
      return acc;
    }, {});

    const persona_map = {};
    personaCompareModels.forEach((modelId) => {
      const chosen = personaAssignments[modelId]?.personaName;
      if (chosen && personaLookup[chosen]) {
        persona_map[modelId] = personaLookup[chosen];
        // Also add mappings for alternate model ID formats
        const baseName = modelId.split('/').pop().split(':')[0];
        if (baseName !== modelId && !(baseName in persona_map)) {
          persona_map[baseName] = personaLookup[chosen];
        }
      }
    });

    return Object.keys(persona_map).length > 0 ? persona_map : null;
  };

  // Notify parent component of persona compare settings changes
  useEffect(() => {
    if (onPersonaCompareChange) {
      if (mode === 'persona-compare' && personaCompareModels.length > 0) {
        const personaMap = buildPersonaMap();
        onPersonaCompareChange({
          enabledModels: personaCompareModels,
          personaMap: personaMap,
        });
      } else {
        // Clear settings when not in persona compare mode
        onPersonaCompareChange(null);
      }
    }
  }, [mode, personaCompareModels, personaAssignments, personas, onPersonaCompareChange]);

  // Get models to show in persona compare - only show enabled models
  // If no models are explicitly selected, show none (user must select models first)
  const personaCompareDisplayModels = personaCompareModels.length > 0
    ? availableModels.filter((m) => personaCompareModels.includes(m.id))
    : [];

  // Filter models by search term
  const filteredPersonaModels = personaCompareDisplayModels.filter((m) => {
    if (!personaModelFilter) return true;
    const searchTerm = personaModelFilter.toLowerCase();
    return m.id.toLowerCase().includes(searchTerm) || 
           (m.name && m.name.toLowerCase().includes(searchTerm));
  });

  // Sort models by ID for consistent ordering
  const sortedPersonaModels = [...filteredPersonaModels].sort((a, b) => 
    a.id.localeCompare(b.id)
  );

  const personaComparePanel = (
    <div className="settings-panel">
      <label>Persona Compare (beta)</label>
      <p className="conversation-meta">
        Assign a saved persona per model, then apply to this chat.
      </p>
      
      {/* Model selector/search */}
      <div style={{ marginBottom: '12px' }}>
        <label>Select Models</label>
        <div className="model-search-row" style={{ marginBottom: '8px' }}>
          <input
            placeholder="Search/filter models..."
            value={personaModelFilter}
            onChange={(e) => setPersonaModelFilter(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <div className="model-listing" style={{ maxHeight: '120px', marginBottom: '8px' }}>
          {availableModels
            .filter((m) => {
              // Ensure we have a valid model with an ID
              if (!m || !m.id || typeof m.id !== 'string' || m.id.trim() === '') {
                return false;
              }
              if (!personaModelFilter) return true;
              const searchTerm = personaModelFilter.toLowerCase();
              return m.id.toLowerCase().includes(searchTerm) || 
                     (m.name && m.name.toLowerCase().includes(searchTerm));
            })
            .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
            .slice(0, 50)
            .map((m) => {
              const modelId = m.id || '';
              const isSelected = personaCompareModels.includes(modelId);
              return (
                <label key={modelId} className="model-row">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPersonaCompareModels((prev) => {
                          // Add in sorted order to maintain consistency
                          const updated = [...prev, modelId].sort((a, b) => a.localeCompare(b));
                          return updated;
                        });
                      } else {
                        setPersonaCompareModels((prev) => prev.filter((id) => id !== modelId));
                      }
                    }}
                  />
                  <span className="model-name" title={modelId}>{modelId}</span>
                </label>
              );
            })}
        </div>
      </div>

      {/* Enabled Models - Assign Personas Section */}
      <label style={{ marginTop: '16px', display: 'block' }}>Enabled Models - Assign Personas</label>
      {personaCompareModels.length === 0 ? (
        <div className="conversation-meta" style={{ marginTop: '8px' }}>
          Select models above to assign personas.
        </div>
      ) : (
        <div className="model-listing" style={{ maxHeight: 200, marginTop: '8px' }}>
          {sortedPersonaModels
            .slice(0, 50)
            .map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
                <span className="model-name" style={{ marginBottom: '4px' }}>{m.id}</span>
                <select
                  value={personaAssignments[m.id]?.personaName || ''}
                  onChange={(e) =>
                    setPersonaAssignments((prev) => ({
                      ...prev,
                      [m.id]: { personaName: e.target.value },
                    }))
                  }
                  style={{ width: '100%' }}
                >
                  <option value="">None</option>
                  {personas.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          {sortedPersonaModels.length === 0 && personaModelFilter && (
            <div className="conversation-meta">
              No enabled models match your search. Try a different filter.
            </div>
          )}
        </div>
      )}

      {/* Preview of what will run */}
      {personaCompareModels.length > 0 && (
        <div style={{ marginTop: '16px', marginBottom: '12px', padding: '12px', backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.05))', borderRadius: '4px', border: '1px solid var(--border, rgba(0,0,0,0.1))' }}>
          <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>Preview: Assigned Personas</label>
          <div style={{ fontSize: '0.9em', maxHeight: '150px', overflowY: 'auto' }}>
            {(() => {
              // Only show models that are enabled AND have personas assigned
              const assignedModels = personaCompareModels
                .filter((modelId) => {
                  const assignment = personaAssignments[modelId];
                  return assignment && assignment.personaName;
                })
                .sort((a, b) => a.localeCompare(b));

              if (assignedModels.length === 0) {
                return (
                  <div className="conversation-meta" style={{ fontStyle: 'italic' }}>
                    No personas assigned yet. Assign personas above to see preview.
                  </div>
                );
              }

              return assignedModels.map((modelId) => {
                const assignment = personaAssignments[modelId];
                const persona = personas.find((p) => p.name === assignment?.personaName);
                const model = availableModels.find((m) => m.id === modelId);
                const displayName = model?.name || modelId;

                return (
                  <div key={modelId} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border, rgba(0,0,0,0.1))' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>
                      {modelId}
                    </div>
                    <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      <strong>Persona:</strong> {assignment.personaName}
                    </div>
                    {persona && (
                      <div style={{ fontSize: '0.8em', color: 'var(--text-secondary)', fontStyle: 'italic', maxHeight: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {persona.system_prompt.substring(0, 100)}
                        {persona.system_prompt.length > 100 ? '...' : ''}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
      <button
        className="apply-btn"
        onClick={async () => {
          let targetConversationId = currentConversationId;
          setPersonaApplyError('');
          setPersonaApplySuccess(false);
          if (!targetConversationId) {
            targetConversationId = await onNewConversation(systemPrompt || null);
          }
          if (!targetConversationId) {
            setPersonaApplyError('Create a conversation first.');
            return;
          }
          try {
            const personaLookup = personas.reduce((acc, p) => {
              acc[p.name] = p.system_prompt;
              return acc;
            }, {});
            const persona_map = {};
            // Build persona_map using model IDs from personaCompareModels or selectedCouncil
            // Use personaCompareModels if we have them, otherwise fall back to selectedCouncil
            const modelsToUse = personaCompareModels.length > 0 ? personaCompareModels : selectedCouncil;
            
            // Build persona_map using model IDs - make sure we use the exact model IDs that will be sent to the backend
            modelsToUse.forEach((modelId) => {
              const chosen = personaAssignments[modelId]?.personaName;
              if (chosen && personaLookup[chosen]) {
                persona_map[modelId] = personaLookup[chosen];
              }
            });
            // Also add mappings for any alternate model ID formats (e.g., with/without prefixes)
            // This helps if model IDs are formatted differently when stored vs when used
            modelsToUse.forEach((modelId) => {
              const chosen = personaAssignments[modelId]?.personaName;
              if (chosen && personaLookup[chosen]) {
                // Extract base model name (e.g., "hermes-4-405b" from "nousresearch/hermes-4-405b" or "hermes-4-405b")
                const baseName = modelId.split('/').pop().split(':')[0];
                // Add mapping for base name if it's different and not already in map
                if (baseName !== modelId && !(baseName in persona_map)) {
                  persona_map[baseName] = personaLookup[chosen];
                }
              }
            });
            if (Object.keys(persona_map).length === 0) {
              setPersonaApplyError('Select at least one persona for a council model.');
              return;
            }
            await api.updateConversationSettings(targetConversationId, { persona_map });
            setPersonaApplySuccess(true);
            // Reload conversation to get updated persona_map
            if (onReloadConversation) {
              onReloadConversation(targetConversationId);
            }
          } catch (err) {
            setPersonaApplyError(err.message || 'Failed to apply personas');
          }
        }}
        disabled={modelsLoading}
      >
        Apply Personas to Current Conversation
      </button>
      {personaApplySuccess && <div className="conversation-meta" style={{ color: 'var(--accent)' }}>Personas applied.</div>}
      {personaApplyError && <div className="conversation-meta" style={{ color: 'tomato' }}>{personaApplyError}</div>}
    </div>
  );

  const handlePersonaChange = (e) => {
    const name = e.target.value;
    setSelectedPersona(name);
    if (name) {
      const persona = personas.find((p) => p.name === name);
      if (persona) {
        setSystemPrompt(persona.system_prompt);
      }
    } else {
      setSystemPrompt('');
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
        <div className="mode-toggle">
          <label>
            <input
              type="radio"
              name="mode"
              value="council"
              checked={mode === 'council'}
              onChange={() => setMode('council')}
            />{' '}
            Council Mode
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="persona-compare"
              checked={mode === 'persona-compare'}
              onChange={() => setMode('persona-compare')}
            />{' '}
            Persona Compare
          </label>
        </div>
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
        <div className="settings-toggle" onClick={() => setShowSettings(!showSettings)}>
          {showSettings ? '▼ Settings' : '▶ Settings'}
        </div>
      </div>

      {showSettings && mode === 'persona-compare' && personaComparePanel}
      
      {showSettings && mode === 'council' && (
        <div className="settings-panel">
          <label>Persona</label>
          <div className="persona-controls">
            <select value={selectedPersona} onChange={handlePersonaChange}>
              <option value="">Custom</option>
              {personas.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={handleSavePersona} title="Save Persona">
              💾
            </button>
            {selectedPersona && (
              <button className="icon-btn" onClick={handleDeletePersona} title="Delete Persona">
                🗑️
              </button>
            )}
            <button
              className="icon-btn"
              onClick={handleApplyPersona}
              title="Apply persona to current chat"
              style={{ minWidth: 32 }}
            >
              ⇢
            </button>
          </div>
          {personaApplySuccess && <div className="conversation-meta" style={{ color: 'var(--accent)' }}>Persona applied.</div>}
          {personaApplyError && <div className="conversation-meta" style={{ color: 'tomato' }}>{personaApplyError}</div>}


          <label>System Prompt</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              if (selectedPersona) setSelectedPersona('');
            }}
            placeholder="Optional system prompt..."
            rows={3}
          />

          <div className="settings-grid">
            <div>
              <label>Max Turns (history)</label>
              <input
                type="number"
                min="1"
                value={maxTurns}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxTurns(val);
                  onSettingsChange?.({ historyPolicy: { ...historyPolicy, max_turns: val } });
                }}
              />
            </div>
            <div>
              <label>Max Tokens (history)</label>
              <input
                type="number"
                min="500"
                step="500"
                value={maxTokens}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxTokens(val);
                  onSettingsChange?.({ historyPolicy: { ...historyPolicy, max_tokens: val } });
                }}
              />
            </div>
          </div>

          <div className="model-picker">
          <label>Chairman Model</label>
          <div className="model-search-row">
            <input
              placeholder="Search chairman..."
              value={chairmanSearch}
              onChange={(e) => setChairmanSearch(e.target.value)}
              list="chairman-models"
            />
            <datalist id="chairman-models">
              {availableModels.map((m) => (
                <option value={m.id} key={m.id} />
              ))}
            </datalist>
            <button
              onClick={() => {
                if (chairmanSearch) {
                  setSelectedChair(chairmanSearch);
                  onSettingsChange?.({ chairmanModel: chairmanSearch });
                }
              }}
              disabled={!chairmanSearch}
            >
              Set
            </button>
          </div>
          <select
            value={selectedChair}
            onChange={(e) => {
              setSelectedChair(e.target.value);
              onSettingsChange?.({ chairmanModel: e.target.value });
            }}
          >
            {[selectedChair, ...(availableModels.map((m) => m.id) || [])]
              .filter(Boolean)
              .filter((v, idx, arr) => arr.indexOf(v) === idx)
              .map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
          </select>
            <div className="model-search-row">
              <input
                placeholder="Search models (id/name)..."
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
              />
              <button onClick={() => loadModels(modelQuery)} disabled={modelsLoading}>
                {modelsLoading ? 'Loading' : 'Search'}
              </button>
              <button onClick={() => loadModels()} disabled={modelsLoading}>
                Refresh
              </button>
            </div>
            {modelsError && <div className="conversation-meta">{modelsError}</div>}
            <label className="council-label">Council Models</label>
            <div className="model-listing">
              {availableModels.slice(0, 50).map((model) => (
                <label key={model.id} className="model-row">
                  <input
                    type="checkbox"
                    checked={selectedCouncil.includes(model.id)}
                    onChange={() => toggleCouncilSelection(model.id)}
                  />
                  <span className="model-name">{model.id}</span>
                  <span className="model-price">
                    P: {formatPrice(model.pricing?.prompt)} | C: {formatPrice(model.pricing?.completion)} per MTok
                  </span>
                </label>
              ))}
              {!modelsLoading && availableModels.length === 0 && (
                <div className="conversation-meta">No models found.</div>
              )}
            </div>
          </div>

          <button className="apply-btn" onClick={handleApplySettings} disabled={modelsLoading}>
            Apply to Current Conversation
          </button>
          {applySuccess && <div className="conversation-meta" style={{ color: 'var(--accent)' }}>Applied.</div>}
          {applyError && <div className="conversation-meta" style={{ color: 'tomato' }}>{applyError}</div>}
        </div>
      )}

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
              <div className="conversation-title">
                {conv.title || 'New Conversation'}
              </div>
              <div className="conversation-meta">
                {conv.message_count} messages
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
