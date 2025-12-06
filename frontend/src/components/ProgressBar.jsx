import './ProgressBar.css';

export default function ProgressBar({ progress, isLoading }) {
  if (!isLoading && !progress) return null;

  const stage1 = progress?.stage1 || { completed: 0, total: 0 };
  const stage2 = progress?.stage2 || { completed: 0, total: 0 };
  const stage3 = progress?.stage3 || { inProgress: false };

  // If total is 0 but we have completed models, use completed as total (for display)
  const stage1Total = stage1.total > 0 ? stage1.total : (stage1.completed > 0 ? stage1.completed : 1);
  const stage2Total = stage2.total > 0 ? stage2.total : (stage2.completed > 0 ? stage2.completed : 1);

  const stage1Percent = stage1Total > 0 ? (stage1.completed / stage1Total) * 100 : 0;
  const stage2Percent = stage2Total > 0 ? (stage2.completed / stage2Total) * 100 : 0;
  const stage3Percent = stage3.inProgress ? 50 : (stage3.inProgress === false && stage2.completed > 0 ? 100 : 0);

  // Overall progress: Stage 1 (40%), Stage 2 (30%), Stage 3 (30%)
  const overallPercent = (stage1Percent * 0.4) + (stage2Percent * 0.3) + (stage3Percent * 0.3);

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-header">
        <span className="progress-label">Progress</span>
        <span className="progress-percent">{Math.round(overallPercent)}%</span>
      </div>
      <div className="progress-bar-wrapper">
        <div className="progress-bar-fill" style={{ width: `${overallPercent}%` }}></div>
      </div>
      <div className="progress-stages">
        <div className="progress-stage">
          <span className="stage-label">Stage 1:</span>
          <span className="stage-progress">
            {stage1.completed}/{stage1Total} models
          </span>
        </div>
        {stage1.completed >= stage1Total && stage1Total > 0 && (
          <div className="progress-stage">
            <span className="stage-label">Stage 2:</span>
            <span className="stage-progress">
              {stage2.completed}/{stage2Total} rankings
            </span>
          </div>
        )}
        {stage2.completed >= stage2Total && stage2Total > 0 && (
          <div className="progress-stage">
            <span className="stage-label">Stage 3:</span>
            <span className="stage-progress">
              {stage3.inProgress ? 'Synthesizing...' : 'Complete'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

