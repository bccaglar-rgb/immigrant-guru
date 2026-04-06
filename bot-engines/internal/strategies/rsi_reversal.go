package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// RSIReversal trades mean-reversion signals when RSI reaches extreme
// oversold or overbought levels, confirmed by support/resistance proximity
// and volume spikes on the reversal candle.
type RSIReversal struct{}

func init() { engine.Register(&RSIReversal{}) }

func (s *RSIReversal) Name() string     { return "RSI Reversal Bot" }
func (s *RSIReversal) Slug() string     { return "rsi-reversal" }
func (s *RSIReversal) Category() string { return "market" }
func (s *RSIReversal) Description() string {
	return "Buys at oversold RSI and sells at overbought RSI with S/R and volume confirmation"
}

func (s *RSIReversal) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"rsi_oversold":    30.0,
			"rsi_overbought":  70.0,
			"sr_dist_max":     2.0,  // max distance to S/R in %
			"vol_spike_mult":  1.5,  // volume vs average to count as spike
			"vol_lookback":    20,
			"atr_sl_mult":     1.5,
			"atr_tp_mult":     2.5,
		},
	}
}

func (s *RSIReversal) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	rsiOversold := getFloat(p, "rsi_oversold", 30)
	rsiOverbought := getFloat(p, "rsi_overbought", 70)
	srDistMax := getFloat(p, "sr_dist_max", 2.0)
	volSpikeMult := getFloat(p, "vol_spike_mult", 1.5)
	volLookback := getInt(p, "vol_lookback", 20)
	atrSLMult := getFloat(p, "atr_sl_mult", 1.5)
	atrTPMult := getFloat(p, "atr_tp_mult", 2.5)

	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) < volLookback+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	rsi := data.Rsi14
	price := data.Price
	srDist := math.Abs(data.SrDistPct)

	// Compute ATR for stop/target sizing.
	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)

	// Volume spike detection on the latest candle.
	volumes := engine.VolumesFromCandles(data.Candles)
	n := len(volumes)
	avgVol := engine.Mean(volumes[maxInt(0, n-volLookback-1) : n-1])
	latestVol := 0.0
	if n > 0 {
		latestVol = volumes[n-1]
	}
	volRatio := 0.0
	if avgVol > 0 {
		volRatio = latestVol / avgVol
	}
	hasVolSpike := volRatio >= volSpikeMult

	// Recent low/high from last few candles for stop placement.
	lows := engine.LowsFromCandles(data.Candles)
	highs := engine.HighsFromCandles(data.Candles)
	recentLo := recentLow(lows[maxInt(0, n-5):])
	recentHi := recentHigh(highs[maxInt(0, n-5):])

	indicators := map[string]float64{
		"rsi":       rsi,
		"sr_dist":   srDist,
		"vol_ratio": volRatio,
		"atr":       atr,
		"recent_lo": recentLo,
		"recent_hi": recentHi,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Score:      0,
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	nearSR := srDist <= srDistMax

	// Oversold = potential LONG reversal.
	if rsi < rsiOversold {
		rsiExtreme := engine.Clamp((rsiOversold-rsi)*2.5, 0, 50)
		volScore := 0.0
		if hasVolSpike {
			volScore = engine.Clamp(volRatio*10, 0, 25)
		}
		srScore := 0.0
		if nearSR {
			srScore = engine.Clamp((srDistMax-srDist)*12.5, 0, 25)
		}
		totalScore := engine.Clamp(rsiExtreme+volScore+srScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "LONG"
		sig.EntryLow = recentLo
		sig.EntryHigh = price * 1.002
		sig.StopLoss = recentLo - atr*atrSLMult
		sig.TakeProfit = price + atr*atrTPMult
		sig.TakeProfit2 = price + atr*atrTPMult*1.5
		sig.Reason = fmt.Sprintf("RSI %.1f oversold, S/R dist %.2f%%, vol ratio %.2fx, ATR $%.2f",
			rsi, srDist, volRatio, atr)
		if totalScore < 35 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	// Overbought = potential SHORT reversal.
	if rsi > rsiOverbought {
		rsiExtreme := engine.Clamp((rsi-rsiOverbought)*2.5, 0, 50)
		volScore := 0.0
		if hasVolSpike {
			volScore = engine.Clamp(volRatio*10, 0, 25)
		}
		srScore := 0.0
		if nearSR {
			srScore = engine.Clamp((srDistMax-srDist)*12.5, 0, 25)
		}
		totalScore := engine.Clamp(rsiExtreme+volScore+srScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.998
		sig.EntryHigh = recentHi
		sig.StopLoss = recentHi + atr*atrSLMult
		sig.TakeProfit = price - atr*atrTPMult
		sig.TakeProfit2 = price - atr*atrTPMult*1.5
		sig.Reason = fmt.Sprintf("RSI %.1f overbought, S/R dist %.2f%%, vol ratio %.2fx, ATR $%.2f",
			rsi, srDist, volRatio, atr)
		if totalScore < 35 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	// RSI in neutral zone.
	distToExtreme := math.Min(rsi-rsiOversold, rsiOverbought-rsi)
	sig.Decision = "WATCH"
	sig.Score = engine.Clamp(20-distToExtreme, 0, 20)
	sig.Reason = fmt.Sprintf("RSI %.1f neutral — distance to extreme: %.1f", rsi, distToExtreme)
	return sig, nil
}

// maxInt returns the larger of a and b.
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
