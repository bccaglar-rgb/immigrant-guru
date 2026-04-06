package strategies

import (
	"context"
	"fmt"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Scalping uses fast EMA crossovers on low timeframes with volume
// confirmation and tight spread requirements for quick entries and exits.
type Scalping struct{}

func init() { engine.Register(&Scalping{}) }

func (s *Scalping) Name() string     { return "Scalping Bot" }
func (s *Scalping) Slug() string     { return "scalping" }
func (s *Scalping) Category() string { return "scalping" }
func (s *Scalping) Description() string {
	return "Fast EMA(5)/EMA(13) cross scalper with volume confirmation and tight spread filter"
}

func (s *Scalping) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"ema_fast":       5,
			"ema_slow":       13,
			"spread_max_bps": 5.0,
			"vol_mult":       1.2,
			"tp_pct":         0.4,
			"sl_pct":         0.2,
			"min_score":      50.0,
		},
	}
}

func (s *Scalping) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	emaFastPeriod := getInt(p, "ema_fast", 5)
	emaSlowPeriod := getInt(p, "ema_slow", 13)
	spreadMax := getFloat(p, "spread_max_bps", 5.0)
	volMult := getFloat(p, "vol_mult", 1.2)
	tpPct := getFloat(p, "tp_pct", 0.4)
	slPct := getFloat(p, "sl_pct", 0.2)

	closes := engine.ClosesFromCandles(data.Candles)
	volumes := engine.VolumesFromCandles(data.Candles)
	if len(closes) < emaSlowPeriod+3 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{}}

	// Spread filter
	if data.SpreadBps > spreadMax {
		sig.Reason = fmt.Sprintf("spread %.1f bps exceeds max %.1f bps", data.SpreadBps, spreadMax)
		return sig, nil
	}

	fast := engine.EMA(closes, emaFastPeriod)
	slow := engine.EMA(closes, emaSlowPeriod)
	n := len(closes)

	curFast, prevFast := fast[n-1], fast[n-2]
	curSlow, prevSlow := slow[n-1], slow[n-2]

	sig.Indicators["ema_fast"] = curFast
	sig.Indicators["ema_slow"] = curSlow
	sig.Indicators["spread_bps"] = data.SpreadBps

	// Volume confirmation
	avgVol := engine.Mean(volumes[n-20:])
	curVol := volumes[n-1]
	volOk := avgVol > 0 && curVol > avgVol*volMult
	sig.Indicators["vol_ratio"] = 0
	if avgVol > 0 {
		sig.Indicators["vol_ratio"] = curVol / avgVol
	}

	bullCross := prevFast <= prevSlow && curFast > curSlow
	bearCross := prevFast >= prevSlow && curFast < curSlow

	price := data.Price
	if bullCross && volOk {
		score := engine.Clamp(60+(curVol/avgVol-1)*40, 50, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.9999
		sig.EntryHigh = price * 1.0001
		sig.StopLoss = price * (1 - slPct/100)
		sig.TakeProfit = price * (1 + tpPct/100)
		sig.TakeProfit2 = price * (1 + tpPct*1.3/100)
		sig.Reason = fmt.Sprintf("bullish EMA(%d)/(%d) cross, vol %.1fx avg, spread %.1f bps", emaFastPeriod, emaSlowPeriod, curVol/avgVol, data.SpreadBps)
		return sig, nil
	}

	if bearCross && volOk {
		score := engine.Clamp(60+(curVol/avgVol-1)*40, 50, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.9999
		sig.EntryHigh = price * 1.0001
		sig.StopLoss = price * (1 + slPct/100)
		sig.TakeProfit = price * (1 - tpPct/100)
		sig.TakeProfit2 = price * (1 - tpPct*1.3/100)
		sig.Reason = fmt.Sprintf("bearish EMA(%d)/(%d) cross, vol %.1fx avg, spread %.1f bps", emaFastPeriod, emaSlowPeriod, curVol/avgVol, data.SpreadBps)
		return sig, nil
	}

	if bullCross || bearCross {
		sig.Decision = "WATCH"
		sig.Score = 30
		sig.Bias = map[bool]string{true: "LONG", false: "SHORT"}[bullCross]
		sig.Reason = "EMA cross detected but volume not confirmed"
	} else {
		sig.Reason = "no EMA cross signal"
	}
	return sig, nil
}
