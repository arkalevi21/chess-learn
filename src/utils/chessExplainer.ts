import { Chess } from 'chess.js';

export interface ExplanationResult {
  reason: string;
  category: 'attack' | 'defense' | 'development' | 'strategy' | 'tactics';
}

/**
 * Generates an Indonesian explanation for a suggested move compared to a user's move.
 * If punishmentMoveStr is provided, it indicates the opponent's dangerous reply to the bad move.
 */
export const getIndonesianExplanation = (
  game: Chess,
  moveStr: string,
  _evaluation: number,
  punishmentMoveStr?: string
): ExplanationResult => {
  let move;
  try {
    if (moveStr.length >= 4) {
      const from = moveStr.slice(0, 2);
      const to = moveStr.slice(2, 4);
      const promotion = moveStr.slice(4, 5) || undefined;
      
      const legalMoves = game.moves({ verbose: true });
      move = legalMoves.find(m => m.from === from && m.to === to && (!promotion || m.promotion === promotion));
    }
  } catch (e) {
    return { reason: "Menganalisis alasan strategis...", category: 'strategy' };
  }

  if (!move) {
    return { reason: "Langkah ini lebih akurat untuk menjaga struktur dan kontrol papan.", category: 'strategy' };
  }

  const pieceName = getPieceNameIndo(move.piece);

  const getPunishmentWarning = () => {
    if (!punishmentMoveStr || punishmentMoveStr.length < 4) return "";
    
    let punishmentPiece = "Perwira";
    try {
      const startSquare = punishmentMoveStr.slice(0, 2);
      const pieceOnSquare = game.get(startSquare as any);
      if (pieceOnSquare) {
        punishmentPiece = getPieceNameIndo(pieceOnSquare.type);
      }
    } catch(e) {}

    const toSquare = punishmentMoveStr.slice(2, 4);
    return ` Hati-hati! Langkah Anda membiarkan musuh membalas dengan memindahkan ${punishmentPiece} ke ${toSquare}, ancaman yang nyata!`;
  };

  const punishmentWarning = getPunishmentWarning();

  if (move.captured) {
    const capturedName = getPieceNameIndo(move.captured);
    return { 
      reason: `Langkah ini jauh lebih baik karena langsung memenangkan material dengan memakan ${capturedName} lawan menggunakan ${pieceName}.` + punishmentWarning,
      category: 'tactics' 
    };
  }

  if (move.san.includes('+')) {
    return { 
      reason: `Langkah ini memberikan tekanan kritis kepada Raja lawan (Skak) dan memaksa lawan berpindah dari posisi idealnya.` + punishmentWarning,
      category: 'attack' 
    };
  }

  if (move.flags.includes('k') || move.flags.includes('q')) {
    return { 
      reason: "Prioritas utama adalah keamanan Raja. Rokade menempatkan Raja di posisi aman dan mengaktifkan Benteng Anda." + punishmentWarning,
      category: 'defense' 
    };
  }

  // Positional patterns
  if (move.piece === 'p') {
    if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) {
      return { 
        reason: "Dalam catur, kontrol pusat adalah segalanya. Bidak ini menguasai petak kunci dan membatasi ruang gerak perwira lawan." + punishmentWarning,
        category: 'strategy' 
      };
    }
    return { 
      reason: "Langkah ini memperbaiki struktur bidak Anda dan membuka jalur penting untuk perwira besar lainnya." + punishmentWarning,
      category: 'development' 
    };
  }

  if (['n', 'b'].includes(move.piece)) {
    return { 
      reason: `Mengembangkan ${pieceName} ke petak yang lebih aktif memungkinkan koordinasi serangan yang lebih kuat di langkah berikutnya.` + punishmentWarning,
      category: 'development' 
    };
  }

  if (move.piece === 'q') {
    return { 
      reason: "Menteri perlu ditempatkan di posisi di mana ia bisa mengancam banyak area sekaligus tanpa terjebak oleh bidak lawan." + punishmentWarning,
      category: 'attack' 
    };
  }

  if (move.piece === 'r') {
    return { 
      reason: "Benteng paling kuat di baris yang terbuka. Langkah ini mempersiapkan tekanan jangka panjang di file tersebut." + punishmentWarning,
      category: 'strategy' 
    };
  }

  return { 
    reason: "Langkah ini secara halus meningkatkan koordinasi antar perwira Anda dan mencegah rencana serangan balik lawan." + punishmentWarning,
    category: 'strategy' 
  };
};

const getPieceNameIndo = (p: string): string => {
  const names: Record<string, string> = {
    'p': 'Bidak',
    'n': 'Kuda',
    'b': 'Gajah',
    'r': 'Benteng',
    'q': 'Menteri',
    'k': 'Raja'
  };
  return names[p.toLowerCase()] || 'Perwira';
};
