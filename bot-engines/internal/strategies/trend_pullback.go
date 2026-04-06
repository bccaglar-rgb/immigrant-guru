package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// TrendPullback waits for price to pull back to the EMA in an established
// trend, entering when price touches EMA(20) support/resistance with ADX
// confirming trend strength.
type TrendPullback struct{}

func init() { engine.Register(&TrendPullback{}) }

func (s *TrendPullback) Name() string        { return "Trend Pullback" }
func (s *TrendPullback) Slug() string        { return "trend-pullback" }
func (s *TrendPullback) Category() string    { return "trend" }
func (s *TrendPullback) Description() string { return "Enters on EMA pullbacks in confirmed trends using ADX and RSI filters" }

func (s *TrendPullback) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"ema_fast":      20,
			"ema_slow":      50,
			"adx_min":       25.0,
			"rsi_bull_low":  40.0,
			"rsi_bull_high": 50.0,
			"rsi_bear_low":  50.0,
			"rsi_bear_high": 60.0,
			"atr_tp_mult":   2.0,
			"atr_sl_mult":   1.0,
			"touch_pct":     0.3, // how close price must be to EMA to count as touch (%)
		},
	}
}

func (s *TrendPullback) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	emaFast := getInt(p, "ema_fast", 20)
	emaSlow := getInt(p, "ema_slow", 50)
	adxMin := getFloat(p, "adx_min", 25)
	rsiBullLow := getFloat(p, "rsi_bull_low", 40)
	rsiBullHigh := getFloat(p, "rsi_bull_high", 50)
	rsiBearLow := getFloat(p, "rsi_bear_low", 50)
	rsiBearHigh := getFloat(p, "rsi_bear_high", 60)
	atrTPMult := getFloat(p, "atr_tp_mult", 2.0)
	atrSLMult := getFloat(p, "atr_sl_mult", 1.0)
	touchPct := getFloat(p, "touch_pct", 0.3)

	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) < emaSlow+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	fast := engine.EMA(closes, emaFast)
	slow := engine.EMA(closes, emaSlow)
	adxVal := engine.ADX(data.Candles, 14)
	atr := engine.ATR(data.Candles, 14)
	rsi := data.Rsi14
	price := data.Price

	indicators := map[string]float64{
		"ema_fast": engine.LastNonZero(fast),
		"ema_slow": engine.LastNonZero(slow),
		"adx":      adxVal,
		"atr":      atr,
		"rsi":      rsi,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Score:      0,
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	lastFast := engine.LastNonZero(fast)
	lastSlow := engine.LastNonZero(slow)

	// Determine trend direction
	bullTrend := lastFast > lastSlow
	bearTrend := lastFast < lastSlow

	// ADX must confirm trend
	if adxVal < adxMin {
		sig.Reason = fmt.Sprintf("ADX %.1f below threshold %.1f — no trend", adxVal, adxMin)
		return sig, nil
	}

	// Check pullback to EMA via RSI and price proximity
	touchDist := pctDiff(price, lastFast)
	touching := touchDist <= touchPct

	if bullTrend && touching && rsi >= rsiBullLow && rsi <= rsiBullHigh {
		score := engine.Clamp((adxVal-adxMin)*2 + (rsiBullHigh-rsi)*3, 0, 100)
		entryLow := lastFast * 0.998
		entryHigh := lastFast * 1.002
		sl := lastSlow * (1 - atrSLMult*atr/price)
		tp := price + atrTPMult*atr

		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = entryLow
		sig.EntryHigh = entryHigh
		sig.StopLoss = math.Max(sl, lastSlow*0.99)
		sig.TakeProfit = tp
		sig.TakeProfit2 = price + atrTPMult*1.5*atr
		sig.Reason = fmt.Sprintf("bullish pullback to EMA(%d) at %.2f, RSI %.1f, ADX %.1f", emaFast, lastFast, rsi, adxVal)
		return sig, nil
	}

	if bearTrend && touching && rsi >= rsiBearLow && rsi <= rsiBearHigh {
		score := engine.Clamp((adxVal-adxMin)*2 + (rsi-rsiBearLow)*3, 0, 100)
		entryLow := lastFast * 0.998
		entryHigh := lastFast * 1.002
		sl := lastSlow * (1 + atrSLMult*atr/price)
		tp := price - atrTPMult*atr

		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = entryLow
		sig.EntryHigh = entryHigh
		sig.StopLoss = math.Min(sl, lastSlow*1.01)
		sig.TakeProfit = tp
		sig.TakeProfit2 = price - atrTPMult*1.5*atr
		sig.Reason = fmt.Sprintf("bearish pullback to EMA(%d) at %.2f, RSI %.1f, ADX %.1f", emaFast, lastFast, rsi, adxVal)
		return sig, nil
	}

	if bullTrend || bearTrend {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(adxVal-adxMin, 0, 50)
		sig.Bias = map[bool]string{true: "LONG", false: "SHORT"}[bullTrend]
		sig.Reason = fmt.Sprintf("trend active (ADX %.1f) but no pullback yet — EMA dist %.2f%%", adxVal, touchDist)
	} else {
		sig.Reason = "no clear trend"
	}

	return sig, nil
}
