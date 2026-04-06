package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// LiquiditySweep detects stop hunts and liquidity grabs where price sweeps
// below support or above resistance then rapidly reverses, trapping late
// breakout traders.
type LiquiditySweep struct{}

func init() { engine.Register(&LiquiditySweep{}) }

func (s *LiquiditySweep) Name() string     { return "Liquidity Sweep Bot" }
func (s *LiquiditySweep) Slug() string     { return "liquidity-sweep" }
func (s *LiquiditySweep) Category() string { return "advanced" }
func (s *LiquiditySweep) Description() string {
	return "Detects stop hunts and liquidity grabs with rapid reversal entries"
}

func (s *LiquiditySweep) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"swing_lookback":   5,
			"sweep_tolerance":  0.15, // how far past level counts as sweep (%)
			"reversal_candles": 2,
			"vol_spike_mult":   1.5,
			"atr_sl_mult":      1.0,
			"atr_tp_mult":      2.0,
		},
	}
}

func (s *LiquiditySweep) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	swingLB := getInt(p, "swing_lookback", 5)
	sweepTol := getFloat(p, "sweep_tolerance", 0.15)
	revCandles := getInt(p, "reversal_candles", 2)
	volSpike := getFloat(p, "vol_spike_mult", 1.5)
	atrSL := getFloat(p, "atr_sl_mult", 1.0)
	atrTP := getFloat(p, "atr_tp_mult", 2.0)

	n := len(data.Candles)
	if n < swingLB*2+revCandles+5 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	highs := engine.HighsFromCandles(data.Candles)
	lows := engine.LowsFromCandles(data.Candles)
	volumes := engine.VolumesFromCandles(data.Candles)

	// Find recent swing low (support) and swing high (resistance)
	searchEnd := n - revCandles - 1
	var swLow, swHigh float64
	swLow = math.MaxFloat64
	for i := swingLB; i < searchEnd-swingLB; i++ {
		isLow := true
		for j := i - swingLB; j <= i+swingLB; j++ {
			if j != i && lows[j] <= lows[i] {
				isLow = false
				break
			}
		}
		if isLow && lows[i] < swLow {
			swLow = lows[i]
		}

		isHigh := true
		for j := i - swingLB; j <= i+swingLB; j++ {
			if j != i && highs[j] >= highs[i] {
				isHigh = false
				break
			}
		}
		if isHigh && highs[i] > swHigh {
			swHigh = highs[i]
		}
	}

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{
		"swing_low":  swLow,
		"swing_high": swHigh,
	}}

	if swLow == math.MaxFloat64 || swHigh == 0 {
		sig.Reason = "insufficient swing points for sweep detection"
		return sig, nil
	}

	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)
	sig.Indicators["atr"] = atr

	price := data.Price
	avgVol := engine.Mean(volumes[n-20:])
	recentVol := volumes[n-1]
	volOk := avgVol > 0 && recentVol > avgVol*volSpike

	// Check for sweep below support + reversal (bullish)
	recentLow := lows[n-revCandles-1]
	sweepBelow := recentLow < swLow*(1-sweepTol/100)
	reversedUp := price > swLow // price recovered back above
	lastBullish := data.Candles[n-1].Close > data.Candles[n-1].Open

	if sweepBelow && reversedUp && lastBullish && volOk {
		sweepDepth := pctDiff(recentLow, swLow)
		score := engine.Clamp(65+sweepDepth*20+(recentVol/avgVol-1)*15, 55, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = swLow * 0.999
		sig.EntryHigh = price
		sig.StopLoss = recentLow - atr*atrSL
		midRange := (swHigh + swLow) / 2
		sig.TakeProfit = midRange
		sig.TakeProfit2 = swHigh
		sig.Reason = fmt.Sprintf("liquidity sweep below %.2f (low %.2f, depth %.2f%%), reversal confirmed", swLow, recentLow, sweepDepth)
		return sig, nil
	}

	// Check for sweep above resistance + reversal (bearish)
	recentHi := highs[n-revCandles-1]
	sweepAbove := recentHi > swHigh*(1+sweepTol/100)
	reversedDown := price < swHigh
	lastBearish := data.Candles[n-1].Close < data.Candles[n-1].Open

	if sweepAbove && reversedDown && lastBearish && volOk {
		sweepDepth := pctDiff(recentHi, swHigh)
		score := engine.Clamp(65+sweepDepth*20+(recentVol/avgVol-1)*15, 55, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price
		sig.EntryHigh = swHigh * 1.001
		sig.StopLoss = recentHi + atr*atrSL
		midRange := (swHigh + swLow) / 2
		sig.TakeProfit = midRange
		sig.TakeProfit2 = swLow
		sig.Reason = fmt.Sprintf("liquidity sweep above %.2f (high %.2f, depth %.2f%%), reversal confirmed", swHigh, recentHi, sweepDepth)
		return sig, nil
	}

	if sweepBelow || sweepAbove {
		sig.Decision = "WATCH"
		sig.Score = 35
		sig.Bias = map[bool]string{true: "LONG", false: "SHORT"}[sweepBelow]
		sig.Reason = "sweep detected but reversal/volume not confirmed"
	} else {
		sig.Reason = "no liquidity sweep detected"
	}
	return sig, nil
}
