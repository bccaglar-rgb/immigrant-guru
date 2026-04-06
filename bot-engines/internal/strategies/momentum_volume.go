package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// MomentumVolume combines MACD crossover signals with volume spikes and
// RSI exhaustion filtering for high-probability momentum entries.
type MomentumVolume struct{}

func init() { engine.Register(&MomentumVolume{}) }

func (s *MomentumVolume) Name() string        { return "Momentum + Volume" }
func (s *MomentumVolume) Slug() string        { return "momentum-volume" }
func (s *MomentumVolume) Category() string    { return "momentum" }
func (s *MomentumVolume) Description() string { return "MACD crossover with volume spike confirmation and RSI exhaustion filter" }

func (s *MomentumVolume) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"macd_fast":       12,
			"macd_slow":       26,
			"macd_signal":     9,
			"vol_spike_mult":  2.0,
			"vol_avg_period":  20,
			"rsi_low":         30.0,
			"rsi_high":        70.0,
			"atr_period":      14,
			"atr_sl_mult":     1.5,
			"risk_reward":     2.5,
		},
	}
}

func (s *MomentumVolume) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	macdFast := getInt(p, "macd_fast", 12)
	macdSlow := getInt(p, "macd_slow", 26)
	macdSig := getInt(p, "macd_signal", 9)
	volSpike := getFloat(p, "vol_spike_mult", 2.0)
	volAvgPeriod := getInt(p, "vol_avg_period", 20)
	rsiLow := getFloat(p, "rsi_low", 30)
	rsiHigh := getFloat(p, "rsi_high", 70)
	atrPeriod := getInt(p, "atr_period", 14)
	atrSLMult := getFloat(p, "atr_sl_mult", 1.5)
	riskReward := getFloat(p, "risk_reward", 2.5)

	closes := engine.ClosesFromCandles(data.Candles)
	vols := engine.VolumesFromCandles(data.Candles)

	minBars := macdSlow + macdSig + 5
	if len(closes) < minBars {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient data"}, nil
	}

	price := data.Price
	rsi := data.Rsi14
	atr := engine.ATR(data.Candles, atrPeriod)

	// MACD
	macdLine, signalLine, histogram := engine.MACD(closes, macdFast, macdSlow, macdSig)

	// Volume analysis
	volSlice := vols[len(vols)-volAvgPeriod:]
	avgVol := engine.Mean(volSlice)
	curVol := vols[len(vols)-1]
	volRatio := curVol / math.Max(avgVol, 1)

	// Previous histogram for crossover detection
	var prevHist float64
	if len(closes) >= minBars+1 {
		prevCloses := closes[:len(closes)-1]
		_, _, prevHistSlice := engine.MACD(prevCloses, macdFast, macdSlow, macdSig)
		prevHist = prevHistSlice
	}

	indicators := map[string]float64{
		"macd_line":   macdLine,
		"signal_line": signalLine,
		"histogram":   histogram,
		"vol_ratio":   volRatio,
		"rsi":         rsi,
		"atr":         atr,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	// RSI exhaustion check — avoid entering when momentum is already stretched
	rsiExhausted := rsi < rsiLow || rsi > rsiHigh

	// Bullish MACD crossover
	bullCross := prevHist <= 0 && histogram > 0 && macdLine > signalLine
	bearCross := prevHist >= 0 && histogram < 0 && macdLine < signalLine

	hasVolSpike := volRatio >= volSpike

	if bullCross && !rsiExhausted {
		slDist := atrSLMult * atr
		tpDist := slDist * riskReward

		score := engine.Clamp(50+histogram*500, 30, 85)
		if hasVolSpike {
			score = engine.Clamp(score+15, 0, 100)
		}

		decision := "WATCH"
		if hasVolSpike {
			decision = "TRADE"
		}

		sig.Decision = decision
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.998
		sig.EntryHigh = price * 1.003
		sig.StopLoss = price - slDist
		sig.TakeProfit = price + tpDist
		sig.TakeProfit2 = price + tpDist*1.4
		sig.Reason = fmt.Sprintf("MACD bull cross (hist %.4f), vol %.1fx avg, RSI %.1f", histogram, volRatio, rsi)
		return sig, nil
	}

	if bearCross && !rsiExhausted {
		slDist := atrSLMult * atr
		tpDist := slDist * riskReward

		score := engine.Clamp(50+math.Abs(histogram)*500, 30, 85)
		if hasVolSpike {
			score = engine.Clamp(score+15, 0, 100)
		}

		decision := "WATCH"
		if hasVolSpike {
			decision = "TRADE"
		}

		sig.Decision = decision
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.997
		sig.EntryHigh = price * 1.002
		sig.StopLoss = price + slDist
		sig.TakeProfit = price - tpDist
		sig.TakeProfit2 = price - tpDist*1.4
		sig.Reason = fmt.Sprintf("MACD bear cross (hist %.4f), vol %.1fx avg, RSI %.1f", histogram, volRatio, rsi)
		return sig, nil
	}

	if rsiExhausted {
		sig.Reason = fmt.Sprintf("RSI exhausted at %.1f — avoiding entry", rsi)
	} else {
		sig.Reason = "no MACD crossover"
	}

	return sig, nil
}
