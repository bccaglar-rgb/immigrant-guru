package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// BollingerReversion trades mean reversion when price touches the outer
// Bollinger Bands, entering toward the middle band with RSI confirmation
// and Bollinger squeeze detection.
type BollingerReversion struct{}

func init() { engine.Register(&BollingerReversion{}) }

func (s *BollingerReversion) Name() string     { return "Bollinger Reversion Bot" }
func (s *BollingerReversion) Slug() string     { return "bollinger-reversion" }
func (s *BollingerReversion) Category() string { return "market" }
func (s *BollingerReversion) Description() string {
	return "Trades mean reversion from outer Bollinger Bands toward the middle band"
}

func (s *BollingerReversion) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"bb_period":         20,
			"bb_mult":           2.0,
			"rsi_long_max":      35.0,
			"rsi_short_min":     65.0,
			"squeeze_lookback":  10,
			"squeeze_threshold": 0.7, // current width / avg width ratio to detect squeeze
			"atr_sl_mult":       1.2,
		},
	}
}

func (s *BollingerReversion) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	bbPeriod := getInt(p, "bb_period", 20)
	bbMult := getFloat(p, "bb_mult", 2.0)
	rsiLongMax := getFloat(p, "rsi_long_max", 35)
	rsiShortMin := getFloat(p, "rsi_short_min", 65)
	squeezeLookback := getInt(p, "squeeze_lookback", 10)
	squeezeThreshold := getFloat(p, "squeeze_threshold", 0.7)
	atrSLMult := getFloat(p, "atr_sl_mult", 1.2)

	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) < bbPeriod+squeezeLookback+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	upper, middle, lower := engine.BollingerBands(closes, bbPeriod, bbMult)
	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)
	rsi := data.Rsi14
	price := data.Price

	n := len(closes)
	lastUpper := engine.LastNonZero(upper)
	lastMiddle := engine.LastNonZero(middle)
	lastLower := engine.LastNonZero(lower)

	// Current bandwidth.
	currentWidth := 0.0
	if lastMiddle > 0 {
		currentWidth = (lastUpper - lastLower) / lastMiddle
	}

	// Average bandwidth over lookback period for squeeze detection.
	widths := make([]float64, 0, squeezeLookback)
	for i := n - squeezeLookback - 1; i < n-1; i++ {
		if i >= bbPeriod-1 && middle[i] > 0 {
			widths = append(widths, (upper[i]-lower[i])/middle[i])
		}
	}
	avgWidth := engine.Mean(widths)
	squeezeRatio := 0.0
	if avgWidth > 0 {
		squeezeRatio = currentWidth / avgWidth
	}
	isSqueeze := squeezeRatio < squeezeThreshold && squeezeRatio > 0

	// Position within bands as percentage (-100 to +100 from lower to upper).
	bandPos := 0.0
	if lastUpper > lastLower {
		bandPos = (price-lastLower)/(lastUpper-lastLower)*200 - 100
	}

	indicators := map[string]float64{
		"bb_upper":      lastUpper,
		"bb_mid":        lastMiddle,
		"bb_lower":      lastLower,
		"bb_width":      currentWidth * 100,
		"squeeze_ratio": squeezeRatio,
		"band_pos":      bandPos,
		"rsi":           rsi,
		"atr":           atr,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Score:      0,
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	slBuffer := atr * atrSLMult

	// Price at or below lower band + RSI oversold = LONG reversion.
	if price <= lastLower*1.005 && rsi < rsiLongMax {
		bandScore := engine.Clamp(math.Abs(bandPos)*0.5, 0, 40)
		rsiScore := engine.Clamp((rsiLongMax-rsi)*1.5, 0, 35)
		squeezeScore := 0.0
		if isSqueeze {
			squeezeScore = 25
		}
		totalScore := engine.Clamp(bandScore+rsiScore+squeezeScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "LONG"
		sig.EntryLow = lastLower * 0.998
		sig.EntryHigh = lastLower * 1.005
		sig.StopLoss = lastLower - slBuffer
		sig.TakeProfit = lastMiddle
		sig.TakeProfit2 = lastMiddle + (lastUpper-lastMiddle)*0.3
		sig.Reason = fmt.Sprintf("price at lower BB $%.2f, RSI %.1f, squeeze ratio %.2f, target mid $%.2f",
			lastLower, rsi, squeezeRatio, lastMiddle)
		if totalScore < 35 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	// Price at or above upper band + RSI overbought = SHORT reversion.
	if price >= lastUpper*0.995 && rsi > rsiShortMin {
		bandScore := engine.Clamp(math.Abs(bandPos)*0.5, 0, 40)
		rsiScore := engine.Clamp((rsi-rsiShortMin)*1.5, 0, 35)
		squeezeScore := 0.0
		if isSqueeze {
			squeezeScore = 25
		}
		totalScore := engine.Clamp(bandScore+rsiScore+squeezeScore, 0, 100)

		sig.Decision = "TRADE"
		sig.Score = totalScore
		sig.Bias = "SHORT"
		sig.EntryLow = lastUpper * 0.995
		sig.EntryHigh = lastUpper * 1.002
		sig.StopLoss = lastUpper + slBuffer
		sig.TakeProfit = lastMiddle
		sig.TakeProfit2 = lastMiddle - (lastMiddle-lastLower)*0.3
		sig.Reason = fmt.Sprintf("price at upper BB $%.2f, RSI %.1f, squeeze ratio %.2f, target mid $%.2f",
			lastUpper, rsi, squeezeRatio, lastMiddle)
		if totalScore < 35 {
			sig.Decision = "WATCH"
		}
		return sig, nil
	}

	// Squeeze detected but not yet at boundary.
	if isSqueeze {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(30*(1-squeezeRatio), 0, 30)
		sig.Reason = fmt.Sprintf("BB squeeze detected (ratio %.2f) — awaiting breakout to band edge", squeezeRatio)
		return sig, nil
	}

	sig.Reason = fmt.Sprintf("price within bands (pos %.1f%%), RSI %.1f — no setup", bandPos, rsi)
	return sig, nil
}
