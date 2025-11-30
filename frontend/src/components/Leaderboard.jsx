import { useState, useEffect } from 'react';
import { api } from '../api';
import './Leaderboard.css';

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterPersona, setFilterPersona] = useState('');
  const [sortBy, setSortBy] = useState('rank'); // 'rank', 'wins', 'participations'

  const loadLeaderboard = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getLeaderboard(filterModel || undefined, filterPersona || undefined);
      setEntries(data.entries || []);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      setError(err.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, [filterModel, filterPersona]);

  const sortedEntries = [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'wins':
        return b.wins - a.wins;
      case 'participations':
        return b.participations - a.participations;
      case 'rank':
      default:
        return a.average_rank - b.average_rank;
    }
  });

  const getModelDisplayName = (modelId) => {
    return modelId.split('/').pop() || modelId;
  };

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <h2>Leaderboard</h2>
        <button onClick={loadLeaderboard} disabled={loading} className="refresh-btn">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="leaderboard-error">{error}</div>}

      <div className="leaderboard-filters">
        <div className="filter-group">
          <label>Filter by Model:</label>
          <input
            type="text"
            placeholder="Model ID..."
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Filter by Persona:</label>
          <input
            type="text"
            placeholder="Persona name..."
            value={filterPersona}
            onChange={(e) => setFilterPersona(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="rank">Average Rank</option>
            <option value="wins">Wins</option>
            <option value="participations">Participations</option>
          </select>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="leaderboard-loading">Loading leaderboard...</div>
      ) : sortedEntries.length === 0 ? (
        <div className="leaderboard-empty">
          No leaderboard data yet. Start some conversations to see rankings!
        </div>
      ) : (
        <div className="leaderboard-table">
          <div className="leaderboard-row header">
            <div className="col-rank">Rank</div>
            <div className="col-model">Model</div>
            <div className="col-persona">Persona</div>
            <div className="col-stats">Avg Rank</div>
            <div className="col-stats">Wins</div>
            <div className="col-stats">Win Rate</div>
            <div className="col-stats">Participations</div>
            <div className="col-stats">Votes</div>
          </div>
          {sortedEntries.map((entry, index) => (
            <div key={`${entry.model}|${entry.persona || 'None'}`} className="leaderboard-row">
              <div className="col-rank">
                {sortBy === 'rank' ? index + 1 : '-'}
              </div>
              <div className="col-model" title={entry.model}>
                {getModelDisplayName(entry.model)}
              </div>
              <div className="col-persona">
                {entry.persona || <span className="no-persona">None</span>}
              </div>
              <div className="col-stats">
                {entry.average_rank < 999 ? entry.average_rank.toFixed(2) : 'N/A'}
              </div>
              <div className="col-stats">{entry.wins}</div>
              <div className="col-stats">{entry.win_rate}%</div>
              <div className="col-stats">{entry.participations}</div>
              <div className="col-stats">{entry.total_votes}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

