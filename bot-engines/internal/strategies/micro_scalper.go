package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// MicroScalper captures tick-level momentum bursts using price change,
// spread analysis, orderbook depth, and imbalance data.
type MicroScalper struct{}

func init() { engine.Register(&MicroScalper{}) }

func (s *MicroScalper) Name() string     { return "Micro Scalper Bot" }
func (s *MicroScalper) Slug() string     { return "micro-scalper" }
func (s *MicroScalper) Category() string { return "scalping" }
func (s *MicroScalper) Description() string {
	return "Tick-level momentum scalper requiring ultra-tight spreads and deep orderbooks"
}

func (s *MicroScalper) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"spread_max_bps":  3.0,
			"depth_min_usd":   50000.0,
			"momentum_thresh": 0.05,
			"imbalance_min":   0.15,
			"tp_pct":          0.15,
			"sl_pct":          0.10,
			"lookback":        5,
		},
	}
}

func (s *MicroScalper) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	spreadMax := getFloat(p, "spread_max_bps", 3.0)
	depthMin := getFloat(p, "depth_min_usd", 50000)
	momThresh := getFloat(p, "momentum_thresh", 0.05)
	imbMin := getFloat(p, "imbalance_min", 0.15)
	tpPct := getFloat(p, "tp_pct", 0.15)
	slPct := getFloat(p, "sl_pct", 0.10)
	lookback := getInt(p, "lookback", 5)

	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) < lookback+1 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{
		"spread_bps": data.SpreadBps,
		"depth_usd":  data.DepthUsd,
		"imbalance":  data.Imbalance,
	}}

	// Ultra-tight spread and deep book required
	if data.SpreadBps > spreadMax {
		sig.Reason = fmt.Sprintf("spread %.2f bps too wide (max %.1f)", data.SpreadBps, spreadMax)
		return sig, nil
	}
	if data.DepthUsd < depthMin {
		sig.Reason = fmt.Sprintf("depth $%.0f insufficient (min $%.0f)", data.DepthUsd, depthMin)
		return sig, nil
	}

	// Micro momentum: percentage move over last N candles
	recent := closes[len(closes)-lookback:]
	momentum := (recent[len(recent)-1] - recent[0]) / recent[0] * 100
	sig.Indicators["momentum_pct"] = momentum

	price := data.Price
	absMom := math.Abs(momentum)
	bullish := momentum > momThresh && data.Imbalance > imbMin
	bearish := momentum < -momThresh && data.Imbalance < -imbMin

	if bullish {
		score := engine.Clamp(55+absMom*200+math.Abs(data.Imbalance)*60, 50, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.99995
		sig.EntryHigh = price * 1.00005
		sig.StopLoss = price * (1 - slPct/100)
		sig.TakeProfit = price * (1 + tpPct/100)
		sig.TakeProfit2 = price * (1 + tpPct*1.5/100)
		sig.Reason = fmt.Sprintf("micro long burst: mom %.3f%%, imb %.2f, spread %.1f bps", momentum, data.Imbalance, data.SpreadBps)
		return sig, nil
	}

	if bearish {
		score := engine.Clamp(55+absMom*200+math.Abs(data.Imbalance)*60, 50, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.99995
		sig.EntryHigh = price * 1.00005
		sig.StopLoss = price * (1 + slPct/100)
		sig.TakeProfit = price * (1 - tpPct/100)
		sig.TakeProfit2 = price * (1 - tpPct*1.5/100)
		sig.Reason = fmt.Sprintf("micro short burst: mom %.3f%%, imb %.2f, spread %.1f bps", momentum, data.Imbalance, data.SpreadBps)
		return sig, nil
	}

	if absMom > momThresh*0.5 {
		sig.Decision = "WATCH"
		sig.Score = 25
		sig.Reason = fmt.Sprintf("micro momentum building (%.3f%%) but imbalance weak (%.2f)", momentum, data.Imbalance)
	} else {
		sig.Reason = "no micro momentum detected"
	}
	return sig, nil
}
