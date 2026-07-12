package Processpipline

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	types "chess/Types"

	stockfish "github.com/RajanDhamala/go-stockfish"
)

type positionEvaluator interface {
	Evaluate(context.Context, stockfish.EvalRequest) (stockfish.EvalResult, error)
}

type evaluationCacheEntry struct {
	ready  chan struct{}
	result types.EvalResult
	err    error
}

type evaluationCache struct {
	mu      sync.Mutex
	entries map[string]*evaluationCacheEntry
}

type evaluationMetrics struct {
	Requests          atomic.Int64
	CacheHits         atomic.Int64
	EngineEvaluations atomic.Int64
	EngineTimeNS      atomic.Int64
}

type evaluationMetricsContextKey struct{}

func metricsFromContext(ctx context.Context) *evaluationMetrics {
	metrics, _ := ctx.Value(evaluationMetricsContextKey{}).(*evaluationMetrics)
	return metrics
}

type Processor struct {
	client          positionEvaluator
	config          PipelineConfig
	cache           *evaluationCache
	evalSlots       chan struct{}
	sharedEvalSlots chan struct{}
	scoutSlots      chan struct{}
}

// A Stockfish client owns a fixed worker pool, but the API can create several
// Processors concurrently (for example, overlapping /games/process requests).
// Keep one admission limit per client so those Processors cannot collectively
// queue more searches than the engine pool can run before their deadlines.
var stockfishEvaluationSlots sync.Map // map[*stockfish.Client]chan struct{}

func NewProcessor(client *stockfish.Client, config PipelineConfig) *Processor {
	config = normalizePipelineConfig(config)
	return newProcessorWithSharedSlots(
		client,
		config,
		sharedStockfishEvaluationSlots(client, config.PositionConcurrency),
	)
}

func newProcessor(client positionEvaluator, config PipelineConfig) *Processor {
	config = normalizePipelineConfig(config)
	return newProcessorWithSharedSlots(client, config, nil)
}

func newProcessorWithSharedSlots(
	client positionEvaluator,
	config PipelineConfig,
	sharedSlots chan struct{},
) *Processor {
	return &Processor{
		client:          client,
		config:          config,
		sharedEvalSlots: sharedSlots,
		cache: &evaluationCache{
			entries: make(map[string]*evaluationCacheEntry),
		},
		evalSlots:  make(chan struct{}, config.PositionConcurrency),
		scoutSlots: make(chan struct{}, config.ScoutGameConcurrency),
	}
}

func sharedStockfishEvaluationSlots(client *stockfish.Client, capacity int) chan struct{} {
	if client == nil {
		return nil
	}
	if capacity < 1 {
		capacity = 1
	}
	created := make(chan struct{}, capacity)
	actual, _ := stockfishEvaluationSlots.LoadOrStore(client, created)
	return actual.(chan struct{})
}

// EvaluateRawStockfish lets non-pipeline endpoints share the same process-wide
// admission limit as game analysis instead of bypassing it and overfilling the
// client's deadline-bearing queue.
func EvaluateRawStockfish(
	ctx context.Context,
	client *stockfish.Client,
	request stockfish.EvalRequest,
) (stockfish.EvalResult, error) {
	if client == nil {
		return stockfish.EvalResult{}, errors.New("stockfish client is not initialized")
	}
	slots := sharedStockfishEvaluationSlots(client, DefaultPipelineConfig().PositionConcurrency)
	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	case <-ctx.Done():
		return stockfish.EvalResult{}, ctx.Err()
	}
	return client.Evaluate(ctx, request)
}

