import { useState, useEffect } from 'react';
import { api } from '../api';
import './Settings.css';

export default function Settings({
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
  onModeChange,
}) {
  const [activeTab, setActiveTab] = useState('mode'); // 'mode', 'ranking', 'chairman'
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem('llm-council-mode');
    return stored || 'council';
  });
  
  // Persona management
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  
  // Model management
  const [availableModels, setAvailableModels] = useState([]);
  const [modelQuery, setModelQuery] = useState('');
  const [modelsError, setModelsError] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  
  // Council Mode settings
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
  const [chairmanSearch, setChairmanSearch] = useState('');
  const [maxTurns, setMaxTurns] = useState(historyPolicy?.max_turns || 6);
  const [maxTokens, setMaxTokens] = useState(historyPolicy?.max_tokens || 4000);
  
  // Model sets management
  const [savedModelSets, setSavedModelSets] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-model-sets');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [modelSetName, setModelSetName] = useState('');
  
  // Persona Compare model sets management
  const [savedPersonaCompareSets, setSavedPersonaCompareSets] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-persona-compare-sets');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [personaCompareSetName, setPersonaCompareSetName] = useState('');
  
  // Persona Compare Mode settings
  const [personaCompareModels, setPersonaCompareModels] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-persona-compare-models');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [personaAssignments, setPersonaAssignments] = useState(() => {
    try {
      const stored = localStorage.getItem('llm-council-persona-assignments');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
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
  
  // Regular Chat Mode settings
  const [regularChatModel, setRegularChatModel] = useState(chairmanModel || '');
  const [regularChatSearch, setRegularChatSearch] = useState('');
  
  // Ranking rules (Stage 2)
  const [rankingPrompt, setRankingPrompt] = useState(() => {
    const stored = localStorage.getItem('llm-council-ranking-prompt');
    return stored || `You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`;
  });

  // Chairman instructions (Stage 3)
  const [chairmanPrompt, setChairmanPrompt] = useState(() => {
    const stored = localStorage.getItem('llm-council-chairman-prompt');
    return stored || `You are the Chairman of the LLM Council.

User Question:
{user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}
{context_note}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`;
  });

  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [personaApplySuccess, setPersonaApplySuccess] = useState(false);
  const [personaApplyError, setPersonaApplyError] = useState('');

  // Load personas and models
  useEffect(() => {
    loadPersonas();
    loadModels();
  }, []);

  // Sync with conversation
  useEffect(() => {
    if (currentConversation) {
      if (currentConversation.ranking_prompt) {
        setRankingPrompt(currentConversation.ranking_prompt);
      }
      if (currentConversation.chairman_prompt) {
        setChairmanPrompt(currentConversation.chairman_prompt);
      }
      if (currentConversation.mode) {
        setMode(currentConversation.mode);
      }
      if (currentConversation.system_prompt) {
        setSystemPrompt(currentConversation.system_prompt);
      }
      if (currentConversation.models) {
        if (currentConversation.models.council) {
          setSelectedCouncil(currentConversation.models.council);
        }
        if (currentConversation.models.chairman) {
          setSelectedChair(currentConversation.models.chairman);
          setPersonaCompareChairman(currentConversation.models.chairman);
          setRegularChatModel(currentConversation.models.chairman);
        }
      }
      if (currentConversation.history_policy) {
        setMaxTurns(currentConversation.history_policy.max_turns || 6);
        setMaxTokens(currentConversation.history_policy.max_tokens || 4000);
      }
    }
  }, [currentConversation]);

  // Sync with props
  useEffect(() => {
    setMaxTurns(historyPolicy?.max_turns || 6);
    setMaxTokens(historyPolicy?.max_tokens || 4000);
    if (selectedCouncil.length === 0 && councilModels && councilModels.length > 0) {
      setSelectedCouncil(councilModels);
    }
    setSelectedChair(chairmanModel || '');
    setPersonaCompareChairman(chairmanModel || '');
    setRegularChatModel(chairmanModel || '');
  }, [historyPolicy, councilModels, chairmanModel]);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('llm-council-mode', mode);
    localStorage.setItem('llm-council-ranking-prompt', rankingPrompt);
    localStorage.setItem('llm-council-chairman-prompt', chairmanPrompt);
    if (selectedCouncil.length > 0) {
      localStorage.setItem('llm-council-selected-models', JSON.stringify(selectedCouncil));
    }
    localStorage.setItem('llm-council-persona-assignments', JSON.stringify(personaAssignments));
    if (mode === 'persona-compare') {
      localStorage.setItem('llm-council-persona-compare-models', JSON.stringify(personaCompareModels));
    }
  }, [mode, rankingPrompt, chairmanPrompt, selectedCouncil, personaAssignments, personaCompareModels]);

  // Notify parent of mode change
  useEffect(() => {
    if (onModeChange) {
      onModeChange(mode);
    }
  }, [mode, onModeChange]);

  // Update persona compare settings
  useEffect(() => {
    if (onPersonaCompareChange && mode === 'persona-compare' && personaCompareModels.length > 0) {
      const personaMap = buildPersonaMap();
      onPersonaCompareChange({
        enabledModels: personaCompareModels,
        personaMap: personaMap,
        chairmanModel: personaCompareChairman,
      });
    } else if (onPersonaCompareChange) {
      onPersonaCompareChange(null);
    }
  }, [mode, personaCompareModels, personaAssignments, personas, personaCompareChairman, onPersonaCompareChange]);

  const loadPersonas = async () => {
    try {
      const data = await api.listPersonas();
      setPersonas(data);
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  };

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

    try {
      const safeMaxTurns = Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : undefined;
      const safeMaxTokens = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : undefined;
      const historyPayload =
        safeMaxTurns || safeMaxTokens
          ? {
              ...(safeMaxTurns ? { max_turns: safeMaxTurns } : {}),
              ...(safeMaxTokens ? { max_tokens: safeMaxTokens } : {}),
            }
          : null;

      const updatePayload = {
        mode,
        ranking_prompt: rankingPrompt,
        chairman_prompt: chairmanPrompt,
        history_policy: historyPayload,
        system_prompt: systemPrompt || null,
      };

      // Mode-specific settings
      if (mode === 'council') {
        updatePayload.council_models = selectedCouncil;
        updatePayload.chairman_model = selectedChair;
      } else if (mode === 'persona-compare') {
        const personaMap = buildPersonaMap();
        updatePayload.persona_map = personaMap;
        updatePayload.council_models = personaCompareModels;
        updatePayload.chairman_model = personaCompareChairman;
      } else if (mode === 'regular-chat') {
        updatePayload.chairman_model = regularChatModel;
      }

      await api.updateConversationSettings(targetConversationId, updatePayload);
      
      // Update parent state
      if (onSettingsChange) {
        onSettingsChange({
          historyPolicy: historyPayload || historyPolicy,
          councilModels: mode === 'council' ? selectedCouncil : (mode === 'persona-compare' ? personaCompareModels : []),
          chairmanModel: mode === 'council' ? selectedChair : (mode === 'persona-compare' ? personaCompareChairman : regularChatModel),
        });
      }
      
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 3000);
      
      if (onReloadConversation) {
        onReloadConversation(targetConversationId);
      }
    } catch (error) {
      console.error('Failed to apply settings:', error);
      setApplyError(error.message || 'Failed to apply settings');
    }
  };

  const handleResetRanking = () => {
    if (confirm('Reset ranking prompt to default?')) {
      setRankingPrompt(`You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`);
    }
  };

  const handleResetChairman = () => {
    if (confirm('Reset chairman prompt to default?')) {
      setChairmanPrompt(`You are the Chairman of the LLM Council.

User Question:
{user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}
{context_note}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`);
    }
  };

  // Render mode-specific customization panel
  const renderModeCustomization = () => {
    if (mode === 'council') {
      return (
        <div className="mode-customization">
          <h4>Council Mode Settings</h4>
          
          <div className="settings-section">
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
            </div>
          </div>

          <div className="settings-section">
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
          </div>

          <div className="settings-grid">
            <div className="settings-section">
              <label>Max Turns (history)</label>
              <input
                type="number"
                min="1"
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value))}
              />
            </div>
            <div className="settings-section">
              <label>Max Tokens (history)</label>
              <input
                type="number"
                min="500"
                step="500"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="settings-section">
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
                    setChairmanSearch('');
                  }
                }}
                disabled={!chairmanSearch}
              >
                Set
              </button>
            </div>
            <select
              value={selectedChair}
              onChange={(e) => setSelectedChair(e.target.value)}
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
          </div>

          <div className="settings-section">
            <label>Council Models</label>
            <div className="model-search-row">
              <input
                placeholder="Search/filter models (id/name)..."
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
              />
              <button onClick={() => loadModels()} disabled={modelsLoading}>
                {modelsLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {modelsError && <div className="settings-error">{modelsError}</div>}
            <div className="model-listing">
              {availableModels
                .filter((m) => {
                  if (!m || !m.id || typeof m.id !== 'string' || m.id.trim() === '') {
                    return false;
                  }
                  if (!modelQuery) return true;
                  const searchTerm = modelQuery.toLowerCase();
                  return m.id.toLowerCase().includes(searchTerm) || 
                         (m.name && m.name.toLowerCase().includes(searchTerm));
                })
                .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
                .slice(0, 50)
                .map((model) => (
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
                <div className="settings-hint">No models found. Click Refresh to load models.</div>
              )}
              {!modelsLoading && availableModels.length > 0 && modelQuery && 
               availableModels.filter((m) => {
                 if (!m || !m.id) return false;
                 const searchTerm = modelQuery.toLowerCase();
                 return m.id.toLowerCase().includes(searchTerm) || 
                        (m.name && m.name.toLowerCase().includes(searchTerm));
               }).length === 0 && (
                <div className="settings-hint">No models match your search.</div>
              )}
            </div>
          </div>

          {/* Preview of selected council models */}
          {(selectedCouncil.length > 0 || selectedChair) && (
            <div className="settings-section">
              <label>Preview: Selected Configuration</label>
              <div className="council-preview-content">
                {selectedCouncil.length > 0 && (
                  <div className="council-preview-section">
                    <div className="council-preview-title">Council Models ({selectedCouncil.length})</div>
                    {selectedCouncil.map((modelId) => {
                      const model = availableModels.find((m) => m.id === modelId);
                      const modelNotFound = !model;
                      return (
                        <div key={modelId} className={`council-preview-item ${modelNotFound ? 'model-not-found' : ''}`}>
                          <div className="council-preview-model-row">
                            <div className="council-preview-model">
                              {modelId}
                              {modelNotFound && (
                                <span className="model-not-found-badge" title="Model not found in current catalog">⚠️</span>
                              )}
                            </div>
                            <button
                              className="remove-model-btn"
                              onClick={() => {
                                setSelectedCouncil((prev) => prev.filter((id) => id !== modelId));
                              }}
                              title="Remove model"
                            >
                              ×
                            </button>
                          </div>
                          {model && (
                            <div className="council-preview-pricing">
                              P: {formatPrice(model.pricing?.prompt)} | C: {formatPrice(model.pricing?.completion)} per MTok
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {selectedChair && (
                  <div className="council-preview-section">
                    <div className="council-preview-title">Chairman Model</div>
                    <div className={`council-preview-item council-preview-chairman ${!availableModels.find((m) => m.id === selectedChair) ? 'model-not-found' : ''}`}>
                      <div className="council-preview-model-row">
                        <div className="council-preview-model">
                          {selectedChair}
                          {!availableModels.find((m) => m.id === selectedChair) && (
                            <span className="model-not-found-badge" title="Model not found in current catalog">⚠️</span>
                          )}
                        </div>
                        <button
                          className="remove-model-btn"
                          onClick={() => {
                            setSelectedChair('');
                          }}
                          title="Remove chairman model"
                        >
                          ×
                        </button>
                      </div>
                      {(() => {
                        const model = availableModels.find((m) => m.id === selectedChair);
                        return model && (
                          <div className="council-preview-pricing">
                            P: {formatPrice(model.pricing?.prompt)} | C: {formatPrice(model.pricing?.completion)} per MTok
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {selectedCouncil.length === 0 && !selectedChair && (
                  <div className="settings-hint">No models selected. Select council models and chairman above.</div>
                )}
              </div>
              
              {/* Model Sets Management */}
              <div className="model-sets-section">
                <label>Save/Load Model Sets</label>
                <div className="model-sets-controls">
                  <input
                    type="text"
                    placeholder="Enter name for this model set..."
                    value={modelSetName}
                    onChange={(e) => setModelSetName(e.target.value)}
                    className="model-set-name-input"
                  />
                  <button
                    className="save-model-set-btn"
                    onClick={() => {
                      if (!modelSetName.trim()) {
                        alert('Please enter a name for the model set');
                        return;
                      }
                      const newSet = {
                        name: modelSetName.trim(),
                        councilModels: [...selectedCouncil],
                        chairmanModel: selectedChair,
                        createdAt: new Date().toISOString(),
                      };
                      const updated = [...savedModelSets.filter((s) => s.name !== newSet.name), newSet];
                      setSavedModelSets(updated);
                      localStorage.setItem('llm-council-model-sets', JSON.stringify(updated));
                      setModelSetName('');
                      alert(`Model set "${newSet.name}" saved!`);
                    }}
                  >
                    Save Current Set
                  </button>
                </div>
                {savedModelSets.length > 0 && (
                  <div className="saved-model-sets">
                    <div className="saved-sets-label">Saved Sets:</div>
                    {savedModelSets.map((set, idx) => (
                      <div key={idx} className="saved-model-set-item">
                        <div className="saved-set-info">
                          <span className="saved-set-name">{set.name}</span>
                          <span className="saved-set-details">
                            {set.councilModels.length} council, {set.chairmanModel ? '1' : '0'} chairman
                          </span>
                        </div>
                        <div className="saved-set-actions">
                          <button
                            className="load-model-set-btn"
                            onClick={() => {
                              setSelectedCouncil(set.councilModels || []);
                              setSelectedChair(set.chairmanModel || '');
                              alert(`Loaded model set "${set.name}"`);
                            }}
                          >
                            Load
                          </button>
                          <button
                            className="delete-model-set-btn"
                            onClick={() => {
                              if (confirm(`Delete model set "${set.name}"?`)) {
                                const updated = savedModelSets.filter((s) => s.name !== set.name);
                                setSavedModelSets(updated);
                                localStorage.setItem('llm-council-model-sets', JSON.stringify(updated));
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    } else if (mode === 'persona-compare') {
      return (
        <div className="mode-customization">
          <h4>Persona Compare Mode Settings</h4>
          
          <div className="settings-section">
            <label>Select Models</label>
            <div className="model-search-row">
              <input
                placeholder="Search/filter models..."
                value={personaModelFilter}
                onChange={(e) => setPersonaModelFilter(e.target.value)}
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

          <div className="settings-section">
            <label>Enabled Models - Assign Personas</label>
            {personaCompareModels.length === 0 ? (
              <div className="settings-hint">Select models above to assign personas.</div>
            ) : (
              <div className="model-listing persona-assignments">
                {sortedPersonaModels.slice(0, 50).map((m) => (
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
              </div>
            )}
          </div>

          <div className="settings-section">
            <label>Chairman/Leader Model</label>
            <div className="model-search-row">
              <input
                placeholder="Search chairman model..."
                value={chairmanSearchPersona}
                onChange={(e) => setChairmanSearchPersona(e.target.value)}
                list="chairman-models-persona"
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
              >
                Set
              </button>
            </div>
            <select
              value={personaCompareChairman}
              onChange={(e) => setPersonaCompareChairman(e.target.value)}
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
          </div>

          <div className="settings-section">
            <label>Chairman/Leader Persona</label>
            <select
              value={chairmanPersona}
              onChange={(e) => setChairmanPersona(e.target.value)}
            >
              <option value="">None (use default system prompt)</option>
              {personas.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {personaCompareModels.length > 0 && (
            <div className="settings-section">
              <label>Preview: Assigned Personas</label>
              <div className="persona-preview-content">
                {(() => {
                  const allModels = personaCompareModels.sort((a, b) => a.localeCompare(b));

                  if (allModels.length === 0) {
                    return (
                      <div className="settings-hint">
                        No models selected. Select models above to assign personas.
                      </div>
                    );
                  }

                  return allModels.map((modelId) => {
                    const assignment = personaAssignments[modelId];
                    const persona = assignment?.personaName ? personas.find((p) => p.name === assignment.personaName) : null;
                    const model = availableModels.find((m) => m.id === modelId);
                    const modelNotFound = !model;

                    return (
                      <div key={modelId} className={`persona-preview-item ${modelNotFound ? 'model-not-found' : ''}`}>
                        <div className="persona-preview-header">
                          <div className="persona-preview-model">
                            {modelId}
                            {modelNotFound && (
                              <span className="model-not-found-badge" title="Model not found in current catalog">⚠️</span>
                            )}
                          </div>
                          <button
                            className="remove-model-btn"
                            onClick={() => {
                              setPersonaCompareModels((prev) => prev.filter((id) => id !== modelId));
                              setPersonaAssignments((prev) => {
                                const updated = { ...prev };
                                delete updated[modelId];
                                return updated;
                              });
                            }}
                            title="Remove model"
                          >
                            ×
                          </button>
                        </div>
                        {assignment?.personaName ? (
                          <>
                            <div className="persona-preview-persona-name">
                              <strong>Persona:</strong> {assignment.personaName}
                            </div>
                            {persona && (
                              <div className="persona-preview-prompt">
                                {persona.system_prompt.substring(0, 100)}
                                {persona.system_prompt.length > 100 ? '...' : ''}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="persona-preview-persona-name" style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
                            No persona assigned
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              
              {/* Persona Compare Model Sets Management */}
              <div className="model-sets-section">
                <label>Save/Load Model & Persona Sets</label>
                <div className="model-sets-controls">
                  <input
                    type="text"
                    placeholder="Enter name for this configuration..."
                    value={personaCompareSetName}
                    onChange={(e) => setPersonaCompareSetName(e.target.value)}
                    className="model-set-name-input"
                  />
                  <button
                    className="save-model-set-btn"
                    onClick={() => {
                      if (!personaCompareSetName.trim()) {
                        alert('Please enter a name for the configuration');
                        return;
                      }
                      const newSet = {
                        name: personaCompareSetName.trim(),
                        models: [...personaCompareModels],
                        personaAssignments: { ...personaAssignments },
                        chairmanModel: personaCompareChairman,
                        createdAt: new Date().toISOString(),
                      };
                      const updated = [...savedPersonaCompareSets.filter((s) => s.name !== newSet.name), newSet];
                      setSavedPersonaCompareSets(updated);
                      localStorage.setItem('llm-council-persona-compare-sets', JSON.stringify(updated));
                      setPersonaCompareSetName('');
                      alert(`Configuration "${newSet.name}" saved!`);
                    }}
                  >
                    Save Current Configuration
                  </button>
                </div>
                {savedPersonaCompareSets.length > 0 && (
                  <div className="saved-model-sets">
                    <div className="saved-sets-label">Saved Configurations:</div>
                    {savedPersonaCompareSets.map((set, idx) => (
                      <div key={idx} className="saved-model-set-item">
                        <div className="saved-set-info">
                          <span className="saved-set-name">{set.name}</span>
                          <span className="saved-set-details">
                            {set.models.length} models, {Object.keys(set.personaAssignments || {}).filter(k => set.personaAssignments[k]?.personaName).length} personas, {set.chairmanModel ? '1' : '0'} chairman
                          </span>
                        </div>
                        <div className="saved-set-actions">
                          <button
                            className="load-model-set-btn"
                            onClick={() => {
                              setPersonaCompareModels(set.models || []);
                              setPersonaAssignments(set.personaAssignments || {});
                              setPersonaCompareChairman(set.chairmanModel || '');
                              alert(`Loaded configuration "${set.name}"`);
                            }}
                          >
                            Load
                          </button>
                          <button
                            className="delete-model-set-btn"
                            onClick={() => {
                              if (confirm(`Delete configuration "${set.name}"?`)) {
                                const updated = savedPersonaCompareSets.filter((s) => s.name !== set.name);
                                setSavedPersonaCompareSets(updated);
                                localStorage.setItem('llm-council-persona-compare-sets', JSON.stringify(updated));
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    } else if (mode === 'regular-chat') {
      return (
        <div className="mode-customization">
          <h4>Regular Chat Mode Settings</h4>
          
          <div className="settings-section">
            <label>Chat Model</label>
            <div className="model-search-row">
              <input
                placeholder="Search model..."
                value={regularChatSearch}
                onChange={(e) => setRegularChatSearch(e.target.value)}
                list="regular-chat-models"
              />
              <datalist id="regular-chat-models">
                {availableModels.map((m) => (
                  <option value={m.id} key={m.id} />
                ))}
              </datalist>
              <button
                onClick={() => {
                  if (regularChatSearch) {
                    setRegularChatModel(regularChatSearch);
                    setRegularChatSearch('');
                  }
                }}
                disabled={!regularChatSearch}
              >
                Set
              </button>
            </div>
            <select
              value={regularChatModel}
              onChange={(e) => setRegularChatModel(e.target.value)}
            >
              {[regularChatModel, ...(availableModels.map((m) => m.id) || [])]
                .filter(Boolean)
                .filter((v, idx, arr) => arr.indexOf(v) === idx)
                .map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
            </select>
          </div>

          <div className="settings-section">
            <label>System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Optional system prompt..."
              rows={3}
            />
          </div>

          <div className="settings-grid">
            <div className="settings-section">
              <label>Max Turns (history)</label>
              <input
                type="number"
                min="1"
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value))}
              />
            </div>
            <div className="settings-section">
              <label>Max Tokens (history)</label>
              <input
                type="number"
                min="500"
                step="500"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>Settings</h2>
        <button onClick={handleApplySettings} className="apply-settings-btn" disabled={!currentConversationId}>
          Apply Settings
        </button>
      </div>

      {applySuccess && (
        <div className="settings-message success">Settings applied successfully!</div>
      )}
      {applyError && (
        <div className="settings-message error">{applyError}</div>
      )}

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'mode' ? 'active' : ''}`}
          onClick={() => setActiveTab('mode')}
        >
          Mode & Configuration
        </button>
        <button
          className={`settings-tab ${activeTab === 'ranking' ? 'active' : ''}`}
          onClick={() => setActiveTab('ranking')}
        >
          Ranking Rules (Stage 2)
        </button>
        <button
          className={`settings-tab ${activeTab === 'chairman' ? 'active' : ''}`}
          onClick={() => setActiveTab('chairman')}
        >
          Chairman Instructions (Stage 3)
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'mode' && (
          <div className="settings-panel">
            <h3>Chat Mode</h3>
            <p className="settings-description">
              Select how you want to interact with the LLM system.
            </p>
            
            <div className="mode-options">
              <label className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value="council"
                  checked={mode === 'council'}
                  onChange={(e) => setMode(e.target.value)}
                />
                <div className="mode-option-content">
                  <strong>Council Mode</strong>
                  <p>Traditional 3-stage council process: individual responses → peer rankings → final synthesis</p>
                </div>
              </label>

              <label className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value="persona-compare"
                  checked={mode === 'persona-compare'}
                  onChange={(e) => setMode(e.target.value)}
                />
                <div className="mode-option-content">
                  <strong>Persona Compare Mode</strong>
                  <p>Assign different personas to individual models and compare their responses</p>
                </div>
              </label>

              <label className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value="regular-chat"
                  checked={mode === 'regular-chat'}
                  onChange={(e) => setMode(e.target.value)}
                />
                <div className="mode-option-content">
                  <strong>Regular Chat</strong>
                  <p>Direct conversation with a single LLM, with access to search tools, MCP servers, and browser automation</p>
                </div>
              </label>
            </div>

            {renderModeCustomization()}
          </div>
        )}

        {activeTab === 'ranking' && (
          <div className="settings-panel">
            <div className="settings-panel-header">
              <h3>Ranking Rules (Stage 2)</h3>
              <button onClick={handleResetRanking} className="reset-btn">
                Reset to Default
              </button>
            </div>
            <p className="settings-description">
              Customize the prompt used in Stage 2 when models rank each other's responses.
              Use <code>{'{user_query}'}</code> for the user's question and <code>{'{responses_text}'}</code> for the anonymized responses.
            </p>
            <textarea
              className="settings-textarea"
              value={rankingPrompt}
              onChange={(e) => setRankingPrompt(e.target.value)}
              rows={20}
              placeholder="Enter ranking prompt..."
            />
          </div>
        )}

        {activeTab === 'chairman' && (
          <div className="settings-panel">
            <div className="settings-panel-header">
              <h3>Chairman Instructions (Stage 3)</h3>
              <button onClick={handleResetChairman} className="reset-btn">
                Reset to Default
              </button>
            </div>
            <p className="settings-description">
              Customize the prompt used by the Chairman model in Stage 3 to synthesize the final answer.
              Use <code>{'{user_query}'}</code>, <code>{'{stage1_text}'}</code>, <code>{'{stage2_text}'}</code>, and <code>{'{context_note}'}</code> as placeholders.
            </p>
            <textarea
              className="settings-textarea"
              value={chairmanPrompt}
              onChange={(e) => setChairmanPrompt(e.target.value)}
              rows={20}
              placeholder="Enter chairman prompt..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
