package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// FundingRate collects funding by positioning against the crowd: negative
// funding means go LONG (shorts pay longs), positive funding means go SHORT
// (longs pay shorts). Score considers magnitude and predicted persistence.
type FundingRate struct{}

func init() { engine.Register(&FundingRate{}) }

func (s *FundingRate) Name() string     { return "Funding Rate Bot" }
func (s *FundingRate) Slug() string     { return "funding-rate" }
func (s *FundingRate) Category() string { return "pro" }
func (s *FundingRate) Description() string {
	return "Funding rate arbitrage — positions against the crowd to collect funding payments"
}

func (s *FundingRate) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"min_rate_abs":      0.015,
			"strong_rate_abs":   0.05,
			"risk_cap_pct":     3.0,
			"sl_atr_mult":      1.5,
			"tp_funding_hours":  24.0,
			"persistence_bars":  6,
			"persistence_min":   0.6,
			"max_atr_pct":      5.0,
		},
	}
}

func (s *FundingRate) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	minRate := getFloat(p, "min_rate_abs", 0.015)
	strongRate := getFloat(p, "strong_rate_abs", 0.05)
	riskCap := getFloat(p, "risk_cap_pct", 3.0)
	slAtrMult := getFloat(p, "sl_atr_mult", 1.5)
	tpHours := getFloat(p, "tp_funding_hours", 24.0)
	persistBars := getInt(p, "persistence_bars", 6)
	persistMin := getFloat(p, "persistence_min", 0.6)
	maxATR := getFloat(p, "max_atr_pct", 5.0)

	price := data.Price
	funding := data.FundingRate
	atrPct := data.AtrPct
	absFunding := math.Abs(funding)

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"funding_rate": funding,
			"abs_funding":  absFunding,
			"atr_pct":      atrPct,
		},
	}

	if atrPct > maxATR {
		sig.Reason = fmt.Sprintf("ATR %.2f%% exceeds risk cap %.2f%%", atrPct, maxATR)
		return sig, nil
	}

	if absFunding < minRate {
		sig.Reason = fmt.Sprintf("funding %.4f%% below min %.4f%%", funding, minRate)
		return sig, nil
	}

	// Persistence check: estimate from candle direction alignment
	candles := data.Candles
	persistScore := 1.0
	if len(candles) >= persistBars {
		aligned := 0
		for i := len(candles) - persistBars; i < len(candles); i++ {
			dir := candles[i].Close - candles[i].Open
			// If funding is positive and candles are green, crowd is bullish → funding persists
			if (funding > 0 && dir > 0) || (funding < 0 && dir < 0) {
				aligned++
			}
		}
		persistScore = float64(aligned) / float64(persistBars)
	}
	sig.Indicators["persistence"] = persistScore

	if persistScore < persistMin {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(absFunding/minRate*25, 0, 50)
		sig.Reason = fmt.Sprintf("funding %.4f%% but persistence %.0f%% below %.0f%%", funding, persistScore*100, persistMin*100)
		return sig, nil
	}

	// Score: magnitude + persistence bonus
	magScore := engine.Clamp((absFunding-minRate)/(strongRate-minRate)*60, 0, 60)
	persBonus := persistScore * 30
	score := engine.Clamp(magScore+persBonus+10, 20, 100)

	atr := atrPct / 100 * price
	if atr == 0 {
		atr = price * 0.01
	}
	slDist := math.Min(atr*slAtrMult, price*riskCap/100)
	// Estimated profit from funding over tpHours (8h funding intervals)
	tpDist := absFunding / 100 * price * tpHours / 8

	if funding > 0 {
		// Positive funding: go SHORT to collect
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price + slDist
		sig.TakeProfit = price - tpDist
		sig.TakeProfit2 = price - tpDist*2
		sig.Reason = fmt.Sprintf("positive funding %.4f%% — short to collect, persistence %.0f%%", funding, persistScore*100)
	} else {
		// Negative funding: go LONG to collect
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = math.Max(price-slDist, 0)
		sig.TakeProfit = price + tpDist
		sig.TakeProfit2 = price + tpDist*2
		sig.Reason = fmt.Sprintf("negative funding %.4f%% — long to collect, persistence %.0f%%", funding, persistScore*100)
	}

	return sig, nil
}
