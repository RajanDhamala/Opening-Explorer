/*!
 * Stockfish.js (http://github.com/nmrugg/stockfish.js)
 * License: GPL
 */

type PVLine = {
  multipv: number;
  depth: number;
  scoreCp?: number;
  mate?: number;
  pv: string;
};

type EngineMessage = {
  uciMessage: string;
  bestMove?: string;
  ponder?: string;
  lines?: PVLine[];
};

export default class Engine {
  stockfish: Worker;
  isReady: boolean;
  private messageCallback: ((messageData: EngineMessage) => void) | null = null;
  private pvLines = new Map<number, PVLine>();

  constructor() {
    console.log('[Engine] Creating new Stockfish worker...');
    this.stockfish = new Worker('/stockfish.wasm.js');
    this.isReady = false;

    // Message handler
    this.stockfish.addEventListener('message', (e) => {
      const data = this.transformSFMessageData(e);
      console.log('[Engine] SF Message:', data.uciMessage.substring(0, 100));
      if (this.messageCallback) this.messageCallback(data);
    });

    this.stockfish.addEventListener('error', (e) => {
      console.error('[Engine] Worker error:', e);
    });

    this.init();
  }

  // Parse Stockfish UCI messages
  private transformSFMessageData(e: MessageEvent<string>): EngineMessage {
    const uciMessage = e.data;

    const multipv = Number(uciMessage.match(/multipv\s+(\d+)/)?.[1]);
    const depth = Number(uciMessage.match(/depth\s+(\d+)/)?.[1]);
    const cp = uciMessage.match(/score cp (-?\d+)/)?.[1];
    const mate = uciMessage.match(/score mate (-?\d+)/)?.[1];
    const pv = uciMessage.match(/ pv (.+)/)?.[1];

    // Store PV lines in map
    if (multipv && pv) {
      this.pvLines.set(multipv, {
        multipv,
        depth,
        scoreCp: cp ? Number(cp) : undefined,
        mate: mate ? Number(mate) : undefined,
        pv,
      });
    }

    return {
      uciMessage,
      bestMove: uciMessage.match(/bestmove\s+(\S+)/)?.[1],
      ponder: uciMessage.match(/ponder\s+(\S+)/)?.[1],
      lines: this.pvLines.size
        ? Array.from(this.pvLines.values()).sort((a, b) => a.multipv - b.multipv)
        : undefined,
    };
  }

  // Initialize Stockfish
  init() {
    console.log('[Engine] Initializing UCI...');
    this.stockfish.postMessage('uci');
    this.stockfish.postMessage('isready');
  }

  // Set message callback
  onMessage(callback: (messageData: EngineMessage) => void) {
    this.messageCallback = callback;
  }

  // Ready callback
  onReady(callback: () => void) {
    const originalCallback = this.messageCallback;
    this.messageCallback = (data) => {
      if (data.uciMessage === 'readyok') {
        this.isReady = true;
        console.log('[Engine] Stockfish is ready!');
        // Set options AFTER ready

        // Set engine options
        this.stockfish.postMessage('setoption name MultiPV value 3');   // Show top 3 lines
        this.stockfish.postMessage('setoption name Threads value 8');   // Use 8 CPU threads
        this.stockfish.postMessage('setoption name Hash value 2048');   // 2 GB hash
        this.stockfish.postMessage('setoption name Skill Level value 20'); // Max skill level
        callback();

      }
      if (originalCallback) originalCallback(data);
    };
  }

  // Evaluate position with time-based search
  evaluatePosition(fen: string, moveTimeMs = 5000, depth = 25) {
    console.log('[Engine] Evaluating position:', fen, 'movetime:', moveTimeMs, 'depth:', depth);

    this.pvLines.clear();

    this.stockfish.postMessage(`position fen ${fen}`);
    this.stockfish.postMessage(`go movetime ${moveTimeMs} depth ${depth}`);
  }


  // Stop current analysis
  stop() {
    console.log('[Engine] Stopping analysis');
    this.stockfish.postMessage('stop');
  }

  // Terminate the engine
  terminate() {
    console.log('[Engine] Terminating worker');
    this.isReady = false;
    this.stockfish.postMessage('quit');
  }
}
