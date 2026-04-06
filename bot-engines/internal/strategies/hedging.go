package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Hedging opens opposite spot/futures positions when volatility spikes to
// reduce portfolio risk, using ATR-based hedge ratio calculations.
type Hedging struct{}

func init() { engine.Register(&Hedging{}) }

func (s *Hedging) Name() string     { return "Hedging Bot" }
func (s *Hedging) Slug() string     { return "hedging" }
func (s *Hedging) Category() string { return "pro" }
func (s *Hedging) Description() string {
	return "Spot/futures hedging triggered by volatility spikes with ATR-based sizing"
}

func (s *Hedging) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"atr_period":        14,
			"vol_spike_mult":    1.8,
			"vol_lookback":      20,
			"min_depth_usd":     20000.0,
			"hedge_atr_mult":    1.5,
			"sl_atr_mult":       2.5,
			"tp_atr_mult":       1.0,
			"max_spread_bps":    20.0,
		},
	}
}

func (s *Hedging) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	atrPeriod := getInt(p, "atr_period", 14)
	volSpikeMult := getFloat(p, "vol_spike_mult", 1.8)
	volLookback := getInt(p, "vol_lookback", 20)
	minDepth := getFloat(p, "min_depth_usd", 20000)
	slAtrMult := getFloat(p, "sl_atr_mult", 2.5)
	tpAtrMult := getFloat(p, "tp_atr_mult", 1.0)
	maxSpreadBps := getFloat(p, "max_spread_bps", 20)

	price := data.Price
	candles := data.Candles

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"atr_pct":    data.AtrPct,
			"spread_bps": data.SpreadBps,
			"depth_usd":  data.DepthUsd,
		},
	}

	if data.SpreadBps > maxSpreadBps {
		sig.Reason = fmt.Sprintf("spread %.1f bps too wide for hedging (max %.1f)", data.SpreadBps, maxSpreadBps)
		return sig, nil
	}
	if data.DepthUsd < minDepth {
		sig.Reason = fmt.Sprintf("depth $%.0f insufficient (min $%.0f)", data.DepthUsd, minDepth)
		return sig, nil
	}

	if len(candles) < atrPeriod+volLookback+1 {
		sig.Reason = "insufficient candle data"
		return sig, nil
	}

	atrVals := engine.ATR(candles, atrPeriod)
	if atrVals == nil {
		sig.Reason = "ATR calculation failed"
		return sig, nil
	}

	currentATR := engine.LastNonZero(atrVals)
	atrPct := currentATR / price * 100
	sig.Indicators["current_atr"] = currentATR
	sig.Indicators["atr_pct_calc"] = atrPct

	// Historical ATR for baseline
	histATR := make([]float64, 0, volLookback)
	start := len(atrVals) - volLookback - 1
	if start < atrPeriod {
		start = atrPeriod
	}
	for i := start; i < len(atrVals)-1; i++ {
		if atrVals[i] > 0 {
			histATR = append(histATR, atrVals[i])
		}
	}

	if len(histATR) < 5 {
		sig.Reason = "insufficient ATR history"
		return sig, nil
	}

	meanATR := engine.Mean(histATR)
	sig.Indicators["mean_atr"] = meanATR

	volRatio := currentATR / meanATR
	sig.Indicators["vol_ratio"] = volRatio

	if volRatio < volSpikeMult {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(volRatio/volSpikeMult*40, 0, 50)
		sig.Reason = fmt.Sprintf("vol ratio %.2fx below spike threshold %.2fx", volRatio, volSpikeMult)
		return sig, nil
	}

	// Volatility spike detected — hedge direction based on recent trend
	closes := engine.ClosesFromCandles(candles)
	recentDir := closes[len(closes)-1] - closes[len(closes)-4]
	score := engine.Clamp((volRatio-volSpikeMult)*40+30, 20, 100)

	slDist := currentATR * slAtrMult
	tpDist := currentATR * tpAtrMult

	if recentDir > 0 {
		// Market moving up — hedge with SHORT
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price + slDist
		sig.TakeProfit = price - tpDist
		sig.TakeProfit2 = price - tpDist*1.5
		sig.Reason = fmt.Sprintf("vol spike %.2fx — hedge short against upward move, ATR $%.2f", volRatio, currentATR)
	} else {
		// Market moving down — hedge with LONG
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = math.Max(price-slDist, 0)
		sig.TakeProfit = price + tpDist
		sig.TakeProfit2 = price + tpDist*1.5
		sig.Reason = fmt.Sprintf("vol spike %.2fx — hedge long against downward move, ATR $%.2f", volRatio, currentATR)
	}

	return sig, nil
}
