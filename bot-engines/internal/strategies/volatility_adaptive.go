package strategies

import (
	"context"
	"fmt"

	"github.com/bitrium/bot-engines/internal/engine"
)

// VolatilityAdaptive switches strategy modes based on the current volatility
// regime: mean reversion in low vol, trend following in medium vol, and
// breakout/momentum in high vol. Position size scales inversely to volatility.
type VolatilityAdaptive struct{}

func init() { engine.Register(&VolatilityAdaptive{}) }

func (s *VolatilityAdaptive) Name() string     { return "Volatility Adaptive Bot" }
func (s *VolatilityAdaptive) Slug() string     { return "volatility-adaptive" }
func (s *VolatilityAdaptive) Category() string { return "pro" }
func (s *VolatilityAdaptive) Description() string {
	return "Adapts between mean reversion, trend following, and momentum based on volatility regime"
}

func (s *VolatilityAdaptive) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"low_vol_max":    1.5,
			"med_vol_max":    3.0,
			"bb_period":      20,
			"bb_mult":        2.0,
			"ema_fast":       9,
			"ema_slow":       21,
			"breakout_bars":  10,
			"sl_atr_mult":    1.5,
			"tp_atr_mult":    2.5,
		},
	}
}

func (s *VolatilityAdaptive) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	lowVolMax := getFloat(p, "low_vol_max", 1.5)
	medVolMax := getFloat(p, "med_vol_max", 3.0)
	bbPeriod := getInt(p, "bb_period", 20)
	bbMult := getFloat(p, "bb_mult", 2.0)
	emaFast := getInt(p, "ema_fast", 9)
	emaSlow := getInt(p, "ema_slow", 21)
	breakoutBars := getInt(p, "breakout_bars", 10)
	slAtrMult := getFloat(p, "sl_atr_mult", 1.5)
	tpAtrMult := getFloat(p, "tp_atr_mult", 2.5)

	price := data.Price
	atrPct := data.AtrPct
	candles := data.Candles

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"atr_pct": atrPct,
		},
	}

	closes := engine.ClosesFromCandles(candles)
	if len(closes) < emaSlow+5 {
		sig.Reason = "insufficient candle data"
		return sig, nil
	}

	atrSlice := engine.ATR(candles, 14)
	if atrSlice == nil {
		sig.Reason = "ATR calculation failed"
		return sig, nil
	}
	currentATR := engine.LastNonZero(atrSlice)
	slDist := currentATR * slAtrMult
	tpDist := currentATR * tpAtrMult

	var regime string
	if atrPct < lowVolMax {
		regime = "low"
	} else if atrPct < medVolMax {
		regime = "medium"
	} else {
		regime = "high"
	}
	sig.Indicators["regime"] = map[string]float64{"low": 1, "medium": 2, "high": 3}[regime]

	switch regime {
	case "low":
		// Mean reversion mode — Bollinger Bands
		upper, middle, lower := engine.BollingerBands(closes, bbPeriod, bbMult)
		if upper == nil {
			sig.Reason = "BB calculation failed in low-vol mode"
			return sig, nil
		}
		lastUpper := engine.LastNonZero(upper)
		lastLower := engine.LastNonZero(lower)
		lastMiddle := engine.LastNonZero(middle)
		sig.Indicators["bb_upper"] = lastUpper
		sig.Indicators["bb_lower"] = lastLower
		sig.Indicators["bb_middle"] = lastMiddle

		if price <= lastLower {
			score := engine.Clamp((lastLower-price)/currentATR*40+30, 20, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = price * 0.999
			sig.EntryHigh = lastLower
			sig.StopLoss = price - slDist
			sig.TakeProfit = lastMiddle
			sig.TakeProfit2 = lastUpper
			sig.Reason = fmt.Sprintf("[low-vol] price at lower BB — mean reversion long, ATR %.2f%%", atrPct)
			return sig, nil
		}
		if price >= lastUpper {
			score := engine.Clamp((price-lastUpper)/currentATR*40+30, 20, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = lastUpper
			sig.EntryHigh = price * 1.001
			sig.StopLoss = price + slDist
			sig.TakeProfit = lastMiddle
			sig.TakeProfit2 = lastLower
			sig.Reason = fmt.Sprintf("[low-vol] price at upper BB — mean reversion short, ATR %.2f%%", atrPct)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 20
		sig.Reason = fmt.Sprintf("[low-vol] price between BB bands — no mean reversion signal yet")

	case "medium":
		// Trend following — EMA crossover
		fast := engine.EMA(closes, emaFast)
		slow := engine.EMA(closes, emaSlow)
		if fast == nil || slow == nil {
			sig.Reason = "EMA calculation failed in medium-vol mode"
			return sig, nil
		}
		lastFast := engine.LastNonZero(fast)
		lastSlow := engine.LastNonZero(slow)
		sig.Indicators["ema_fast"] = lastFast
		sig.Indicators["ema_slow"] = lastSlow

		// Check for recent crossover (within last 3 bars)
		crossUp, crossDown := false, false
		n := len(fast)
		for i := n - 3; i < n && i > 0; i++ {
			if fast[i] > slow[i] && fast[i-1] <= slow[i-1] {
				crossUp = true
			}
			if fast[i] < slow[i] && fast[i-1] >= slow[i-1] {
				crossDown = true
			}
		}

		if crossUp {
			score := engine.Clamp((lastFast-lastSlow)/currentATR*50+40, 30, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = price * 0.999
			sig.EntryHigh = price * 1.002
			sig.StopLoss = price - slDist
			sig.TakeProfit = price + tpDist
			sig.TakeProfit2 = price + tpDist*1.5
			sig.Reason = fmt.Sprintf("[med-vol] EMA(%d) crossed above EMA(%d) — trend long", emaFast, emaSlow)
			return sig, nil
		}
		if crossDown {
			score := engine.Clamp((lastSlow-lastFast)/currentATR*50+40, 30, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = price * 0.998
			sig.EntryHigh = price * 1.001
			sig.StopLoss = price + slDist
			sig.TakeProfit = price - tpDist
			sig.TakeProfit2 = price - tpDist*1.5
			sig.Reason = fmt.Sprintf("[med-vol] EMA(%d) crossed below EMA(%d) — trend short", emaFast, emaSlow)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 25
		sig.Reason = fmt.Sprintf("[med-vol] no EMA crossover — fast %.2f, slow %.2f", lastFast, lastSlow)

	case "high":
		// Momentum/breakout mode
		if len(candles) < breakoutBars+1 {
			sig.Reason = "insufficient data for breakout check"
			return sig, nil
		}
		highs := engine.HighsFromCandles(candles)
		lows := engine.LowsFromCandles(candles)
		recentHighs := highs[len(highs)-breakoutBars-1 : len(highs)-1]
		recentLows := lows[len(lows)-breakoutBars-1 : len(lows)-1]
		rangeHigh := recentHigh(recentHighs)
		rangeLow := recentLow(recentLows)
		sig.Indicators["range_high"] = rangeHigh
		sig.Indicators["range_low"] = rangeLow

		if price > rangeHigh {
			score := engine.Clamp((price-rangeHigh)/currentATR*50+35, 25, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = rangeHigh
			sig.EntryHigh = price * 1.002
			sig.StopLoss = rangeLow
			sig.TakeProfit = price + tpDist*1.5
			sig.TakeProfit2 = price + tpDist*2.5
			sig.Reason = fmt.Sprintf("[high-vol] breakout above %.2f — momentum long, ATR %.2f%%", rangeHigh, atrPct)
			return sig, nil
		}
		if price < rangeLow {
			score := engine.Clamp((rangeLow-price)/currentATR*50+35, 25, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = price * 0.998
			sig.EntryHigh = rangeLow
			sig.StopLoss = rangeHigh
			sig.TakeProfit = price - tpDist*1.5
			sig.TakeProfit2 = price - tpDist*2.5
			sig.Reason = fmt.Sprintf("[high-vol] breakdown below %.2f — momentum short, ATR %.2f%%", rangeLow, atrPct)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 30
		sig.Reason = fmt.Sprintf("[high-vol] price within range %.2f-%.2f — awaiting breakout", rangeLow, rangeHigh)
	}

	return sig, nil
}