func (p *Processor) acquireScoutSlot(ctx context.Context) error {
	select {
	case p.scoutSlots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (p *Processor) releaseScoutSlot() {
	<-p.scoutSlots
}

func (p *Processor) evaluate(
	ctx context.Context,
	fen string,
	depth int,
	multiPV int,
	moveTime time.Duration,
) (types.EvalResult, error) {
	if p == nil || p.client == nil {
		return types.EvalResult{}, errors.New("stockfish client is not initialized")
	}

	key := evaluationCacheKey(fen, depth, multiPV, moveTime)
	metrics := metricsFromContext(ctx)
	if metrics != nil {
		metrics.Requests.Add(1)
	}
	p.cache.mu.Lock()
	if existing, ok := p.cache.entries[key]; ok {
		if metrics != nil {
			metrics.CacheHits.Add(1)
		}
		p.cache.mu.Unlock()
		select {
		case <-ctx.Done():
			return types.EvalResult{}, ctx.Err()
		case <-existing.ready:
			return cloneEvalResult(existing.result), existing.err
		}
	}

	entry := &evaluationCacheEntry{ready: make(chan struct{})}
	p.cache.entries[key] = entry
	p.cache.mu.Unlock()

	select {
	case p.evalSlots <- struct{}{}:
	case <-ctx.Done():
		err := ctx.Err()
		p.finishEvaluationCacheEntry(key, entry, types.EvalResult{}, err)
		return types.EvalResult{}, err
	}
	if p.sharedEvalSlots != nil {
		select {
		case p.sharedEvalSlots <- struct{}{}:
		case <-ctx.Done():
			<-p.evalSlots
			err := ctx.Err()
			p.finishEvaluationCacheEntry(key, entry, types.EvalResult{}, err)
			return types.EvalResult{}, err
		}
	}
	if metrics != nil {
		metrics.EngineEvaluations.Add(1)
	}
	engineStarted := time.Now()
	raw, err := p.client.Evaluate(ctx, stockfish.EvalRequest{
		FEN:      fen,
		Depth:    depth,
		MultiPV:  multiPV,
		MoveTime: moveTime,
	})
	if metrics != nil {
		metrics.EngineTimeNS.Add(time.Since(engineStarted).Nanoseconds())
	}
	if p.sharedEvalSlots != nil {
		<-p.sharedEvalSlots
	}
	<-p.evalSlots
	result := types.EvalResult{}
	if err == nil {
		result = normalizeEvaluation(fen, raw)
	}
	p.finishEvaluationCacheEntry(key, entry, result, err)

	return cloneEvalResult(result), err
}

func evaluationCacheKey(fen string, depth int, multiPV int, moveTime time.Duration) string {
	return fmt.Sprintf("%s|d%d|mpv%d|t%d", fen, depth, multiPV, moveTime.Nanoseconds())
}

func (p *Processor) finishEvaluationCacheEntry(
	key string,
	entry *evaluationCacheEntry,
	result types.EvalResult,
	err error,
) {
	p.cache.mu.Lock()
	defer p.cache.mu.Unlock()
	if err == nil {
		entry.result = result
		entry.err = nil
	} else {
		entry.err = err
		if current, ok := p.cache.entries[key]; ok && current == entry {
			delete(p.cache.entries, key)
		}
	}
	close(entry.ready)
}

func normalizeEvaluation(fen string, input stockfish.EvalResult) types.EvalResult {
	score, mate := normalizeToWhitePerspective(fen, input.ScoreCP, input.Mate)
	lines := make([]types.EvalLine, 0, len(input.Lines))
	for _, line := range input.Lines {
		lineScore, lineMate := normalizeToWhitePerspective(fen, line.ScoreCP, line.Mate)
		lines = append(lines, types.EvalLine{
			MultiPV: line.MultiPV,
			PV:      normalizePV(line.PV),
			Depth:   line.Depth,
			ScoreCP: lineScore,
			Mate:    lineMate,
		})
	}
	sort.SliceStable(lines, func(left int, right int) bool {
		leftMultiPV := lines[left].MultiPV
		if leftMultiPV <= 0 {
			leftMultiPV = left + 1
		}
		rightMultiPV := lines[right].MultiPV
		if rightMultiPV <= 0 {
			rightMultiPV = right + 1
		}
		return leftMultiPV < rightMultiPV
	})

	return types.EvalResult{
		BestMove: normalizeUCIMove(input.BestMove),
		Ponder:   normalizeUCIMove(input.Ponder),
		PV:       normalizePV(input.PV),
		Depth:    input.Depth,
		ScoreCP:  score,
		Mate:     mate,
		Lines:    lines,
	}
}

func normalizeToWhitePerspective(fen string, scoreCP *int, mate *int) (*int, *int) {
	parts := strings.Fields(fen)
	if len(parts) < 2 || parts[1] != "b" {
		return cloneInt(scoreCP), cloneInt(mate)
	}

	var normalizedScore *int
	if scoreCP != nil {
		value := -*scoreCP
		normalizedScore = &value
	}
	var normalizedMate *int
	if mate != nil {
		value := -*mate
		normalizedMate = &value
	}
	return normalizedScore, normalizedMate
}

func cloneEvalResult(input types.EvalResult) types.EvalResult {
	result := types.EvalResult{
		BestMove: input.BestMove,
		Ponder:   input.Ponder,
		PV:       append([]string(nil), input.PV...),
		Solution: append([]string(nil), input.Solution...),
		Depth:    input.Depth,
		ScoreCP:  cloneInt(input.ScoreCP),
		Mate:     cloneInt(input.Mate),
	}
	if len(input.Lines) > 0 {
		result.Lines = make([]types.EvalLine, 0, len(input.Lines))
		for _, line := range input.Lines {
			result.Lines = append(result.Lines, types.EvalLine{
				MultiPV: line.MultiPV,
				PV:      append([]string(nil), line.PV...),
				Depth:   line.Depth,
				ScoreCP: cloneInt(line.ScoreCP),
				Mate:    cloneInt(line.Mate),
			})
		}
	}
	return result
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func normalizePV(moves []string) []string {
	if len(moves) == 0 {
		return nil
	}
	result := make([]string, 0, len(moves))
	for _, move := range moves {
		if normalized := normalizeUCIMove(move); normalized != "" {
			result = append(result, normalized)
		}
	}
	return result
}

func normalizeUCIMove(move string) string {
	fields := strings.Fields(strings.ToLower(strings.TrimSpace(move)))
	if len(fields) == 0 {
		return ""
	}
	if fields[0] == "bestmove" && len(fields) > 1 {
		fields = fields[1:]
	}
	if fields[0] == "none" || fields[0] == "(none)" {
		return ""
	}
	return fields[0]
}

func sameUCIMove(left string, right string) bool {
	left = normalizeUCIMove(left)
	right = normalizeUCIMove(right)
	return left != "" && left == right
}

func scoreForSide(scoreCP *int, mate *int, sideIsWhite bool) (int, bool) {
	if mate != nil {
		value := *mate
		if !sideIsWhite {
			value = -value
		}
		const mateEquivalentCP = 100000
		if value > 0 {
			return mateEquivalentCP - abs(value)*100, true
		}
		if value < 0 {
			return -mateEquivalentCP + abs(value)*100, true
		}
	}
	if scoreCP == nil {
		return 0, false
	}
	value := *scoreCP
	if !sideIsWhite {
		value = -value
	}
	return value, true
}

func evaluationScoreForSide(eval types.EvalResult, sideIsWhite bool) (int, bool) {
	return scoreForSide(eval.ScoreCP, eval.Mate, sideIsWhite)
}

func lineScoreForSide(line types.EvalLine, sideIsWhite bool) (int, bool) {
	return scoreForSide(line.ScoreCP, line.Mate, sideIsWhite)
}

func winChanceForSide(scoreCP *int, mate *int, sideIsWhite bool) (float64, bool) {
	if mate != nil {
		value := *mate
		if !sideIsWhite {
			value = -value
		}
		if value > 0 {
			return 100, true
		}
		if value < 0 {
			return 0, true
		}
	}
	score, ok := scoreForSide(scoreCP, nil, sideIsWhite)
	if !ok {
		return 0, false
	}
	return winChance(score), true
}

func evaluationWinChance(eval types.EvalResult, sideIsWhite bool) (float64, bool) {
	return winChanceForSide(eval.ScoreCP, eval.Mate, sideIsWhite)
}

func lineWinChance(line types.EvalLine, sideIsWhite bool) (float64, bool) {
	return winChanceForSide(line.ScoreCP, line.Mate, sideIsWhite)
}

func winChance(cp int) float64 {
	return 50 + 50*(2/(1+math.Exp(-0.00368208*float64(cp)))-1)
}

func mateForSide(mate *int, sideIsWhite bool) (int, bool) {
	if mate == nil {
		return 0, false
	}
	value := *mate
	if !sideIsWhite {
		value = -value
	}
	return value, true
}

func engineReason(err error) (string, string) {
	if err == nil {
		return "", ""
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return ReasonEngineTimeout, err.Error()
	}
	return ReasonEngineUnavailable, err.Error()
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
