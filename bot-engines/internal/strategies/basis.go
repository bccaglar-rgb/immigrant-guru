package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Basis trades futures basis (contango/backwardation). Contango (futures > spot)
// triggers sell-futures/buy-spot; backwardation triggers buy-futures/sell-spot.
// Score is based on basis percentage relative to its historical mean.
type Basis struct{}

func init() { engine.Register(&Basis{}) }

func (s *Basis) Name() string     { return "Basis Bot" }
func (s *Basis) Slug() string     { return "basis" }
func (s *Basis) Category() string { return "pro" }
func (s *Basis) Description() string {
	return "Futures basis trading — captures contango/backwardation convergence"
}

func (s *Basis) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"min_basis_pct":    0.2,
			"strong_basis_pct": 1.0,
			"lookback":         30,
			"z_threshold":      1.5,
			"sl_pct":           1.5,
			"tp_pct":           0.8,
			"tp2_pct":          1.5,
		},
	}
}

func (s *Basis) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	minBasis := getFloat(p, "min_basis_pct", 0.2)
	strongBasis := getFloat(p, "strong_basis_pct", 1.0)
	lookback := getInt(p, "lookback", 30)
	zThresh := getFloat(p, "z_threshold", 1.5)
	slPct := getFloat(p, "sl_pct", 1.5)
	tpPct := getFloat(p, "tp_pct", 0.8)
	tp2Pct := getFloat(p, "tp2_pct", 1.5)

	price := data.Price       // spot price
	composite := data.Composite // treat composite as futures proxy
	fundingRate := data.FundingRate

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"price":        price,
			"composite":    composite,
			"funding_rate": fundingRate,
		},
	}

	if composite == 0 || price == 0 {
		sig.Reason = "missing price or composite data for basis calculation"
		return sig, nil
	}

	// Basis = (futures - spot) / spot * 100
	basisPct := (composite - price) / price * 100
	absBasis := math.Abs(basisPct)
	sig.Indicators["basis_pct"] = basisPct
	sig.Indicators["abs_basis"] = absBasis

	// Historical basis from candles
	candles := data.Candles
	if len(candles) >= lookback {
		basisHist := make([]float64, lookback)
		for i := 0; i < lookback; i++ {
			idx := len(candles) - lookback + i
			c := candles[idx].Close
			if c > 0 {
				// Approximate historical basis from price-composite divergence
				basisHist[i] = (composite - c) / c * 100
			}
		}
		meanBasis := engine.Mean(basisHist)
		stdBasis := engine.StdDev(basisHist)
		sig.Indicators["basis_mean"] = meanBasis
		sig.Indicators["basis_std"] = stdBasis

		if stdBasis > 0 {
			zScore := (basisPct - meanBasis) / stdBasis
			sig.Indicators["basis_z"] = zScore

			// Strong z-score gives extra conviction
			if math.Abs(zScore) > zThresh && absBasis >= minBasis {
				score := engine.Clamp(math.Abs(zScore)/zThresh*40+(absBasis-minBasis)/(strongBasis-minBasis)*40, 25, 100)

				if basisPct > 0 {
					// Contango: sell futures, buy spot
					sig.Decision = "TRADE"
					sig.Score = score
					sig.Bias = "SHORT"
					sig.EntryLow = price * 0.999
					sig.EntryHigh = price * 1.001
					sig.StopLoss = price * (1 + slPct/100)
					sig.TakeProfit = price * (1 - tpPct/100)
					sig.TakeProfit2 = price * (1 - tp2Pct/100)
					sig.Reason = fmt.Sprintf("contango basis %.3f%% (z=%.2f) — sell futures, buy spot", basisPct, zScore)
				} else {
					// Backwardation: buy futures, sell spot
					sig.Decision = "TRADE"
					sig.Score = score
					sig.Bias = "LONG"
					sig.EntryLow = price * 0.999
					sig.EntryHigh = price * 1.001
					sig.StopLoss = price * (1 - slPct/100)
					sig.TakeProfit = price * (1 + tpPct/100)
					sig.TakeProfit2 = price * (1 + tp2Pct/100)
					sig.Reason = fmt.Sprintf("backwardation basis %.3f%% (z=%.2f) — buy futures, sell spot", basisPct, zScore)
				}
				return sig, nil
			}
		}
	}

	if absBasis >= minBasis {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(absBasis/strongBasis*50, 10, 50)
		sig.Reason = fmt.Sprintf("basis %.3f%% notable but z-score not extreme enough", basisPct)
	} else {
		sig.Reason = fmt.Sprintf("basis %.3f%% below minimum %.3f%%", basisPct, minBasis)
	}

	return sig, nil
}
