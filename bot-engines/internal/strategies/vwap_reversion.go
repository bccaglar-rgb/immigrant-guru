package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// VWAPReversion trades deviations from the volume-weighted average price
// back toward the mean, using imbalance and volume profile for confirmation.
type VWAPReversion struct{}

func init() { engine.Register(&VWAPReversion{}) }

func (s *VWAPReversion) Name() string     { return "VWAP Reversion Bot" }
func (s *VWAPReversion) Slug() string     { return "vwap-reversion" }
func (s *VWAPReversion) Category() string { return "market" }
func (s *VWAPReversion) Description() string {
	return "Trades price deviations from VWAP back to the mean with volume and imbalance confirmation"
}

func (s *VWAPReversion) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"dev_threshold":    2.0, // min % deviation from VWAP to trigger
			"imbalance_min":    0.1, // minimum order book imbalance (absolute)
			"vol_confirm_mult": 1.2, // latest vol vs average to confirm
			"vol_lookback":     20,
			"atr_sl_mult":      1.5,
			"atr_tp_mult":      0.5, // TP near VWAP, so smaller mult for remainder
		},
	}
}

func (s *VWAPReversion) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	devThreshold := getFloat(p, "dev_threshold", 2.0)
	imbalanceMin := getFloat(p, "imbalance_min", 0.1)
	volConfirmMult := getFloat(p, "vol_confirm_mult", 1.2)
	volLookback := getInt(p, "vol_lookback", 20)
	atrSLMult := getFloat(p, "atr_sl_mult", 1.5)
	atrTPMult := getFloat(p, "atr_tp_mult", 0.5)

	if len(data.Candles) < volLookback+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	price := data.Price
	vwapArr := engine.VWAP(data.Candles)
	vwap := engine.LastNonZero(vwapArr)
	if vwap <= 0 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "VWAP not available"}, nil
	}

	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)

	// Deviation from VWAP in percent (positive = above, negative = below).
	devPct := (price - vwap) / vwap * 100

	// Volume confirmation.
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
	hasVolConfirm := volRatio >= volConfirmMult

	// Order book imbalance (positive = more bids, negative = more asks).
	imbalance := data.Imbalance
	absImbalance := math.Abs(imbalance)

	indicators := map[string]float64{
		"vwap":       vwap,
		"dev_pct":    devPct,
		"vol_ratio":  volRatio,
		"imbalance":  imbalance,
		"atr":        atr,
		"spread_bps": data.SpreadBps,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Score:      0,
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	absDev := math.Abs(devPct)
	if absDev < devThreshold {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(absDev/devThreshold*25, 0, 25)
		sig.Reason = fmt.Sprintf("VWAP dev %.2f%% below threshold %.2f%% — awaiting larger deviation",
			devPct, devThreshold)
		return sig, nil
	}

	// Price above VWAP = SHORT reversion toward VWAP.
	if devPct >= devThreshold {
		devScore := engine.Clamp((absDev-devThreshold)*15, 0, 40)
		volScore := 0.0
		if hasVolConfirm {
			volScore = engine.Clamp(volRatio*10, 0, 25)
		}
		imbScore := 0.0
		// For short reversion, negative imbalance (more asks) confirms.
		if imbalance < -imbalanceMin {
			imbScore = engine.Clamp(absImbalance*50, 0, 20)
		}
		spreadScore := engine.Clamp(15-data.SpreadBps*0.5, 0, 15)
		totalScore := engine.Clamp(devScore+volScore+imbScore+spreadScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.998
		sig.EntryHigh = price * 1.002
		sig.StopLoss = price + atr*atrSLMult
		sig.TakeProfit = vwap + atr*atrTPMult
		sig.TakeProfit2 = vwap
		sig.Reason = fmt.Sprintf("price %.2f%% above VWAP $%.2f, vol ratio %.2fx, imbalance %.3f",
			devPct, vwap, volRatio, imbalance)
		if totalScore < 35 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	// Price below VWAP = LONG reversion toward VWAP.
	if devPct <= -devThreshold {
		devScore := engine.Clamp((absDev-devThreshold)*15, 0, 40)
		volScore := 0.0
		if hasVolConfirm {
			volScore = engine.Clamp(volRatio*10, 0, 25)
		}
		imbScore := 0.0
		// For long reversion, positive imbalance (more bids) confirms.
		if imbalance > imbalanceMin {
			imbScore = engine.Clamp(absImbalance*50, 0, 20)
		}
		spreadScore := engine.Clamp(15-data.SpreadBps*0.5, 0, 15)
		totalScore := engine.Clamp(devScore+volScore+imbScore+spreadScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.998
		sig.EntryHigh = price * 1.002
		sig.StopLoss = price - atr*atrSLMult
		sig.TakeProfit = vwap - atr*atrTPMult
		sig.TakeProfit2 = vwap
		sig.Reason = fmt.Sprintf("price %.2f%% below VWAP $%.2f, vol ratio %.2fx, imbalance %.3f",
			devPct, vwap, volRatio, imbalance)
		if totalScore < 35 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	return sig, nil
}
