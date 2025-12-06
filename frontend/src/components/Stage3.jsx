import ReactMarkdown from 'react-markdown';
import { formatCost, formatTokens } from '../utils/costUtils';
import './Stage3.css';

export default function Stage3({ finalResponse, onRedo, onCopy, costs }) {
  if (!finalResponse) {
    return null;
  }

  return (
    <div className="stage stage3">
      <h3 className="stage-title">Stage 3: Final Council Answer</h3>
      <div className="stage-actions">
        <button className="mini-btn" onClick={() => onRedo && onRedo()}>Redo</button>
        <button
          className="mini-btn"
          onClick={() => onCopy && onCopy(finalResponse?.response || '')}
        >
          Copy
        </button>
      </div>
      {costs && (
        <div className="stage-cost-summary">
          <span className="cost-label">Stage 3 Cost:</span>
          <span className="cost-value">{formatCost(costs.cost)}</span>
          {costs.tokens && (
            <span className="cost-tokens">
              ({formatTokens(costs.tokens.prompt)}p + {formatTokens(costs.tokens.completion)}c = {formatTokens(costs.tokens.total)} tokens)
            </span>
          )}
        </div>
      )}
      <div className="final-response">
        <div className="chairman-header">
          <div className="chairman-label">
            Chairman: {finalResponse.model.split('/')[1] || finalResponse.model}
          </div>
          {finalResponse.usage && (
            <div className="model-cost-info">
              <span className="token-badge">
                {formatTokens(finalResponse.usage.prompt_tokens)}p + {formatTokens(finalResponse.usage.completion_tokens)}c = {formatTokens(finalResponse.usage.total_tokens)} total
              </span>
            </div>
          )}
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
