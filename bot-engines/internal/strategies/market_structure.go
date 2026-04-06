package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// MarketStructure detects higher-highs/higher-lows (uptrend) or
// lower-highs/lower-lows (downtrend) and enters on break-of-structure
// events followed by pullbacks.
type MarketStructure struct{}

func init() { engine.Register(&MarketStructure{}) }

func (s *MarketStructure) Name() string     { return "Market Structure Bot" }
func (s *MarketStructure) Slug() string     { return "market-structure" }
func (s *MarketStructure) Category() string { return "advanced" }
func (s *MarketStructure) Description() string {
	return "Detects break-of-structure (BOS) via swing highs/lows and enters on pullback"
}

func (s *MarketStructure) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"swing_lookback": 5,
			"pullback_pct":   0.3,
			"atr_sl_mult":    1.2,
			"atr_tp_mult":    2.5,
			"min_swings":     4,
		},
	}
}

func (s *MarketStructure) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	swingLB := getInt(p, "swing_lookback", 5)
	pullbackPct := getFloat(p, "pullback_pct", 0.3)
	atrSL := getFloat(p, "atr_sl_mult", 1.2)
	atrTP := getFloat(p, "atr_tp_mult", 2.5)
	minSwings := getInt(p, "min_swings", 4)

	highs := engine.HighsFromCandles(data.Candles)
	lows := engine.LowsFromCandles(data.Candles)
	if len(highs) < swingLB*2+minSwings {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	// Find swing highs and swing lows
	var swingHighs, swingLows []float64
	n := len(highs)
	for i := swingLB; i < n-swingLB; i++ {
		isHigh, isLow := true, true
		for j := i - swingLB; j <= i+swingLB; j++ {
			if j == i {
				continue
			}
			if highs[j] >= highs[i] {
				isHigh = false
			}
			if lows[j] <= lows[i] {
				isLow = false
			}
		}
		if isHigh {
			swingHighs = append(swingHighs, highs[i])
		}
		if isLow {
			swingLows = append(swingLows, lows[i])
		}
	}

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{
		"swing_highs_count": float64(len(swingHighs)),
		"swing_lows_count":  float64(len(swingLows)),
	}}

	if len(swingHighs) < 2 || len(swingLows) < 2 {
		sig.Reason = "not enough swing points detected"
		return sig, nil
	}

	sh := swingHighs[len(swingHighs)-2:]
	sl := swingLows[len(swingLows)-2:]
	hh := sh[1] > sh[0] // higher high
	hl := sl[1] > sl[0] // higher low
	lh := sh[1] < sh[0] // lower high
	ll := sl[1] < sl[0] // lower low

	price := data.Price
	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)
	sig.Indicators["atr"] = atr

	// Bullish BOS: HH + HL, price pulled back toward last swing low
	lastSL := sl[1]
	lastSH := sh[1]
	pullbackFromHigh := 0.0
	if lastSH > lastSL {
		pullbackFromHigh = (lastSH - price) / (lastSH - lastSL) * 100
	}
	sig.Indicators["pullback_depth"] = pullbackFromHigh

	if hh && hl && pullbackFromHigh > pullbackPct*100*0.3 && pullbackFromHigh < pullbackPct*100*3 {
		score := engine.Clamp(60+pullbackFromHigh*0.5, 50, 95)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = math.Max(lastSL-atr*atrSL, lastSL*0.99)
		sig.TakeProfit = price + atr*atrTP
		sig.TakeProfit2 = price + atr*atrTP*1.5
		sig.Reason = fmt.Sprintf("bullish BOS: HH %.2f > %.2f, HL %.2f > %.2f, pullback %.1f%%", sh[1], sh[0], sl[1], sl[0], pullbackFromHigh)
		return sig, nil
	}

	// Bearish BOS: LH + LL, price pulled back toward last swing high
	pullbackFromLow := 0.0
	if lastSH > lastSL {
		pullbackFromLow = (price - lastSL) / (lastSH - lastSL) * 100
	}

	if lh && ll && pullbackFromLow > pullbackPct*100*0.3 && pullbackFromLow < pullbackPct*100*3 {
		score := engine.Clamp(60+pullbackFromLow*0.5, 50, 95)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = math.Min(lastSH+atr*atrSL, lastSH*1.01)
		sig.TakeProfit = price - atr*atrTP
		sig.TakeProfit2 = price - atr*atrTP*1.5
		sig.Reason = fmt.Sprintf("bearish BOS: LH %.2f < %.2f, LL %.2f < %.2f, pullback %.1f%%", sh[1], sh[0], sl[1], sl[0], pullbackFromLow)
		return sig, nil
	}

	if (hh && hl) || (lh && ll) {
		sig.Decision = "WATCH"
		sig.Score = 35
		sig.Bias = map[bool]string{true: "LONG", false: "SHORT"}[hh && hl]
		sig.Reason = "structure confirmed but waiting for pullback entry"
	} else {
		sig.Reason = "no clear market structure trend"
	}
	return sig, nil
}
