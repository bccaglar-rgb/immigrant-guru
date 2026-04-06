package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Arbitrage detects same-exchange price inefficiencies between similar pairs
// by analysing bid/ask spread anomalies and scoring on spread deviation from
// the rolling mean.
type Arbitrage struct{}

func init() { engine.Register(&Arbitrage{}) }

func (s *Arbitrage) Name() string     { return "Arbitrage Bot" }
func (s *Arbitrage) Slug() string     { return "arbitrage" }
func (s *Arbitrage) Category() string { return "pro" }
func (s *Arbitrage) Description() string {
	return "Same-exchange price inefficiency detection between similar pairs with tight execution"
}

func (s *Arbitrage) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"spread_mean_period": 20,
			"spread_dev_thresh":  2.0,
			"min_volume_usd":    50000.0,
			"max_spread_bps":    30.0,
			"sl_mult":           0.5,
			"tp_mult":           1.0,
		},
	}
}

func (s *Arbitrage) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	spreadMeanPeriod := getInt(p, "spread_mean_period", 20)
	spreadDevThresh := getFloat(p, "spread_dev_thresh", 2.0)
	minVolume := getFloat(p, "min_volume_usd", 50000)
	maxSpreadBps := getFloat(p, "max_spread_bps", 30)
	slMult := getFloat(p, "sl_mult", 0.5)
	tpMult := getFloat(p, "tp_mult", 1.0)

	price := data.Price
	spread := data.SpreadBps
	volume := data.Volume24hUsd

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Bias:       "NEUTRAL",
		Indicators: map[string]float64{"spread_bps": spread, "volume_usd": volume},
	}

	if volume < minVolume {
		sig.Reason = fmt.Sprintf("volume $%.0f below minimum $%.0f", volume, minVolume)
		return sig, nil
	}
	if spread > maxSpreadBps {
		sig.Reason = fmt.Sprintf("spread %.1f bps too wide (max %.1f)", spread, maxSpreadBps)
		return sig, nil
	}

	// Build spread history from candle-based proxy (high-low range in bps)
	candles := data.Candles
	if len(candles) < spreadMeanPeriod+1 {
		sig.Reason = "insufficient candle data for spread mean"
		return sig, nil
	}

	spreadHistory := make([]float64, len(candles))
	for i, c := range candles {
		if c.Close > 0 {
			spreadHistory[i] = (c.High - c.Low) / c.Close * 10000
		}
	}

	tail := spreadHistory[len(spreadHistory)-spreadMeanPeriod:]
	meanSpread := engine.Mean(tail)
	stdSpread := engine.StdDev(tail)
	sig.Indicators["spread_mean"] = meanSpread
	sig.Indicators["spread_std"] = stdSpread

	if stdSpread == 0 {
		sig.Reason = "zero spread deviation — no anomaly"
		return sig, nil
	}

	deviation := (spread - meanSpread) / stdSpread
	sig.Indicators["spread_z"] = deviation

	// Spread significantly compressed → potential arb opportunity
	if deviation < -spreadDevThresh {
		score := engine.Clamp(math.Abs(deviation)*25, 10, 100)
		atrPct := data.AtrPct
		if atrPct == 0 {
			atrPct = 0.5
		}
		sl := price * (1 - slMult*atrPct/100)
		tp := price * (1 + tpMult*atrPct/100)

		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = sl
		sig.TakeProfit = tp
		sig.TakeProfit2 = price * (1 + tpMult*1.5*atrPct/100)
		sig.Reason = fmt.Sprintf("spread compressed z=%.2f (mean %.1f bps, current %.1f bps) — arb opportunity", deviation, meanSpread, spread)
		return sig, nil
	}

	// Spread significantly expanded → fade the expansion
	if deviation > spreadDevThresh {
		score := engine.Clamp(deviation*20, 10, 100)
		atrPct := data.AtrPct
		if atrPct == 0 {
			atrPct = 0.5
		}
		sl := price * (1 + slMult*atrPct/100)
		tp := price * (1 - tpMult*atrPct/100)

		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = sl
		sig.TakeProfit = tp
		sig.TakeProfit2 = price * (1 - tpMult*1.5*atrPct/100)
		sig.Reason = fmt.Sprintf("spread expanded z=%.2f (mean %.1f bps, current %.1f bps) — fade spread", deviation, meanSpread, spread)
		return sig, nil
	}

	sig.Decision = "WATCH"
	sig.Score = engine.Clamp(math.Abs(deviation)*15, 0, 50)
	sig.Reason = fmt.Sprintf("spread z=%.2f within normal range", deviation)
	return sig, nil
}
