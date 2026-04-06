package strategies

import (
	"context"
	"fmt"
	"math"
	"sort"

	"github.com/bitrium/bot-engines/internal/engine"
)

// SupportResistance identifies key price levels from recent pivots and
// trades bounces or breakouts at those levels with volume confirmation.
type SupportResistance struct{}

func init() { engine.Register(&SupportResistance{}) }

func (s *SupportResistance) Name() string     { return "Support Resistance Bot" }
func (s *SupportResistance) Slug() string     { return "support-resistance" }
func (s *SupportResistance) Category() string { return "advanced" }
func (s *SupportResistance) Description() string {
	return "Trades bounces and breakouts at key support/resistance levels from price pivots"
}

func (s *SupportResistance) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"pivot_lookback":  3,
			"proximity_pct":   0.5,
			"vol_confirm":     1.3,
			"atr_sl_mult":     1.0,
			"atr_tp_mult":     2.0,
			"mode":            "bounce", // "bounce" or "break"
			"cluster_pct":     0.3,
		},
	}
}

func (s *SupportResistance) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	pivotLB := getInt(p, "pivot_lookback", 3)
	proxPct := getFloat(p, "proximity_pct", 0.5)
	volConfirm := getFloat(p, "vol_confirm", 1.3)
	atrSL := getFloat(p, "atr_sl_mult", 1.0)
	atrTP := getFloat(p, "atr_tp_mult", 2.0)
	mode := getString(p, "mode", "bounce")

	highs := engine.HighsFromCandles(data.Candles)
	lows := engine.LowsFromCandles(data.Candles)
	volumes := engine.VolumesFromCandles(data.Candles)
	n := len(highs)
	if n < pivotLB*2+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	// Gather pivot highs and lows as S/R candidates
	var levels []float64
	for i := pivotLB; i < n-pivotLB; i++ {
		isHigh, isLow := true, true
		for j := i - pivotLB; j <= i+pivotLB; j++ {
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
			levels = append(levels, highs[i])
		}
		if isLow {
			levels = append(levels, lows[i])
		}
	}

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{
		"sr_dist_pct": data.SrDistPct,
		"levels":      float64(len(levels)),
	}}

	if len(levels) < 2 {
		sig.Reason = "not enough S/R levels detected"
		return sig, nil
	}

	sort.Float64s(levels)
	price := data.Price

	// Find nearest support (below) and resistance (above)
	var support, resistance float64
	for i := len(levels) - 1; i >= 0; i-- {
		if levels[i] < price {
			support = levels[i]
			break
		}
	}
	for _, lv := range levels {
		if lv > price {
			resistance = lv
			break
		}
	}

	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)
	sig.Indicators["atr"] = atr
	sig.Indicators["support"] = support
	sig.Indicators["resistance"] = resistance

	avgVol := engine.Mean(volumes[n-20:])
	curVol := volumes[n-1]
	volOk := avgVol > 0 && curVol > avgVol*volConfirm

	distToSupport := pctDiff(price, support)
	distToResist := pctDiff(price, resistance)

	if mode == "bounce" {
		// Long bounce off support
		if support > 0 && distToSupport < proxPct && data.Candles[n-1].Close > data.Candles[n-1].Open {
			score := engine.Clamp(55+(proxPct-distToSupport)*80, 50, 95)
			if volOk {
				score = math.Min(score+10, 100)
			}
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = support * 0.999
			sig.EntryHigh = price
			sig.StopLoss = support - atr*atrSL
			sig.TakeProfit = price + atr*atrTP
			if resistance > 0 {
				sig.TakeProfit2 = resistance
			}
			sig.Reason = fmt.Sprintf("bounce off support %.2f (dist %.2f%%), vol ok: %v", support, distToSupport, volOk)
			return sig, nil
		}
		// Short bounce off resistance
		if resistance > 0 && distToResist < proxPct && data.Candles[n-1].Close < data.Candles[n-1].Open {
			score := engine.Clamp(55+(proxPct-distToResist)*80, 50, 95)
			if volOk {
				score = math.Min(score+10, 100)
			}
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = price
			sig.EntryHigh = resistance * 1.001
			sig.StopLoss = resistance + atr*atrSL
			sig.TakeProfit = price - atr*atrTP
			if support > 0 {
				sig.TakeProfit2 = support
			}
			sig.Reason = fmt.Sprintf("rejection at resistance %.2f (dist %.2f%%), vol ok: %v", resistance, distToResist, volOk)
			return sig, nil
		}
	} else {
		// Break mode: clean break above resistance with volume
		if resistance > 0 && price > resistance && volOk {
			score := engine.Clamp(60+pctDiff(price, resistance)*30, 55, 95)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = resistance
			sig.EntryHigh = price * 1.001
			sig.StopLoss = resistance - atr*atrSL
			sig.TakeProfit = price + atr*atrTP
			sig.TakeProfit2 = price + atr*atrTP*1.5
			sig.Reason = fmt.Sprintf("break above resistance %.2f with volume %.1fx", resistance, curVol/avgVol)
			return sig, nil
		}
		// Break below support with volume
		if support > 0 && price < support && volOk {
			score := engine.Clamp(60+pctDiff(price, support)*30, 55, 95)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = price * 0.999
			sig.EntryHigh = support
			sig.StopLoss = support + atr*atrSL
			sig.TakeProfit = price - atr*atrTP
			sig.TakeProfit2 = price - atr*atrTP*1.5
			sig.Reason = fmt.Sprintf("break below support %.2f with volume %.1fx", support, curVol/avgVol)
			return sig, nil
		}
	}

	if distToSupport < proxPct*2 || distToResist < proxPct*2 {
		sig.Decision = "WATCH"
		sig.Score = 30
		sig.Reason = fmt.Sprintf("near S/R levels (support %.2f dist %.2f%%, resist %.2f dist %.2f%%)", support, distToSupport, resistance, distToResist)
	} else {
		sig.Reason = "price not near key S/R levels"
	}
	return sig, nil
}
