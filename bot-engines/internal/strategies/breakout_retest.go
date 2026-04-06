package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// BreakoutRetest detects a breakout above resistance (or below support),
// waits for a retest of the breakout level, and enters on confirmation
// with a volume spike filter.
type BreakoutRetest struct{}

func init() { engine.Register(&BreakoutRetest{}) }

func (s *BreakoutRetest) Name() string        { return "Breakout Retest" }
func (s *BreakoutRetest) Slug() string        { return "breakout-retest" }
func (s *BreakoutRetest) Category() string    { return "breakout" }
func (s *BreakoutRetest) Description() string { return "Enters on retests of confirmed breakout levels with volume confirmation" }

func (s *BreakoutRetest) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"lookback":        20,
			"vol_spike_mult":  1.5,
			"retest_pct":      2.0,  // max distance from breakout level to count as retest (%)
			"sl_pct":          1.5,  // stop loss below breakout level (%)
			"measured_move":   true, // TP = breakout level + range height
			"min_range_pct":   1.0,  // minimum range height to consider (%)
		},
	}
}

func (s *BreakoutRetest) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	lookback := getInt(p, "lookback", 20)
	volSpikeMult := getFloat(p, "vol_spike_mult", 1.5)
	retestPct := getFloat(p, "retest_pct", 2.0)
	slPct := getFloat(p, "sl_pct", 1.5)
	minRangePct := getFloat(p, "min_range_pct", 1.0)

	closes := engine.ClosesFromCandles(data.Candles)
	highs := engine.HighsFromCandles(data.Candles)
	lows := engine.LowsFromCandles(data.Candles)
	vols := engine.VolumesFromCandles(data.Candles)

	need := lookback + 10
	if len(closes) < need {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	price := data.Price

	// Compute S/R from the lookback window (excluding the most recent 3 candles)
	srHighs := highs[len(highs)-lookback-3 : len(highs)-3]
	srLows := lows[len(lows)-lookback-3 : len(lows)-3]
	resistance := recentHigh(srHighs)
	support := recentLow(srLows)
	rangeHeight := resistance - support
	rangePct := rangeHeight / support * 100

	// Average volume over lookback
	avgVol := engine.Mean(vols[len(vols)-lookback:])
	curVol := vols[len(vols)-1]

	// Recent candles for breakout detection
	recentCloses := closes[len(closes)-3:]
	recentVols := vols[len(vols)-3:]

	indicators := map[string]float64{
		"resistance":   resistance,
		"support":      support,
		"range_pct":    rangePct,
		"avg_volume":   avgVol,
		"cur_volume":   curVol,
		"vol_ratio":    curVol / math.Max(avgVol, 1),
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	if rangePct < minRangePct {
		sig.Reason = fmt.Sprintf("range too tight (%.2f%% < %.2f%%)", rangePct, minRangePct)
		return sig, nil
	}

	// Detect bullish breakout: one of the recent candles closed above resistance with volume spike
	bullBreakout := false
	for i, c := range recentCloses {
		if c > resistance && recentVols[i] > avgVol*volSpikeMult {
			bullBreakout = true
			break
		}
	}

	// Detect bearish breakout
	bearBreakout := false
	for i, c := range recentCloses {
		if c < support && recentVols[i] > avgVol*volSpikeMult {
			bearBreakout = true
			break
		}
	}

	// Bullish retest: price pulled back close to resistance (now support)
	if bullBreakout {
		distFromResistance := pctDiff(price, resistance)
		if distFromResistance <= retestPct && price >= resistance*0.99 {
			score := engine.Clamp(70+(curVol/avgVol-1)*20, 40, 100)
			sl := resistance * (1 - slPct/100)
			tp := resistance + rangeHeight
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = resistance * 0.999
			sig.EntryHigh = resistance * 1.005
			sig.StopLoss = sl
			sig.TakeProfit = tp
			sig.TakeProfit2 = resistance + rangeHeight*1.5
			sig.Reason = fmt.Sprintf("bullish breakout retest at %.2f (resistance), dist %.2f%%", resistance, distFromResistance)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 40
		sig.Bias = "LONG"
		sig.Reason = fmt.Sprintf("bullish breakout confirmed — waiting for retest (price %.2f, level %.2f, dist %.2f%%)", price, resistance, pctDiff(price, resistance))
		return sig, nil
	}

	// Bearish retest: price pulled back close to support (now resistance)
	if bearBreakout {
		distFromSupport := pctDiff(price, support)
		if distFromSupport <= retestPct && price <= support*1.01 {
			score := engine.Clamp(70+(curVol/avgVol-1)*20, 40, 100)
			sl := support * (1 + slPct/100)
			tp := support - rangeHeight
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = support * 0.995
			sig.EntryHigh = support * 1.001
			sig.StopLoss = sl
			sig.TakeProfit = tp
			sig.TakeProfit2 = support - rangeHeight*1.5
			sig.Reason = fmt.Sprintf("bearish breakout retest at %.2f (support), dist %.2f%%", support, distFromSupport)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 40
		sig.Bias = "SHORT"
		sig.Reason = fmt.Sprintf("bearish breakout confirmed — waiting for retest (price %.2f, level %.2f)", price, support)
		return sig, nil
	}

	sig.Reason = "no breakout detected"
	return sig, nil
}
