import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { formatCost, formatTokens } from '../utils/costUtils';
import './Stage1.css';

export default function Stage1({ responses, onRedo, onCopy, costs }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  const activeResponse = responses[activeTab];
  const activeUsage = activeResponse?.usage;
  const modelCost = costs?.per_model_costs?.[activeResponse?.model];

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>
      <div className="stage-actions">
        <button className="mini-btn" onClick={() => onRedo && onRedo()}>Redo</button>
        <button
          className="mini-btn"
          onClick={() => onCopy && onCopy(responses[activeTab]?.response || '')}
        >
          Copy
        </button>
      </div>

      {costs && (
        <div className="stage-cost-summary">
          <span className="cost-label">Stage 1 Total:</span>
          <span className="cost-value">{formatCost(costs.total_cost)}</span>
          <span className="cost-tokens">
            ({formatTokens(costs.total_tokens?.total)} tokens)
          </span>
        </div>
      )}

      <div className="tabs">
        {responses.map((resp, index) => {
          const respCost = costs?.per_model_costs?.[resp.model];
          return (
            <button
              key={index}
              className={`tab ${activeTab === index ? 'active' : ''}`}
              onClick={() => setActiveTab(index)}
            >
              {resp.model.split('/')[1] || resp.model}
              {respCost && (
                <span className="tab-cost">{formatCost(respCost.cost)}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="tab-content">
        <div className="model-header">
          <div className="model-name">{activeResponse.model}</div>
          {(activeUsage || modelCost) && (
            <div className="model-cost-info">
              {modelCost && (
                <>
                  <span className="cost-badge">
                    Cost: {formatCost(modelCost.cost)}
                  </span>
                  {modelCost.tokens && (
                    <span className="token-badge">
                      {formatTokens(modelCost.tokens.prompt)}p + {formatTokens(modelCost.tokens.completion)}c = {formatTokens(modelCost.tokens.total)} total
                    </span>
                  )}
                </>
              )}
              {!modelCost && activeUsage && (
                <span className="token-badge">
                  {formatTokens(activeUsage.prompt_tokens)}p + {formatTokens(activeUsage.completion_tokens)}c = {formatTokens(activeUsage.total_tokens)} total
                </span>
              )}
            </div>
          )}
        </div>
        <div className="response-text markdown-content">
          <ReactMarkdown>{activeResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
