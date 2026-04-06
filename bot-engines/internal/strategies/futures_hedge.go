package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// FuturesHedge trades spreads between exchanges for the same futures contract,
// combining spread edge, funding rate differentials, and basis convergence.
type FuturesHedge struct{}

func init() { engine.Register(&FuturesHedge{}) }

func (s *FuturesHedge) Name() string     { return "Futures Hedge Bot" }
func (s *FuturesHedge) Slug() string     { return "futures-hedge" }
func (s *FuturesHedge) Category() string { return "pro" }
func (s *FuturesHedge) Description() string {
	return "Cross-exchange futures spread trading with funding rate and basis convergence scoring"
}

func (s *FuturesHedge) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"min_spread_pct":     0.15,
			"funding_weight":     0.3,
			"basis_weight":       0.4,
			"exec_weight":        0.3,
			"min_volume_usd":     50000.0,
			"min_depth_usd":      20000.0,
			"sl_pct":             1.0,
			"tp_pct":             0.6,
			"lookback":           20,
			"max_funding_abs":    0.1,
		},
	}
}

func (s *FuturesHedge) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	minSpread := getFloat(p, "min_spread_pct", 0.15)
	fundingW := getFloat(p, "funding_weight", 0.3)
	basisW := getFloat(p, "basis_weight", 0.4)
	execW := getFloat(p, "exec_weight", 0.3)
	minVolume := getFloat(p, "min_volume_usd", 50000)
	minDepth := getFloat(p, "min_depth_usd", 20000)
	slPct := getFloat(p, "sl_pct", 1.0)
	tpPct := getFloat(p, "tp_pct", 0.6)
	lookback := getInt(p, "lookback", 20)
	maxFunding := getFloat(p, "max_funding_abs", 0.1)

	price := data.Price
	composite := data.Composite
	funding := data.FundingRate
	volume := data.Volume24hUsd
	depth := data.DepthUsd
	spread := data.SpreadBps

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"price":        price,
			"composite":    composite,
			"funding_rate": funding,
			"volume_usd":   volume,
			"spread_bps":   spread,
		},
	}

	if volume < minVolume {
		sig.Reason = fmt.Sprintf("volume $%.0f below minimum $%.0f", volume, minVolume)
		return sig, nil
	}
	if depth < minDepth {
		sig.Reason = fmt.Sprintf("depth $%.0f below minimum $%.0f", depth, minDepth)
		return sig, nil
	}

	// Spread edge between local and composite
	spreadPct := 0.0
	if composite > 0 {
		spreadPct = (price - composite) / composite * 100
	}
	absSpread := math.Abs(spreadPct)
	sig.Indicators["spread_pct"] = spreadPct
	sig.Indicators["abs_spread_pct"] = absSpread

	// Funding alignment score (0-1): does funding support our direction?
	fundingScore := 0.0
	absFunding := math.Abs(funding)
	if absFunding > 0 && absFunding < maxFunding {
		// Funding aligns if: positive funding + we'd go short, or negative + we'd go long
		if (spreadPct > 0 && funding > 0) || (spreadPct < 0 && funding < 0) {
			fundingScore = math.Min(absFunding/0.05, 1.0)
		} else {
			fundingScore = -math.Min(absFunding/0.05, 0.5) // penalty for misalignment
		}
	}
	sig.Indicators["funding_score"] = fundingScore

	// Basis convergence score from historical data
	basisScore := 0.0
	candles := data.Candles
	if len(candles) >= lookback && composite > 0 {
		basisHist := make([]float64, lookback)
		for i := 0; i < lookback; i++ {
			idx := len(candles) - lookback + i
			c := candles[idx].Close
			if c > 0 {
				basisHist[i] = (c - composite) / composite * 100
			}
		}
		meanBasis := engine.Mean(basisHist)
		stdBasis := engine.StdDev(basisHist)
		sig.Indicators["basis_mean"] = meanBasis
		sig.Indicators["basis_std"] = stdBasis

		if stdBasis > 0 {
			zScore := (spreadPct - meanBasis) / stdBasis
			sig.Indicators["basis_z"] = zScore
			basisScore = engine.Clamp(math.Abs(zScore)/2, 0, 1)
		}
	}
	sig.Indicators["basis_score"] = basisScore

	// Execution feasibility score
	execScore := 0.0
	if spread < 20 && depth > minDepth*2 {
		execScore = 1.0
	} else if spread < 30 && depth > minDepth {
		execScore = 0.6
	} else {
		execScore = 0.3
	}
	sig.Indicators["exec_score"] = execScore

	// Combined score
	combined := fundingScore*fundingW + basisScore*basisW + execScore*execW
	sig.Indicators["combined_score"] = combined

	if absSpread < minSpread {
		if absSpread > minSpread*0.5 {
			sig.Decision = "WATCH"
			sig.Score = engine.Clamp(combined*40, 0, 45)
			sig.Reason = fmt.Sprintf("spread %.3f%% below threshold %.3f%%, combined %.2f", spreadPct, minSpread, combined)
		} else {
			sig.Reason = fmt.Sprintf("spread %.3f%% too small", spreadPct)
		}
		return sig, nil
	}

	score := engine.Clamp(combined*60+absSpread/minSpread*20+10, 20, 100)

	if spreadPct > 0 {
		// Local price higher — sell here
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price * (1 + slPct/100)
		sig.TakeProfit = price * (1 - tpPct/100)
		sig.TakeProfit2 = price * (1 - tpPct*1.8/100)
		sig.Reason = fmt.Sprintf("futures spread %.3f%% — short local (funding %.4f%%, basis z=%.2f, exec %.0f%%)",
			spreadPct, funding, sig.Indicators["basis_z"], execScore*100)
	} else {
		// Local price lower — buy here
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price * (1 - slPct/100)
		sig.TakeProfit = price * (1 + tpPct/100)
		sig.TakeProfit2 = price * (1 + tpPct*1.8/100)
		sig.Reason = fmt.Sprintf("futures spread %.3f%% — long local (funding %.4f%%, basis z=%.2f, exec %.0f%%)",
			spreadPct, funding, sig.Indicators["basis_z"], execScore*100)
	}

	return sig, nil
}
