package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// OrderBlock implements ICT-style order block and fair value gap (FVG)
// detection. An order block is the last opposing candle before an impulse
// move; an FVG is a gap between non-adjacent candle wicks.
type OrderBlock struct{}

func init() { engine.Register(&OrderBlock{}) }

func (s *OrderBlock) Name() string     { return "Order Block Bot" }
func (s *OrderBlock) Slug() string     { return "order-block" }
func (s *OrderBlock) Category() string { return "advanced" }
func (s *OrderBlock) Description() string {
	return "ICT-style order block and fair value gap trading with return-to-zone entries"
}

func (s *OrderBlock) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"impulse_mult":    2.0,
			"ob_zone_pct":     0.3,
			"fvg_min_pct":     0.1,
			"atr_sl_mult":     1.0,
			"atr_tp_mult":     2.5,
			"lookback":        20,
		},
	}
}

func (s *OrderBlock) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	impulseMult := getFloat(p, "impulse_mult", 2.0)
	obZonePct := getFloat(p, "ob_zone_pct", 0.3)
	fvgMinPct := getFloat(p, "fvg_min_pct", 0.1)
	atrSL := getFloat(p, "atr_sl_mult", 1.0)
	atrTP := getFloat(p, "atr_tp_mult", 2.5)
	lookback := getInt(p, "lookback", 20)

	n := len(data.Candles)
	if n < lookback+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{
		"atr": atr,
	}}

	// Scan for order blocks: last bearish candle before bullish impulse (demand OB)
	// or last bullish candle before bearish impulse (supply OB)
	type ob struct {
		high, low float64
		isBull    bool
		idx       int
	}
	var demandOBs, supplyOBs []ob

	start := n - lookback
	if start < 1 {
		start = 1
	}
	for i := start; i < n-2; i++ {
		c := data.Candles[i]
		next := data.Candles[i+1]
		bodyC := math.Abs(c.Close - c.Open)
		bodyNext := math.Abs(next.Close - next.Open)

		bearishC := c.Close < c.Open
		bullishNext := next.Close > next.Open && bodyNext > bodyC*impulseMult

		bullishC := c.Close > c.Open
		bearishNext := next.Close < next.Open && bodyNext > bodyC*impulseMult

		if bearishC && bullishNext {
			demandOBs = append(demandOBs, ob{high: c.High, low: c.Low, isBull: true, idx: i})
		}
		if bullishC && bearishNext {
			supplyOBs = append(supplyOBs, ob{high: c.High, low: c.Low, isBull: false, idx: i})
		}
	}

	// Detect FVGs: gap between candle[i-1].low and candle[i+1].high (bullish FVG)
	// or candle[i-1].high and candle[i+1].low (bearish FVG)
	var bullFVG, bearFVG bool
	for i := start + 1; i < n-1; i++ {
		if data.Candles[i-1].High < data.Candles[i+1].Low {
			gapPct := (data.Candles[i+1].Low - data.Candles[i-1].High) / data.Price * 100
			if gapPct > fvgMinPct {
				bullFVG = true
			}
		}
		if data.Candles[i-1].Low > data.Candles[i+1].High {
			gapPct := (data.Candles[i-1].Low - data.Candles[i+1].High) / data.Price * 100
			if gapPct > fvgMinPct {
				bearFVG = true
			}
		}
	}

	sig.Indicators["demand_obs"] = float64(len(demandOBs))
	sig.Indicators["supply_obs"] = float64(len(supplyOBs))
	sig.Indicators["bull_fvg"] = map[bool]float64{true: 1, false: 0}[bullFVG]
	sig.Indicators["bear_fvg"] = map[bool]float64{true: 1, false: 0}[bearFVG]

	price := data.Price

	// Check if price has returned to a demand OB zone (long)
	for i := len(demandOBs) - 1; i >= 0; i-- {
		d := demandOBs[i]
		dist := pctDiff(price, (d.high+d.low)/2)
		if price >= d.low && price <= d.high*(1+obZonePct/100) {
			score := engine.Clamp(60+(obZonePct-dist)*20, 55, 95)
			if bullFVG {
				score = math.Min(score+10, 100)
			}
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = d.low
			sig.EntryHigh = d.high
			sig.StopLoss = d.low - atr*atrSL
			sig.TakeProfit = price + atr*atrTP
			sig.TakeProfit2 = price + atr*atrTP*1.5
			sig.Reason = fmt.Sprintf("price in demand OB zone [%.2f-%.2f], FVG: %v", d.low, d.high, bullFVG)
			return sig, nil
		}
	}

	// Check if price has returned to a supply OB zone (short)
	for i := len(supplyOBs) - 1; i >= 0; i-- {
		s := supplyOBs[i]
		dist := pctDiff(price, (s.high+s.low)/2)
		if price <= s.high && price >= s.low*(1-obZonePct/100) {
			score := engine.Clamp(60+(obZonePct-dist)*20, 55, 95)
			if bearFVG {
				score = math.Min(score+10, 100)
			}
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = s.low
			sig.EntryHigh = s.high
			sig.StopLoss = s.high + atr*atrSL
			sig.TakeProfit = price - atr*atrTP
			sig.TakeProfit2 = price - atr*atrTP*1.5
			sig.Reason = fmt.Sprintf("price in supply OB zone [%.2f-%.2f], FVG: %v", s.low, s.high, bearFVG)
			return sig, nil
		}
	}

	if len(demandOBs) > 0 || len(supplyOBs) > 0 {
		sig.Decision = "WATCH"
		sig.Score = 25
		sig.Reason = fmt.Sprintf("OBs found (demand: %d, supply: %d) but price not in zone", len(demandOBs), len(supplyOBs))
	} else {
		sig.Reason = "no order blocks detected"
	}
	return sig, nil
}
