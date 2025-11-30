import { useState, useEffect } from 'react';
import { api } from '../api';
import './SettingsPanel.css';

export default function SettingsPanel({
  currentConversationId,
  currentConversation,
  onNewConversation,
  onReloadConversation,
  config,
  councilModels,
  chairmanModel,
  historyPolicy,
  onSettingsChange,
  onPersonaCompareChange,
}) {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [maxTurns, setMaxTurns] = useState(historyPolicy?.max_turns || 6);
  const [maxTokens, setMaxTokens] = useState(historyPolicy?.max_tokens || 4000);
  const [selectedCouncil, setSelectedCouncil] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-selected-models');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
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
  });
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
  const [chairmanPersona, setChairmanPersona] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-chairman-persona');
      return stored ? JSON.parse(stored) : '';
    } catch {
      return '';
    }
  });
  const [personaCompareChairman, setPersonaCompareChairman] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-persona-compare-chairman');
      return stored ? JSON.parse(stored) : selectedChair || chairmanModel || '';
    } catch {
      return selectedChair || chairmanModel || '';
    }
  });
  const [chairmanSearchPersona, setChairmanSearchPersona] = useState('');

  useEffect(() => {
    setMaxTurns(historyPolicy?.max_turns || 6);
    setMaxTokens(historyPolicy?.max_tokens || 4000);
  }, [historyPolicy]);

  useEffect(() => {
    if (selectedCouncil.length === 0 && councilModels && councilModels.length > 0) {
      setSelectedCouncil(councilModels);
    }
    setSelectedChair(chairmanModel || '');
  }, [councilModels, chairmanModel]);

  useEffect(() => {
    if (selectedCouncil.length > 0) {
      localStorage.setItem('llm-council-selected-models', JSON.stringify(selectedCouncil));
    }
  }, [selectedCouncil]);

  useEffect(() => {
    localStorage.setItem('llm-council-mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('llm-council-persona-assignments', JSON.stringify(personaAssignments));
  }, [personaAssignments]);

  useEffect(() => {
    if (mode === 'persona-compare') {
      localStorage.setItem('llm-council-persona-compare-models', JSON.stringify(personaCompareModels));
    }
  }, [personaCompareModels, mode]);

  useEffect(() => {
    if (mode === 'persona-compare' && chairmanPersona) {
      localStorage.setItem('llm-council-chairman-persona', JSON.stringify(chairmanPersona));
    }
  }, [chairmanPersona, mode]);

  useEffect(() => {
    if (mode === 'persona-compare' && personaCompareChairman) {
      localStorage.setItem('llm-council-persona-compare-chairman', JSON.stringify(personaCompareChairman));
    }
  }, [personaCompareChairman, mode]);

  useEffect(() => {
    if (mode === 'persona-compare' && selectedChair && !personaCompareChairman) {
      setPersonaCompareChairman(selectedChair);
    }
  }, [mode, selectedChair]);

  useEffect(() => {
    if (currentConversation?.persona_map && personas.length > 0) {
      const promptToPersona = {};
      personas.forEach(p => {
        promptToPersona[p.system_prompt] = p.name;
      });

      const conversationAssignments = {};
      Object.entries(currentConversation.persona_map).forEach(([modelId, systemPrompt]) => {
        const personaName = promptToPersona[systemPrompt];
        if (personaName) {
          conversationAssignments[modelId] = { personaName };
        }
      });
      
      setPersonaAssignments((prev) => ({
        ...prev,
        ...conversationAssignments,
      }));
      
      if (mode === 'persona-compare' && Object.keys(conversationAssignments).length > 0) {
        const modelIds = Object.keys(conversationAssignments);
        setPersonaCompareModels((prev) => {
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
        updated = [...prev, modelId].sort((a, b) => a.localeCompare(b));
      }
      return updated;
    });
  };

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
        const baseName = modelId.split('/').pop().split(':')[0];
        if (baseName !== modelId && !(baseName in persona_map)) {
          persona_map[baseName] = personaLookup[chosen];
        }
      }
    });

    return Object.keys(persona_map).length > 0 ? persona_map : null;
  };

  useEffect(() => {
    if (onPersonaCompareChange) {
      if (mode === 'persona-compare' && personaCompareModels.length > 0) {
        const personaMap = buildPersonaMap();
        onPersonaCompareChange({
          enabledModels: personaCompareModels,
          personaMap: personaMap,
          chairmanModel: personaCompareChairman,
        });
      } else {
        onPersonaCompareChange(null);
      }
    }
  }, [mode, personaCompareModels, personaAssignments, personas, personaCompareChairman, onPersonaCompareChange]);

  const personaCompareDisplayModels = personaCompareModels.length > 0
    ? availableModels.filter((m) => personaCompareModels.includes(m.id))
    : [];

  const filteredPersonaModels = personaCompareDisplayModels.filter((m) => {
    if (!personaModelFilter) return true;
    const searchTerm = personaModelFilter.toLowerCase();
    return m.id.toLowerCase().includes(searchTerm) || 
           (m.name && m.name.toLowerCase().includes(searchTerm));
  });

  const sortedPersonaModels = [...filteredPersonaModels].sort((a, b) => 
    a.id.localeCompare(b.id)
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

  const personaComparePanel = (
    <div className="settings-panel-content">
      <label>Persona Compare (beta)</label>
      <p className="conversation-meta">
        Assign a saved persona per model, then apply to this chat.
      </p>
      
      <div className="persona-section">
        <label>Select Models</label>
        <div className="model-search-row">
          <input
            placeholder="Search/filter models..."
            value={personaModelFilter}
            onChange={(e) => setPersonaModelFilter(e.target.value)}
            className="model-search-input"
          />
        </div>
        <div className="model-listing persona-model-selector">
          {availableModels
            .filter((m) => {
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

      <label className="persona-section-label" style={{ marginTop: '16px' }}>Enabled Models - Assign Personas</label>
      {personaCompareModels.length === 0 ? (
        <div className="conversation-meta persona-empty-hint">
          Select models above to assign personas.
        </div>
      ) : (
        <div className="model-listing persona-assignments">
          {sortedPersonaModels
            .slice(0, 50)
            .map((m) => (
              <div key={m.id} className="persona-assignment-item">
                <span className="model-name persona-model-name">{m.id}</span>
                <select
                  value={personaAssignments[m.id]?.personaName || ''}
                  onChange={(e) =>
                    setPersonaAssignments((prev) => ({
                      ...prev,
                      [m.id]: { personaName: e.target.value },
                    }))
                  }
                  className="persona-select"
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

      <div className="persona-section">
        <label className="persona-section-label">Chairman/Leader Model</label>
        <div className="model-search-row">
          <input
            placeholder="Search chairman model..."
            value={chairmanSearchPersona}
            onChange={(e) => setChairmanSearchPersona(e.target.value)}
            list="chairman-models-persona"
            className="model-search-input"
          />
          <datalist id="chairman-models-persona">
            {availableModels.map((m) => (
              <option value={m.id} key={m.id} />
            ))}
          </datalist>
          <button
            onClick={() => {
              if (chairmanSearchPersona) {
                setPersonaCompareChairman(chairmanSearchPersona);
                setChairmanSearchPersona('');
              }
            }}
            disabled={!chairmanSearchPersona}
            className="model-search-button"
          >
            Set
          </button>
        </div>
        <select
          value={personaCompareChairman}
          onChange={(e) => setPersonaCompareChairman(e.target.value)}
          className="persona-select"
        >
          <option value="">Select chairman model...</option>
          {[personaCompareChairman, ...availableModels.map((m) => m.id)]
            .filter(Boolean)
            .filter((v, idx, arr) => arr.indexOf(v) === idx)
            .map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
        </select>
        <p className="conversation-meta persona-hint">
          Select the model that will synthesize the final answer (Stage 3).
        </p>
      </div>

      <div className="persona-section">
        <label className="persona-section-label">Chairman/Leader Persona</label>
        <select
          value={chairmanPersona}
          onChange={(e) => setChairmanPersona(e.target.value)}
          className="persona-select"
        >
          <option value="">None (use default system prompt)</option>
          {personas.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="conversation-meta persona-hint">
          Assign a persona to the chairman model that synthesizes the final answer (Stage 3).
        </p>
      </div>

      {personaCompareModels.length > 0 && (
        <div className="persona-preview-container">
          <label className="persona-preview-label">Preview: Assigned Personas</label>
          <div className="persona-preview-content">
            {(() => {
              const assignedModels = personaCompareModels
                .filter((modelId) => {
                  const assignment = personaAssignments[modelId];
                  return assignment && assignment.personaName;
                })
                .sort((a, b) => a.localeCompare(b));

              if (assignedModels.length === 0) {
                return (
                  <div className="conversation-meta persona-preview-empty">
                    No personas assigned yet. Assign personas above to see preview.
                  </div>
                );
              }

              const previewItems = assignedModels.map((modelId) => {
                const assignment = personaAssignments[modelId];
                const persona = personas.find((p) => p.name === assignment?.personaName);

                return (
                  <div key={modelId} className="persona-preview-item">
                    <div className="persona-preview-model">
                      {modelId}
                    </div>
                    <div className="persona-preview-persona-name">
                      <strong>Persona:</strong> {assignment.personaName}
                    </div>
                    {persona && (
                      <div className="persona-preview-prompt">
                        {persona.system_prompt.substring(0, 100)}
                        {persona.system_prompt.length > 100 ? '...' : ''}
                      </div>
                    )}
                  </div>
                );
              });

              if (personaCompareChairman || chairmanPersona) {
                const chairmanPersonaObj = chairmanPersona ? personas.find((p) => p.name === chairmanPersona) : null;
                previewItems.push(
                  <div key="chairman" className="persona-preview-item persona-preview-chairman">
                    <div className="persona-preview-chairman-title">
                      Chairman/Leader
                    </div>
                    {personaCompareChairman && (
                      <div className="persona-preview-persona-name">
                        <strong>Model:</strong> {personaCompareChairman}
                      </div>
                    )}
                    {chairmanPersona && (
                      <div className="persona-preview-persona-name">
                        <strong>Persona:</strong> {chairmanPersona}
                      </div>
                    )}
                    {chairmanPersonaObj && (
                      <div className="persona-preview-prompt">
                        {chairmanPersonaObj.system_prompt.substring(0, 100)}
                        {chairmanPersonaObj.system_prompt.length > 100 ? '...' : ''}
                      </div>
                    )}
                  </div>
                );
              }

              return previewItems;
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
            const modelsToUse = personaCompareModels.length > 0 ? personaCompareModels : selectedCouncil;
            
            modelsToUse.forEach((modelId) => {
              const chosen = personaAssignments[modelId]?.personaName;
              if (chosen && personaLookup[chosen]) {
                persona_map[modelId] = personaLookup[chosen];
              }
            });
            modelsToUse.forEach((modelId) => {
              const chosen = personaAssignments[modelId]?.personaName;
              if (chosen && personaLookup[chosen]) {
                const baseName = modelId.split('/').pop().split(':')[0];
                if (baseName !== modelId && !(baseName in persona_map)) {
                  persona_map[baseName] = personaLookup[chosen];
                }
              }
            });
            
            if (chairmanPersona && personaLookup[chairmanPersona]) {
              const chairmanModelId = personaCompareChairman || selectedChair || chairmanModel || config?.chairman_model;
              if (chairmanModelId) {
                persona_map[chairmanModelId] = personaLookup[chairmanPersona];
                const baseName = chairmanModelId.split('/').pop().split(':')[0];
                if (baseName !== chairmanModelId && !(baseName in persona_map)) {
                  persona_map[baseName] = personaLookup[chairmanPersona];
                }
              }
            }
            
            if (Object.keys(persona_map).length === 0 && !personaCompareChairman) {
              setPersonaApplyError('Select at least one persona for a council model or chairman, or select a chairman model.');
              return;
            }
            const updatePayload = { persona_map };
            if (personaCompareChairman) {
              updatePayload.chairman_model = personaCompareChairman;
            }
            await api.updateConversationSettings(targetConversationId, updatePayload);
            setPersonaApplySuccess(true);
            if (personaCompareChairman && onSettingsChange) {
              onSettingsChange({ chairmanModel: personaCompareChairman });
            }
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

  const councilModePanel = (
    <div className="settings-panel-content">
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
  );

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2>Settings</h2>
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
      </div>
      <div className="settings-panel-body">
        {mode === 'persona-compare' ? personaComparePanel : councilModePanel}
      </div>
    </div>
  );
}

