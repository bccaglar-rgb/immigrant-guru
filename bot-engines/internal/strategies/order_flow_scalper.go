package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// OrderFlowScalper detects cumulative volume delta imbalances — aggressive
// buying or selling pressure — combined with volume spikes for scalp entries.
type OrderFlowScalper struct{}

func init() { engine.Register(&OrderFlowScalper{}) }

func (s *OrderFlowScalper) Name() string     { return "Order Flow Scalper Bot" }
func (s *OrderFlowScalper) Slug() string     { return "order-flow-scalper" }
func (s *OrderFlowScalper) Category() string { return "scalping" }
func (s *OrderFlowScalper) Description() string {
	return "Scalps using cumulative volume delta imbalance and volume spikes"
}

func (s *OrderFlowScalper) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"imbalance_long":  0.3,
			"imbalance_short": -0.3,
			"vol_spike_mult":  1.5,
			"spread_max_bps":  5.0,
			"tp_pct":          0.25,
			"sl_pct":          0.15,
			"cvd_lookback":    10,
		},
	}
}

func (s *OrderFlowScalper) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	imbLong := getFloat(p, "imbalance_long", 0.3)
	imbShort := getFloat(p, "imbalance_short", -0.3)
	volSpikeMult := getFloat(p, "vol_spike_mult", 1.5)
	spreadMax := getFloat(p, "spread_max_bps", 5.0)
	tpPct := getFloat(p, "tp_pct", 0.25)
	slPct := getFloat(p, "sl_pct", 0.15)
	cvdLookback := getInt(p, "cvd_lookback", 10)

	volumes := engine.VolumesFromCandles(data.Candles)
	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) < cvdLookback+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{
		"imbalance":  data.Imbalance,
		"spread_bps": data.SpreadBps,
	}}

	if data.SpreadBps > spreadMax {
		sig.Reason = fmt.Sprintf("spread %.1f bps exceeds max %.1f bps", data.SpreadBps, spreadMax)
		return sig, nil
	}

	// Compute pseudo-CVD from candle close vs open direction * volume
	n := len(closes)
	cvd := 0.0
	for i := n - cvdLookback; i < n; i++ {
		c := data.Candles[i]
		if c.Close >= c.Open {
			cvd += c.Volume
		} else {
			cvd -= c.Volume
		}
	}

	// Volume spike detection
	recentVol := volumes[n-1]
	avgVol := engine.Mean(volumes[n-20:])
	volSpike := avgVol > 0 && recentVol > avgVol*volSpikeMult
	volRatio := 0.0
	if avgVol > 0 {
		volRatio = recentVol / avgVol
	}
	sig.Indicators["vol_ratio"] = volRatio
	sig.Indicators["cvd"] = cvd

	price := data.Price
	imb := data.Imbalance
	strongBuy := imb > imbLong && volSpike
	strongSell := imb < imbShort && volSpike

	if strongBuy {
		score := engine.Clamp(60+math.Abs(imb)*50+volRatio*10, 55, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.9999
		sig.EntryHigh = price * 1.0001
		sig.StopLoss = price * (1 - slPct/100)
		sig.TakeProfit = price * (1 + tpPct/100)
		sig.TakeProfit2 = price * (1 + tpPct*1.6/100)
		sig.Reason = fmt.Sprintf("aggressive buyers: imb %.2f, vol %.1fx, CVD %.0f", imb, volRatio, cvd)
		return sig, nil
	}

	if strongSell {
		score := engine.Clamp(60+math.Abs(imb)*50+volRatio*10, 55, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.9999
		sig.EntryHigh = price * 1.0001
		sig.StopLoss = price * (1 + slPct/100)
		sig.TakeProfit = price * (1 - tpPct/100)
		sig.TakeProfit2 = price * (1 - tpPct*1.6/100)
		sig.Reason = fmt.Sprintf("aggressive sellers: imb %.2f, vol %.1fx, CVD %.0f", imb, volRatio, cvd)
		return sig, nil
	}

	if math.Abs(imb) > math.Abs(imbLong)*0.6 {
		sig.Decision = "WATCH"
		sig.Score = 30
		sig.Bias = map[bool]string{true: "LONG", false: "SHORT"}[imb > 0]
		sig.Reason = fmt.Sprintf("imbalance building (%.2f) but no vol spike (%.1fx)", imb, volRatio)
	} else {
		sig.Reason = "no order flow edge detected"
	}
	return sig, nil
}
