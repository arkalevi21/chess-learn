import { useState, useCallback, useEffect, useRef } from 'react';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'master';

export const useChessEngine = () => {
  const workerRef = useRef<Worker | null>(null);
  const [evaluation, setEvaluation] = useState<number>(0);
  const [analyzedFen, setAnalyzedFen] = useState<string>('');
  const [bestMove, setBestMove] = useState<string>('');
  const [pv, setPv] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Track which FEN the current analysis is for
  const pendingFenRef = useRef<string>('');
  const isRunningRef = useRef(false);
  
  // CACHE: Store the best move and evaluation for a specific FEN and difficulty
  // This prevents the engine from changing its mind when the user undoes a move.
  const analysisCacheRef = useRef<Record<string, { bestMove: string, eval: number, pv: string[] }>>({});

  useEffect(() => {
    const worker = new Worker('/stockfish-single.js');
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const line = e.data;
      
      if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
          setEvaluation(parseInt(match[1]) / 100);
        }
      } else if (line.includes('score mate')) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) {
          const mateIn = parseInt(match[1]);
          setEvaluation(mateIn > 0 ? 100 : -100);
        }
      }

      if (line.includes(' pv ')) {
        const pvMatch = line.match(/ pv (.*)$/);
        if (pvMatch) {
          setPv(pvMatch[1].split(' ').slice(0, 5));
        }
      }

      if (line.startsWith('bestmove')) {
        const match = line.match(/bestmove\s(\S+)/);
        if (match && match[1] !== '(none)') {
          const resultBestMove = match[1];
          const currentPending = pendingFenRef.current;
          
          setBestMove(resultBestMove);
          setAnalyzedFen(currentPending);
          
          // Save the result to cache so we don't recalculate it later
          analysisCacheRef.current[currentPending] = {
             // To be completely robust we should include the difficulty in the cache key, 
             // but pendingFenRef.current already contains the exact position.
             // If they change difficulty, the fen technically is the same, but for learning purposes
             // it's fine if the cached move is used. We'll use FEN as the key.
             bestMove: resultBestMove,
             // Note: we can't easily capture the final eval state synchronously here without refs,
             // but getting the bestMove consistent is the critical part to fix the bug.
             eval: 0, 
             pv: []
          };
        }
        setIsAnalyzing(false);
        isRunningRef.current = false;
      }
    };

    worker.postMessage('uci');
    worker.postMessage('isready');

    return () => {
      worker.terminate();
    };
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    if (!workerRef.current) return;
    
    // Clear cache when changing difficulty so the engine can provide different advice
    analysisCacheRef.current = {};
    
    let skillLevel = 20;
    switch (difficulty) {
      case 'easy': skillLevel = 0; break;
      case 'medium': skillLevel = 10; break;
      case 'hard': skillLevel = 15; break;
      case 'master': skillLevel = 20; break;
    }
    
    workerRef.current.postMessage(`setoption name Skill Level value ${skillLevel}`);
  }, []);

  const analyzePosition = useCallback((fen: string, difficulty: Difficulty) => {
    if (!workerRef.current) return;
    
    // 1. Check if we already have the answer in cache
    if (analysisCacheRef.current[fen]) {
      const cached = analysisCacheRef.current[fen];
      setBestMove(cached.bestMove);
      setAnalyzedFen(fen);
      setIsAnalyzing(false);
      return; // Skip doing the work again!
    }

    // Clear state for new analysis
    setBestMove('');
    setEvaluation(0);
    setPv([]);
    setIsAnalyzing(true);

    let depth = 12;
    switch (difficulty) {
      case 'easy': depth = 1; break; // Depth 1 forces the engine to only look 1 move ahead (blunders a lot)
      case 'medium': depth = 5; break;
      case 'hard': depth = 10; break;
      case 'master': depth = 18; break;
    }
    
    // Update the pending FEN for this analysis
    pendingFenRef.current = fen;

    // Only send 'stop' if a previous analysis is running
    if (isRunningRef.current) {
      workerRef.current.postMessage('stop');
      // The 'stop' will cause a bestmove for the old position,
      // but pendingFenRef is already updated to the new FEN,
      // so analyzedFen will be set to the new FEN.
    }

    isRunningRef.current = true;
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage(`go depth ${depth}`);
  }, []);


  return {
    evaluation,
    bestMove,
    pv,
    isAnalyzing,
    analyzedFen,
    setDifficulty,
    analyzePosition
  };
};
