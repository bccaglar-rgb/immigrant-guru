package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// DeltaNeutral maintains delta-neutral positions (long spot + short futures)
// to profit from funding rate collection without directional exposure.
type DeltaNeutral struct{}

func init() { engine.Register(&DeltaNeutral{}) }

func (s *DeltaNeutral) Name() string     { return "Delta Neutral Bot" }
func (s *DeltaNeutral) Slug() string     { return "delta-neutral" }
func (s *DeltaNeutral) Category() string { return "pro" }
func (s *DeltaNeutral) Description() string {
	return "Funding rate harvesting via delta-neutral spot/futures positions"
}

func (s *DeltaNeutral) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"min_funding_rate":   0.01,
			"exit_funding_rate":  0.005,
			"stability_lookback": 8,
			"stability_min_pct":  60.0,
			"max_atr_pct":       4.0,
			"sl_pct":            2.0,
			"tp_funding_mult":   3.0,
		},
	}
}

func (s *DeltaNeutral) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	minFunding := getFloat(p, "min_funding_rate", 0.01)
	exitFunding := getFloat(p, "exit_funding_rate", 0.005)
	stabilityLookback := getInt(p, "stability_lookback", 8)
	stabilityMinPct := getFloat(p, "stability_min_pct", 60)
	maxATR := getFloat(p, "max_atr_pct", 4.0)
	slPct := getFloat(p, "sl_pct", 2.0)
	tpFundMult := getFloat(p, "tp_funding_mult", 3.0)

	price := data.Price
	funding := data.FundingRate
	atrPct := data.AtrPct

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"funding_rate": funding,
			"atr_pct":      atrPct,
		},
	}

	absFunding := math.Abs(funding)
	sig.Indicators["abs_funding"] = absFunding

	// Reject high-volatility environments — delta-neutral still has basis risk
	if atrPct > maxATR {
		sig.Reason = fmt.Sprintf("ATR %.2f%% too high for delta-neutral (max %.2f%%)", atrPct, maxATR)
		return sig, nil
	}

	if absFunding < exitFunding {
		sig.Reason = fmt.Sprintf("funding rate %.4f%% negligible", funding)
		return sig, nil
	}

	// Estimate funding persistence from candle-based proxy
	candles := data.Candles
	stableCount := 0
	if len(candles) >= stabilityLookback {
		for i := len(candles) - stabilityLookback; i < len(candles); i++ {
			// If price keeps moving in same direction as funding bias, rate is persistent
			if (funding > 0 && candles[i].Close > candles[i].Open) ||
				(funding < 0 && candles[i].Close < candles[i].Open) {
				stableCount++
			}
		}
	}
	stabilityPct := float64(stableCount) / float64(stabilityLookback) * 100
	sig.Indicators["stability_pct"] = stabilityPct

	if absFunding < minFunding {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(absFunding/minFunding*40, 0, 50)
		sig.Reason = fmt.Sprintf("funding %.4f%% below entry threshold %.4f%%", funding, minFunding)
		return sig, nil
	}

	if stabilityPct < stabilityMinPct {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(absFunding/minFunding*30, 0, 50)
		sig.Reason = fmt.Sprintf("funding %.4f%% but stability %.0f%% below %.0f%%", funding, stabilityPct, stabilityMinPct)
		return sig, nil
	}

	// Score: funding magnitude * stability
	score := engine.Clamp(absFunding/minFunding*40+stabilityPct/100*30, 20, 100)
	tpDist := absFunding * tpFundMult / 100 * price

	if funding > 0 {
		// Positive funding: longs pay shorts → go SHORT futures, LONG spot
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price * (1 + slPct/100)
		sig.TakeProfit = price - tpDist
		sig.TakeProfit2 = price - tpDist*1.5
		sig.Reason = fmt.Sprintf("positive funding %.4f%% (stability %.0f%%) — short futures, long spot", funding, stabilityPct)
	} else {
		// Negative funding: shorts pay longs → go LONG futures, SHORT spot
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price * (1 - slPct/100)
		sig.TakeProfit = price + tpDist
		sig.TakeProfit2 = price + tpDist*1.5
		sig.Reason = fmt.Sprintf("negative funding %.4f%% (stability %.0f%%) — long futures, short spot", funding, stabilityPct)
	}

	return sig, nil
}
