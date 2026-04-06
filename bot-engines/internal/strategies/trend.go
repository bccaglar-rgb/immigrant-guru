package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Trend implements a simple EMA crossover trend-following strategy with
// ADX filtering and volume confirmation.
type Trend struct{}

func init() { engine.Register(&Trend{}) }

func (s *Trend) Name() string        { return "Trend" }
func (s *Trend) Slug() string        { return "trend" }
func (s *Trend) Category() string    { return "trend" }
func (s *Trend) Description() string { return "Simple EMA crossover trend follower with ADX and volume filters" }

func (s *Trend) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"ema_fast":       9,
			"ema_slow":       21,
			"adx_min":        20.0,
			"vol_avg_period": 20,
			"vol_min_mult":   1.0,  // volume must be >= this * average
			"risk_reward":    2.0,
			"swing_lookback": 10,
		},
	}
}

func (s *Trend) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	emaFastN := getInt(p, "ema_fast", 9)
	emaSlowN := getInt(p, "ema_slow", 21)
	adxMin := getFloat(p, "adx_min", 20)
	volAvgPeriod := getInt(p, "vol_avg_period", 20)
	volMinMult := getFloat(p, "vol_min_mult", 1.0)
	riskReward := getFloat(p, "risk_reward", 2.0)
	swingLB := getInt(p, "swing_lookback", 10)

	closes := engine.ClosesFromCandles(data.Candles)
	highs := engine.HighsFromCandles(data.Candles)
	lows := engine.LowsFromCandles(data.Candles)
	vols := engine.VolumesFromCandles(data.Candles)

	minBars := emaSlowN + 5
	if len(closes) < minBars {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient data"}, nil
	}

	fast := engine.EMA(closes, emaFastN)
	slow := engine.EMA(closes, emaSlowN)
	adxVal := engine.ADX(data.Candles, 14)
	avgVol := engine.Mean(vols[len(vols)-volAvgPeriod:])
	curVol := vols[len(vols)-1]
	price := data.Price

	lf := engine.LastNonZero(fast)
	ls := engine.LastNonZero(slow)

	// Previous values for crossover detection
	var prevFast, prevSlow float64
	if len(fast) >= 2 && len(slow) >= 2 {
		prevFast = fast[len(fast)-2]
		prevSlow = slow[len(slow)-2]
	}

	bullCross := prevFast <= prevSlow && lf > ls
	bearCross := prevFast >= prevSlow && lf < ls
	bullTrend := lf > ls
	bearTrend := lf < ls

	indicators := map[string]float64{
		"ema_fast":  lf,
		"ema_slow":  ls,
		"adx":       adxVal,
		"vol_ratio": curVol / math.Max(avgVol, 1),
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	// ADX filter
	if adxVal < adxMin {
		sig.Reason = fmt.Sprintf("ADX %.1f below %.1f — ranging market", adxVal, adxMin)
		return sig, nil
	}

	volOk := curVol >= avgVol*volMinMult

	// Swing high/low for stop placement
	swingHigh := recentHigh(highs[len(highs)-swingLB:])
	swingLow := recentLow(lows[len(lows)-swingLB:])

	if (bullCross || bullTrend) && volOk {
		risk := price - swingLow
		if risk <= 0 {
			risk = price * 0.02
		}
		tp := price + risk*riskReward

		score := engine.Clamp(50+(adxVal-adxMin)*1.5, 30, 100)
		if bullCross {
			score = engine.Clamp(score+15, 0, 100)
		}

		sig.Decision = "TRADE"
		if !bullCross && bullTrend {
			sig.Decision = "WATCH"
			score = engine.Clamp(score-20, 0, 100)
		}
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.998
		sig.EntryHigh = price * 1.002
		sig.StopLoss = swingLow
		sig.TakeProfit = tp
		sig.TakeProfit2 = price + risk*riskReward*1.5
		sig.Reason = fmt.Sprintf("EMA(%d/%d) bullish %s, ADX %.1f, vol %.1fx avg",
			emaFastN, emaSlowN, map[bool]string{true: "crossover", false: "trend"}[bullCross], adxVal, curVol/avgVol)
		return sig, nil
	}

	if (bearCross || bearTrend) && volOk {
		risk := swingHigh - price
		if risk <= 0 {
			risk = price * 0.02
		}
		tp := price - risk*riskReward

		score := engine.Clamp(50+(adxVal-adxMin)*1.5, 30, 100)
		if bearCross {
			score = engine.Clamp(score+15, 0, 100)
		}

		sig.Decision = "TRADE"
		if !bearCross && bearTrend {
			sig.Decision = "WATCH"
			score = engine.Clamp(score-20, 0, 100)
		}
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.998
		sig.EntryHigh = price * 1.002
		sig.StopLoss = swingHigh
		sig.TakeProfit = tp
		sig.TakeProfit2 = price - risk*riskReward*1.5
		sig.Reason = fmt.Sprintf("EMA(%d/%d) bearish %s, ADX %.1f, vol %.1fx avg",
			emaFastN, emaSlowN, map[bool]string{true: "crossover", false: "trend"}[bearCross], adxVal, curVol/avgVol)
		return sig, nil
	}

	sig.Reason = "no crossover or volume confirmation"
	return sig, nil
}
