package strategies

import (
	"context"
	"fmt"
	"strings"

	"github.com/bitrium/bot-engines/internal/engine"
)

// MultiCondition is a highly configurable strategy that scores based on a
// weighted combination of indicator conditions. Users define which checks
// to enable and their thresholds through config params.
type MultiCondition struct{}

func init() { engine.Register(&MultiCondition{}) }

func (s *MultiCondition) Name() string        { return "Multi-Condition" }
func (s *MultiCondition) Slug() string        { return "multi-condition" }
func (s *MultiCondition) Category() string    { return "composite" }
func (s *MultiCondition) Description() string { return "Configurable multi-indicator scoring engine with weighted conditions" }

func (s *MultiCondition) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			// Condition enables
			"use_rsi":       true,
			"use_macd":      true,
			"use_bb":        true,
			"use_volume":    true,
			"use_trend":     true,
			// Weights (relative)
			"weight_rsi":    2.0,
			"weight_macd":   2.0,
			"weight_bb":     1.5,
			"weight_volume": 1.0,
			"weight_trend":  2.5,
			// Thresholds
			"rsi_oversold":  35.0,
			"rsi_overbought": 65.0,
			"vol_avg_mult":  1.3,
			"ema_fast":      9,
			"ema_slow":      21,
			"bb_period":     20,
			"bb_std":        2.0,
			"min_score":     60.0, // minimum weighted score to trigger TRADE
			"atr_sl_mult":   1.5,
			"atr_tp_mult":   2.5,
		},
	}
}

type condResult struct {
	name    string
	met     bool
	bullish bool
	weight  float64
}

func (s *MultiCondition) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	closes := engine.ClosesFromCandles(data.Candles)
	vols := engine.VolumesFromCandles(data.Candles)

	if len(closes) < 30 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	price := data.Price
	atr := engine.ATR(data.Candles, 14)

	var conditions []condResult

	// --- RSI condition ---
	if getBool(p, "use_rsi", true) {
		rsi := data.Rsi14
		oversold := getFloat(p, "rsi_oversold", 35)
		overbought := getFloat(p, "rsi_overbought", 65)
		w := getFloat(p, "weight_rsi", 2)
		if rsi < oversold {
			conditions = append(conditions, condResult{"rsi_oversold", true, true, w})
		} else if rsi > overbought {
			conditions = append(conditions, condResult{"rsi_overbought", true, false, w})
		} else {
			conditions = append(conditions, condResult{"rsi_neutral", false, true, w})
		}
	}

	// --- MACD condition ---
	if getBool(p, "use_macd", true) {
		macdLine, signalLine, hist := engine.MACD(closes, 12, 26, 9)
		w := getFloat(p, "weight_macd", 2)
		bullish := macdLine > signalLine && hist > 0
		bearish := macdLine < signalLine && hist < 0
		if bullish {
			conditions = append(conditions, condResult{"macd_bull", true, true, w})
		} else if bearish {
			conditions = append(conditions, condResult{"macd_bear", true, false, w})
		} else {
			conditions = append(conditions, condResult{"macd_neutral", false, true, w})
		}
	}

	// --- Bollinger Bands condition ---
	if getBool(p, "use_bb", true) {
		bbPeriod := getInt(p, "bb_period", 20)
		bbStd := getFloat(p, "bb_std", 2.0)
		upper, _, lower := engine.BollingerBands(closes, bbPeriod, bbStd)
		w := getFloat(p, "weight_bb", 1.5)
		if price <= lower {
			conditions = append(conditions, condResult{"bb_lower", true, true, w})
		} else if price >= upper {
			conditions = append(conditions, condResult{"bb_upper", true, false, w})
		} else {
			conditions = append(conditions, condResult{"bb_mid", false, true, w})
		}
	}

	// --- Volume condition ---
	if getBool(p, "use_volume", true) {
		volMult := getFloat(p, "vol_avg_mult", 1.3)
		avgVol := engine.Mean(vols[len(vols)-20:])
		curVol := vols[len(vols)-1]
		w := getFloat(p, "weight_volume", 1)
		met := curVol > avgVol*volMult
		conditions = append(conditions, condResult{"volume_spike", met, true, w})
	}

	// --- Trend condition (EMA cross) ---
	if getBool(p, "use_trend", true) {
		fast := engine.EMA(closes, getInt(p, "ema_fast", 9))
		slow := engine.EMA(closes, getInt(p, "ema_slow", 21))
		w := getFloat(p, "weight_trend", 2.5)
		lf := engine.LastNonZero(fast)
		ls := engine.LastNonZero(slow)
		if lf > ls {
			conditions = append(conditions, condResult{"trend_bull", true, true, w})
		} else {
			conditions = append(conditions, condResult{"trend_bear", true, false, w})
		}
	}

	// Score: weighted ratio of met conditions
	var totalWeight, metWeightBull, metWeightBear float64
	var metNames []string
	for _, c := range conditions {
		totalWeight += c.weight
		if c.met {
			metNames = append(metNames, c.name)
			if c.bullish {
				metWeightBull += c.weight
			} else {
				metWeightBear += c.weight
			}
		}
	}

	bullScore := metWeightBull / totalWeight * 100
	bearScore := metWeightBear / totalWeight * 100
	bestScore := bullScore
	bias := "LONG"
	if bearScore > bullScore {
		bestScore = bearScore
		bias = "SHORT"
	}

	indicators := map[string]float64{"bull_score": bullScore, "bear_score": bearScore, "atr": atr}
	minScore := getFloat(p, "min_score", 60)
	slMult := getFloat(p, "atr_sl_mult", 1.5)
	tpMult := getFloat(p, "atr_tp_mult", 2.5)

	sig := &engine.Signal{Bias: bias, Score: bestScore, Indicators: indicators}

	if bestScore >= minScore {
		sig.Decision = "TRADE"
		if bias == "LONG" {
			sig.EntryLow = price * 0.998
			sig.EntryHigh = price * 1.002
			sig.StopLoss = price - slMult*atr
			sig.TakeProfit = price + tpMult*atr
			sig.TakeProfit2 = price + tpMult*1.5*atr
		} else {
			sig.EntryLow = price * 0.998
			sig.EntryHigh = price * 1.002
			sig.StopLoss = price + slMult*atr
			sig.TakeProfit = price - tpMult*atr
			sig.TakeProfit2 = price - tpMult*1.5*atr
		}
		sig.Reason = fmt.Sprintf("%s signal (score %.0f): %s", bias, bestScore, strings.Join(metNames, ", "))
	} else if bestScore >= minScore*0.7 {
		sig.Decision = "WATCH"
		sig.Reason = fmt.Sprintf("approaching threshold (%.0f/%.0f): %s", bestScore, minScore, strings.Join(metNames, ", "))
	} else {
		sig.Decision = "NO_TRADE"
		sig.Reason = fmt.Sprintf("score too low (%.0f/%.0f)", bestScore, minScore)
	}

	return sig, nil
}
