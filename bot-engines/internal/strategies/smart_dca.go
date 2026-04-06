package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// SmartDCA implements an intelligent dollar-cost averaging strategy that
// scales buy amounts based on RSI oversold levels, Bollinger Band position,
// and volume anomalies. It produces stronger buy signals when price is
// deeply oversold with capitulation volume.
type SmartDCA struct{}

func init() { engine.Register(&SmartDCA{}) }

func (s *SmartDCA) Name() string        { return "Smart DCA" }
func (s *SmartDCA) Slug() string        { return "smart-dca" }
func (s *SmartDCA) Category() string    { return "dca" }
func (s *SmartDCA) Description() string { return "RSI-timed dollar-cost averaging with Bollinger Band support and volume spike detection" }

func (s *SmartDCA) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"rsi_heavy":      30.0, // RSI < this = heavy buy
			"rsi_medium":     40.0, // RSI < this = medium buy
			"rsi_light":      50.0, // RSI < this = light buy
			"bb_period":      20,
			"bb_std":         2.0,
			"vol_spike_mult": 1.8,  // volume spike multiplier for capitulation detection
			"vol_avg_period": 20,
			"heavy_score":    90.0,
			"medium_score":   65.0,
			"light_score":    40.0,
			"bb_bonus":       10.0, // extra score for being below BB lower
			"vol_bonus":      10.0, // extra score for volume spike on dip
			"atr_sl_mult":    2.0,  // wider SL for DCA (patient)
		},
	}
}

func (s *SmartDCA) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	rsiHeavy := getFloat(p, "rsi_heavy", 30)
	rsiMedium := getFloat(p, "rsi_medium", 40)
	rsiLight := getFloat(p, "rsi_light", 50)
	bbPeriod := getInt(p, "bb_period", 20)
	bbStd := getFloat(p, "bb_std", 2.0)
	volSpikeMult := getFloat(p, "vol_spike_mult", 1.8)
	volAvgPeriod := getInt(p, "vol_avg_period", 20)
	heavyScore := getFloat(p, "heavy_score", 90)
	mediumScore := getFloat(p, "medium_score", 65)
	lightScore := getFloat(p, "light_score", 40)
	bbBonus := getFloat(p, "bb_bonus", 10)
	volBonus := getFloat(p, "vol_bonus", 10)
	atrSLMult := getFloat(p, "atr_sl_mult", 2.0)

	closes := engine.ClosesFromCandles(data.Candles)
	vols := engine.VolumesFromCandles(data.Candles)

	minBars := bbPeriod + 5
	if len(closes) < minBars {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient data"}, nil
	}

	price := data.Price
	rsi := data.Rsi14
	atr := engine.ATR(data.Candles, 14)

	// Bollinger Bands
	bbUpper, bbMid, bbLower := engine.BollingerBands(closes, bbPeriod, bbStd)
	bbWidth := (bbUpper - bbLower) / math.Max(bbMid, 1) * 100

	// Volume analysis
	volSlice := vols[len(vols)-volAvgPeriod:]
	avgVol := engine.Mean(volSlice)
	curVol := vols[len(vols)-1]
	volRatio := curVol / math.Max(avgVol, 1)

	// Price position within BB (0 = lower, 1 = upper)
	bbPos := 0.5
	if bbUpper > bbLower {
		bbPos = (price - bbLower) / (bbUpper - bbLower)
	}

	indicators := map[string]float64{
		"rsi":      rsi,
		"bb_upper": bbUpper,
		"bb_mid":   bbMid,
		"bb_lower": bbLower,
		"bb_width": bbWidth,
		"bb_pos":   bbPos,
		"vol_ratio": volRatio,
		"atr":      atr,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Bias:       "LONG", // DCA is inherently long-biased
		Indicators: indicators,
	}

	// Determine buy zone
	var baseScore float64
	var zone string

	switch {
	case rsi < rsiHeavy:
		baseScore = heavyScore
		zone = "heavy"
	case rsi < rsiMedium:
		baseScore = mediumScore
		zone = "medium"
	case rsi < rsiLight:
		baseScore = lightScore
		zone = "light"
	default:
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(20+(rsiLight-rsi)*0.5, 0, 30)
		sig.Reason = fmt.Sprintf("RSI %.1f above light-buy threshold (%.0f) — waiting for dip", rsi, rsiLight)
		return sig, nil
	}

	// Bonuses
	score := baseScore
	reasons := []string{fmt.Sprintf("%s buy zone (RSI %.1f)", zone, rsi)}

	if price <= bbLower {
		score += bbBonus
		reasons = append(reasons, fmt.Sprintf("below BB lower (%.2f)", bbLower))
	}

	if volRatio >= volSpikeMult {
		score += volBonus
		reasons = append(reasons, fmt.Sprintf("volume spike %.1fx", volRatio))
	}

	score = engine.Clamp(score, 0, 100)

	// Entry zone: around current price since DCA accumulates
	sig.Decision = "TRADE"
	sig.Score = score
	sig.EntryLow = price * 0.995
	sig.EntryHigh = price * 1.005

	// SL is wider for DCA — it's a patient strategy
	sig.StopLoss = price - atrSLMult*atr

	// TP at BB middle and upper as scale-out targets
	sig.TakeProfit = bbMid
	sig.TakeProfit2 = bbUpper

	reasonStr := reasons[0]
	for _, r := range reasons[1:] {
		reasonStr += "; " + r
	}
	sig.Reason = reasonStr

	return sig, nil
}
