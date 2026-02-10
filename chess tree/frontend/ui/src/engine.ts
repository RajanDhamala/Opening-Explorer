/*!
 * Stockfish.js 17.1 NNUE Engine Wrapper
 * Uses nmrugg/stockfish.js — same engine as Chess.com
 * Supports all 5 engine variants with user selection.
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

export type EngineVariantId =
  | 'nnue-multi'
  | 'nnue-single'
  | 'nnue-lite-multi'
  | 'nnue-lite-single'
  | 'asm';

export interface EngineVariant {
  id: EngineVariantId;
  name: string;
  description: string;
  workerPath: string;
  size: string;
  strength: number;       // 1–5 stars
  multiThreaded: boolean;
  requiresCORS: boolean;
  icon: string;           // emoji
}

export type EngineOptions = {
  threads: number;
  hash: number;
  multiPV: number;
};

const getDefaultThreads = () =>
  Math.max(1, typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1);

const DEFAULT_HASH = 128;
const DEFAULT_MULTIPV = 3;

const normalizeOptions = (options: Partial<EngineOptions>, variant: EngineVariant): EngineOptions => {
  const threads = Math.max(1, Math.floor(options.threads ?? getDefaultThreads()));
  const hash = Math.max(16, Math.floor(options.hash ?? DEFAULT_HASH));
  const multiPV = Math.max(1, Math.floor(options.multiPV ?? DEFAULT_MULTIPV));
  return {
    threads: variant.multiThreaded ? threads : 1,
    hash,
    multiPV,
  };
};

export const ENGINE_VARIANTS: EngineVariant[] = [
  {
    id: 'nnue-multi',
    name: 'NNUE Full (Multi-Thread)',
    description: 'Strongest. Uses all CPU cores. Same as Chess.com.',
    workerPath: '/stockfish/stockfish-17.1-8e4d048.js',
    size: '~75 MB',
    strength: 5,
    multiThreaded: true,
    requiresCORS: true,
    icon: '🏆',
  },
  {
    id: 'nnue-single',
    name: 'NNUE Full (Single-Thread)',
    description: 'Full NNUE neural net, single thread. No CORS needed.',
    workerPath: '/stockfish/stockfish-17.1-single-a496a04.js',
    size: '~75 MB',
    strength: 4,
    multiThreaded: false,
    requiresCORS: false,
    icon: '🧠',
  },
  {
    id: 'nnue-lite-multi',
    name: 'NNUE Lite (Multi-Thread)',
    description: 'Smaller neural net, multi-threaded. Good for mobile.',
    workerPath: '/stockfish/stockfish-17.1-lite-51f59da.js',
    size: '~7 MB',
    strength: 3,
    multiThreaded: true,
    requiresCORS: true,
    icon: '⚡',
  },
  {
    id: 'nnue-lite-single',
    name: 'NNUE Lite (Single-Thread)',
    description: 'Lightweight, works everywhere. Good balance.',
    workerPath: '/stockfish/stockfish-17.1-lite-single-03e3232.js',
    size: '~7 MB',
    strength: 2,
    multiThreaded: false,
    requiresCORS: false,
    icon: '💡',
  },
  {
    id: 'asm',
    name: 'ASM.js (Legacy)',
    description: 'JavaScript fallback. Slowest but universal compat.',
    workerPath: '/stockfish/stockfish-17.1-asm-341ff22.js',
    size: '~10 MB',
    strength: 1,
    multiThreaded: false,
    requiresCORS: false,
    icon: '🔧',
  },
];

export function hasSharedArrayBuffer(): boolean {
  try {
    return typeof SharedArrayBuffer !== 'undefined';
  } catch {
    return false;
  }
}

export function getDefaultVariant(): EngineVariant {
  const hasSAB = hasSharedArrayBuffer();
  return ENGINE_VARIANTS.find(v =>
    hasSAB ? v.id === 'nnue-multi' : v.id === 'nnue-lite-single'
  )!;
}

export default class Engine {
  stockfish: Worker;
  isReady: boolean;
  variant: EngineVariant;
  options: EngineOptions;
  private messageCallback: ((messageData: EngineMessage) => void) | null = null;
  private pvLines = new Map<number, PVLine>();

  constructor(variant?: EngineVariant, options: Partial<EngineOptions> = {}) {
    this.variant = variant ?? getDefaultVariant();
    this.options = normalizeOptions(options, this.variant);
    console.log(`[Engine] Loading ${this.variant.name} (${this.variant.size}) from ${this.variant.workerPath}`);
    this.stockfish = new Worker(this.variant.workerPath);
    this.isReady = false;

    this.stockfish.addEventListener('message', (e) => {
      const data = this.transformSFMessageData(e);
      if (this.messageCallback) this.messageCallback(data);
    });

    this.stockfish.addEventListener('error', (e) => {
      console.error('[Engine] Worker error:', e);
    });

    this.init();
  }

  private transformSFMessageData(e: MessageEvent<string>): EngineMessage {
    const uciMessage = typeof e.data === 'string' ? e.data : String(e.data);

    const multipv = Number(uciMessage.match(/multipv\s+(\d+)/)?.[1]);
    const depth = Number(uciMessage.match(/depth\s+(\d+)/)?.[1]);
    const cp = uciMessage.match(/score cp (-?\d+)/)?.[1];
    const mate = uciMessage.match(/score mate (-?\d+)/)?.[1];
    const pv = uciMessage.match(/ pv (.+)/)?.[1];

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

  init() {
    console.log('[Engine] Initializing UCI...');
    this.stockfish.postMessage('uci');

    const onUciOk = (e: MessageEvent<string>) => {
      const msg = typeof e.data === 'string' ? e.data : String(e.data);
      if (msg.trim() === 'uciok') {
        this.stockfish.removeEventListener('message', onUciOk);
        this.configureEngine();
      }
    };
    this.stockfish.addEventListener('message', onUciOk);
  }

  private configureEngine() {
    this.applyOptions();
    this.stockfish.postMessage('setoption name UCI_AnalyseMode value true');
    this.stockfish.postMessage('ucinewgame');
    this.stockfish.postMessage('isready');

    const onReady = (e: MessageEvent<string>) => {
      const msg = typeof e.data === 'string' ? e.data : String(e.data);
      if (msg.trim() === 'readyok') {
        this.stockfish.removeEventListener('message', onReady);
        this.isReady = true;
        console.log(`[Engine] ${this.variant.name} ready!`);
      }
    };
    this.stockfish.addEventListener('message', onReady);
  }

  private applyOptions() {
    const { threads, hash, multiPV } = this.options;
    this.stockfish.postMessage(`setoption name Threads value ${threads}`);
    this.stockfish.postMessage(`setoption name Hash value ${hash}`);
    this.stockfish.postMessage(`setoption name MultiPV value ${multiPV}`);
    console.log(`[Engine] Options: Threads=${threads}, Hash=${hash}MB, MultiPV=${multiPV}`);
  }

  updateOptions(options: Partial<EngineOptions>) {
    this.options = normalizeOptions({ ...this.options, ...options }, this.variant);
    this.stockfish.postMessage('stop');
    this.applyOptions();
    this.stockfish.postMessage('isready');
  }

  onMessage(callback: (messageData: EngineMessage) => void) {
    this.messageCallback = callback;
  }

  onReady(callback: () => void) {
    if (this.isReady) {
      callback();
      return;
    }
    const check = setInterval(() => {
      if (this.isReady) {
        clearInterval(check);
        callback();
      }
    }, 100);
  }

  evaluatePosition(fen: string, moveTimeMs = 5000, depth = 25) {
    this.pvLines.clear();
    this.stockfish.postMessage('stop');
    this.stockfish.postMessage('ucinewgame');
    this.stockfish.postMessage('isready');

    const onReady = (e: MessageEvent<string>) => {
      const msg = typeof e.data === 'string' ? e.data : String(e.data);
      if (msg.trim() === 'readyok') {
        this.stockfish.removeEventListener('message', onReady);
        this.stockfish.postMessage(`position fen ${fen}`);
        this.stockfish.postMessage(`go movetime ${moveTimeMs} depth ${depth}`);
      }
    };
    this.stockfish.addEventListener('message', onReady);
  }

  stop() {
    this.stockfish.postMessage('stop');
  }

  terminate() {
    this.isReady = false;
    this.stockfish.postMessage('quit');
  }
}
