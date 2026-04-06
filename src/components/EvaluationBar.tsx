import React from 'react';

interface EvaluationBarProps {
  evaluation: number; // Positive for white, negative for black
}

const EvaluationBar: React.FC<EvaluationBarProps> = ({ evaluation }) => {
  const maxEval = 5;
  const clampedEval = Math.max(Math.min(evaluation, maxEval), -maxEval);
  
  // Convert eval to percentage (50% is equal, 100% white winning, 0% black winning)
  const percentage = 50 + (clampedEval / (maxEval * 2)) * 100;
  const displayEval = evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1);

  return (
    <div 
      className="evaluation-bar-container" 
      style={{ '--percentage': `${percentage}%` } as React.CSSProperties}
    >
      <div 
        className="evaluation-bar-fill"
      />
      <div className="evaluation-text">
        {displayEval}
      </div>
    </div>
  );
};

export default EvaluationBar;
