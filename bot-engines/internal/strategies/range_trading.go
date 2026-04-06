package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// RangeTrading buys near support and sells near resistance when the market
// is consolidating inside Bollinger Bands with low ADX.
type RangeTrading struct{}

func init() { engine.Register(&RangeTrading{}) }

func (s *RangeTrading) Name() string     { return "Range Trading Bot" }
func (s *RangeTrading) Slug() string     { return "range-trading" }
func (s *RangeTrading) Category() string { return "market" }
func (s *RangeTrading) Description() string {
	return "Buys at support and sells at resistance in ranging markets using Bollinger Bands"
}

func (s *RangeTrading) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"bb_period":      20,
			"bb_mult":        2.0,
			"adx_max":        25.0,
			"rsi_oversold":   35.0,
			"rsi_overbought": 65.0,
			"bb_width_max":   5.0, // max bandwidth % for range detection
			"atr_sl_mult":    1.5,
		},
	}
}

func (s *RangeTrading) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	bbPeriod := getInt(p, "bb_period", 20)
	bbMult := getFloat(p, "bb_mult", 2.0)
	adxMax := getFloat(p, "adx_max", 25)
	rsiOversold := getFloat(p, "rsi_oversold", 35)
	rsiOverbought := getFloat(p, "rsi_overbought", 65)
	bbWidthMax := getFloat(p, "bb_width_max", 5.0)
	atrSLMult := getFloat(p, "atr_sl_mult", 1.5)

	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) < bbPeriod+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	upper, middle, lower := engine.BollingerBands(closes, bbPeriod, bbMult)
	adxArr := engine.ADX(data.Candles, 14)
	adx := engine.LastNonZero(adxArr)
	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)
	rsi := data.Rsi14
	price := data.Price

	lastUpper := engine.LastNonZero(upper)
	lastMiddle := engine.LastNonZero(middle)
	lastLower := engine.LastNonZero(lower)

	// Bollinger bandwidth as percent of middle band.
	bbWidth := 0.0
	if lastMiddle > 0 {
		bbWidth = (lastUpper - lastLower) / lastMiddle * 100
	}

	indicators := map[string]float64{
		"bb_upper": lastUpper,
		"bb_mid":   lastMiddle,
		"bb_lower": lastLower,
		"bb_width": bbWidth,
		"adx":      adx,
		"rsi":      rsi,
		"atr":      atr,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Score:      0,
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	// Must be a ranging market.
	if adx > adxMax {
		sig.Reason = fmt.Sprintf("ADX %.1f above %.1f — trending, not suitable for range trading", adx, adxMax)
		return sig, nil
	}
	if bbWidth > bbWidthMax {
		sig.Reason = fmt.Sprintf("BB width %.2f%% exceeds max %.2f%% — range too wide", bbWidth, bbWidthMax)
		return sig, nil
	}

	rangePct := 0.0
	if lastUpper > lastLower {
		rangePct = (price - lastLower) / (lastUpper - lastLower) * 100
	}

	slOffset := atr * atrSLMult

	// Near lower band + oversold = LONG opportunity.
	if rangePct < 20 && rsi < rsiOversold {
		rangeScore := engine.Clamp((20-rangePct)*2, 0, 40)
		rsiScore := engine.Clamp((rsiOversold-rsi)*2, 0, 40)
		adxScore := engine.Clamp((adxMax-adx)*1.0, 0, 20)
		totalScore := engine.Clamp(rangeScore+rsiScore+adxScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "LONG"
		sig.EntryLow = lastLower
		sig.EntryHigh = lastLower + (lastMiddle-lastLower)*0.15
		sig.StopLoss = lastLower - slOffset
		sig.TakeProfit = lastMiddle + (lastUpper-lastMiddle)*0.3
		sig.TakeProfit2 = lastUpper * 0.99
		sig.Reason = fmt.Sprintf("price at %.1f%% of range near lower BB $%.2f, RSI %.1f, ADX %.1f",
			rangePct, lastLower, rsi, adx)
		if totalScore < 40 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	// Near upper band + overbought = SHORT opportunity.
	if rangePct > 80 && rsi > rsiOverbought {
		rangeScore := engine.Clamp((rangePct-80)*2, 0, 40)
		rsiScore := engine.Clamp((rsi-rsiOverbought)*2, 0, 40)
		adxScore := engine.Clamp((adxMax-adx)*1.0, 0, 20)
		totalScore := engine.Clamp(rangeScore+rsiScore+adxScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "SHORT"
		sig.EntryLow = lastUpper - (lastUpper-lastMiddle)*0.15
		sig.EntryHigh = lastUpper
		sig.StopLoss = lastUpper + slOffset
		sig.TakeProfit = lastMiddle - (lastMiddle-lastLower)*0.3
		sig.TakeProfit2 = lastLower * 1.01
		sig.Reason = fmt.Sprintf("price at %.1f%% of range near upper BB $%.2f, RSI %.1f, ADX %.1f",
			rangePct, lastUpper, rsi, adx)
		if totalScore < 40 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	// Mid-range: watch for approach to boundaries.
	distToBound := math.Min(rangePct, 100-rangePct)
	sig.Decision = "WATCH"
	sig.Score = engine.Clamp(30-distToBound, 0, 30)
	sig.Reason = fmt.Sprintf("ranging market (ADX %.1f, BB width %.2f%%) but price at %.1f%% of range — awaiting boundary",
		adx, bbWidth, rangePct)

	return sig, nil
}
