import { useState, useEffect, useRef } from 'react';
import { Chess, Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useChessEngine, Difficulty } from './hooks/useChessEngine';
import EvaluationBar from './components/EvaluationBar';
import { getIndonesianExplanation } from './utils/chessExplainer';
import './App.css';

// Helper: rebuild a Chess instance from a list of SAN moves (preserves full history)
function rebuildGame(moves: string[]): Chess {
  const g = new Chess();
  moves.forEach(m => g.move(m));
  return g;
}

function App() {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const { evaluation, bestMove, isAnalyzing, analyzedFen, analyzePosition, setDifficulty } = useChessEngine();
  
  // Game Configuration
  const [gameStarted, setGameStarted] = useState(false);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [difficulty, setDifficultyLevel] = useState<Difficulty>('medium');

  // UX States
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});
  const [lastBestMove, setLastBestMove] = useState<string>('');
  const [critique, setCritique] = useState<{ userMove: string; bestMove: string; reason: string } | null>(null);

  // Ref to always access the latest game (avoids stale closures in setTimeout)
  const gameRef = useRef(game);
  gameRef.current = game;

  // AI Turn Handling
  // IMPORTANT: `critique` is in the dependency array so that clicking
  // "Lanjutkan Permainan" (which clears critique) triggers the bot to move.
  useEffect(() => {
    if (!gameStarted || game.isGameOver()) return;
    
    const fen = game.fen();
    if (analyzedFen !== fen) return;

    // Pause bot while the player is reading the critique
    if (critique) return;

    const turn = game.turn();
    if (turn !== playerColor) {
      // It's AI's turn — move after a short delay
      if (bestMove) {
        const currentFen = fen; // capture for safety check in timeout
        const timer = setTimeout(() => {
          const g = gameRef.current;
          // Safety: only proceed if the game hasn't changed since we scheduled this
          if (g.fen() !== currentFen) return;
          
          try {
            let result;
            if (bestMove.length >= 4 && !bestMove.includes(' ')) {
              result = g.move({
                from: bestMove.slice(0, 2) as Square,
                to: bestMove.slice(2, 4) as Square,
                promotion: bestMove.slice(4, 5) || 'q',
              });
            } else {
              result = g.move(bestMove);
            }
            
            if (result) {
              const fullHistory = g.history();
              const newGame = rebuildGame(fullHistory);
              setGame(newGame);
              setMoveHistory([...fullHistory]);
              setCritique(null);
              setMoveFrom(null);
              setOptionSquares({});
            }
          } catch {
            // Move failed — engine might be out of sync, ignore
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    } else {
      // It's Player's turn — record the best move BEFORE they play
      if (bestMove && !isAnalyzing) {
        setLastBestMove(bestMove);
      }
    }
  }, [game, bestMove, gameStarted, playerColor, isAnalyzing, analyzedFen, critique]);

  // Trigger engine analysis whenever the board changes
  useEffect(() => {
    if (gameStarted) {
      analyzePosition(game.fen(), difficulty);
    }
  }, [game, analyzePosition, gameStarted, difficulty]);

  function getMoveOptions(square: Square) {
    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, any> = {};
    moves.map((move) => {
      const targetPiece = game.get(move.to as Square);
      const sourcePiece = game.get(square);
      newSquares[move.to] = {
        background: targetPiece && sourcePiece && targetPiece.color !== sourcePiece.color
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 40%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 30%)',
        borderRadius: '50%',
      };
      return move;
    });
    newSquares[square] = { background: 'rgba(255, 255, 0, 0.4)' };
    setOptionSquares(newSquares);
    return true;
  }

  function onPlayerMove(moveStr: string) {
    // Only allow moves on the player's turn
    if (game.turn() !== playerColor) return null;

    try {
      let result;
      if (moveStr.length >= 4 && !moveStr.includes(' ')) {
        result = game.move({
          from: moveStr.slice(0, 2) as Square,
          to: moveStr.slice(2, 4) as Square,
          promotion: moveStr.slice(4, 5) || 'q',
        });
      } else {
        result = game.move(moveStr);
      }

      if (result) {
        // Check if the player's move matches the engine's recommendation
        const moveLan = result.from + result.to + (result.promotion || '');
        if (lastBestMove && moveLan !== lastBestMove) {
          // Player made a sub-optimal move — show critique
          const prevHistory = game.history().slice(0, -1);
          const tempGame = rebuildGame(prevHistory);
          const explanation = getIndonesianExplanation(tempGame, lastBestMove, evaluation);
          setCritique({
            userMove: result.san,
            bestMove: lastBestMove,
            reason: explanation.reason,
          });
        } else {
          setCritique(null);
        }

        // Rebuild game from full history to preserve it
        const fullHistory = game.history();
        const newGame = rebuildGame(fullHistory);
        setGame(newGame);
        setMoveHistory([...fullHistory]);
        setMoveFrom(null);
        setOptionSquares({});
        return result;
      }
    } catch {
      return null;
    }
    return null;
  }

  function onSquareClick({ square }: { square: string }) {
    const s = square as Square;
    if (game.turn() !== playerColor) return;

    if (!moveFrom) {
      const hasMoveOptions = getMoveOptions(s);
      if (hasMoveOptions) setMoveFrom(s);
      return;
    }

    const move = onPlayerMove(moveFrom + s);
    if (!move) {
      const hasMoveOptions = getMoveOptions(s);
      if (hasMoveOptions) setMoveFrom(s);
      else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    }
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (game.turn() !== playerColor) return false;
    const move = onPlayerMove(sourceSquare + targetSquare);
    return !!move;
  }

  const startGame = (color: 'w' | 'b', diff: Difficulty) => {
    setPlayerColor(color);
    setDifficultyLevel(diff);
    setDifficulty(diff);
    setGameStarted(true);
    const newGame = new Chess();
    setGame(newGame);
    setMoveHistory([]);
    setCritique(null);
    setLastBestMove('');
  };

  const undoMove = () => {
    // Critique is active → bot hasn't moved yet → only undo the player's last move (1x)
    game.undo();

    // Rebuild from remaining history so history is fully preserved
    const remaining = game.history();
    const newGame = rebuildGame(remaining);
    
    // Save the recommended move so we expect it on the very next turn
    const expectedTargetMove = critique?.bestMove || '';

    setGame(newGame);
    setMoveHistory([...remaining]);
    setCritique(null);
    setLastBestMove(expectedTargetMove); 
    setMoveFrom(null);
    setOptionSquares({});
  };

  if (!gameStarted) {
    return (
      <div className="start-screen">
        <div className="start-card">
          <h1>Sempurnakan Catur Anda</h1>
          <p>Pilih sisi dan tingkat kesulitan untuk mulai belajar dengan presisi tinggi.</p>
          
          <div className="setup-section">
            <h3>Pilih Sisi:</h3>
            <div className="btn-group">
              <button 
                className={playerColor === 'w' ? 'active' : ''} 
                onClick={() => setPlayerColor('w')}
              >
                Putih (Jalan Duluan)
              </button>
              <button 
                className={playerColor === 'b' ? 'active' : ''} 
                onClick={() => setPlayerColor('b')}
              >
                Hitam
              </button>
            </div>
          </div>

          <div className="setup-section">
            <h3>Tingkat Kesulitan Bot:</h3>
            <div className="difficulty-grid">
              {(['easy', 'medium', 'hard', 'master'] as Difficulty[]).map((d) => (
                <button 
                  key={d}
                  className={difficulty === d ? 'active' : ''} 
                  onClick={() => setDifficultyLevel(d)}
                >
                  {d === 'easy' ? 'Pemula' : d === 'medium' ? 'Menengah' : d === 'hard' ? 'Ahli' : 'Master'}
                </button>
              ))}
            </div>
          </div>

          <button className="main-start-btn" onClick={() => startGame(playerColor, difficulty)}>
            Mulai Permainan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="game-layout">
        <div className="board-section">
          <EvaluationBar evaluation={evaluation} />
          
          <div className="chessboard-wrapper">
            <Chessboard 
              options={{
                position: game.fen(), 
                onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop(sourceSquare, targetSquare ?? ''), 
                onSquareClick: onSquareClick,
                boardOrientation: playerColor === 'w' ? "white" : "black",
                darkSquareStyle: { backgroundColor: '#475569' },
                lightSquareStyle: { backgroundColor: '#94a3b8' },
                squareStyles: optionSquares
              }}
            />
          </div>
        </div>

        <div className="sidebar">
          <div className="game-info-header">
            <div className="status-badge">
              {game.turn() === playerColor ? 'Giliran Anda' : 'Bot Berpikir...'}
            </div>
            <div className="difficulty-tag">{difficulty.toUpperCase()}</div>
          </div>

          {critique && (
            <div className="critique-panel">
              <div className="critique-header">
                <span className="warning-icon">⚠️</span>
                <span>Saran Perbaikan</span>
              </div>
              <div className="critique-content">
                <p>Langkah Anda: <strong>{critique.userMove}</strong></p>
                <p>Ada yang lebih akurat: <strong>{critique.bestMove}</strong></p>
                <div className="critique-reason">{critique.reason}</div>
                <div className="critique-controls">
                  <button className="undo-retry-btn" onClick={undoMove}>
                    Undo & Coba Lagi
                  </button>
                  <button className="continue-btn" onClick={() => setCritique(null)}>
                    Lanjutkan Permainan
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="analysis-info">
             <div className="eval-status">
              <strong>Evaluasi:</strong> {evaluation > 0 ? '+ ' + evaluation.toFixed(1) : evaluation.toFixed(1)}
            </div>
          </div>

          <h3>Riwayat Langkah</h3>
          <div className="history-list">
            {moveHistory.map((move, index) => (
              <div key={index} className="move-item">
                <span className="move-num">{Math.floor(index / 2) + 1}.</span>
                <span className="move-san">{move}</span>
              </div>
            ))}
          </div>

          <div className="controls">
            <button onClick={() => setGameStarted(false)} className="secondary-btn">
              Menu Utama
            </button>
            <button onClick={() => startGame(playerColor, difficulty)} className="danger-btn">
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
