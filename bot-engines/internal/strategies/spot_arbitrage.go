package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// SpotArbitrage finds price discrepancies between spot pairs on the same
// exchange (triangular or cross-pair). Scores on spread, volume, and
// execution feasibility for ultra-fast execution.
type SpotArbitrage struct{}

func init() { engine.Register(&SpotArbitrage{}) }

func (s *SpotArbitrage) Name() string     { return "Spot Arbitrage Bot" }
func (s *SpotArbitrage) Slug() string     { return "spot-arbitrage" }
func (s *SpotArbitrage) Category() string { return "pro" }
func (s *SpotArbitrage) Description() string {
	return "Triangular and cross-pair spot arbitrage with execution feasibility scoring"
}

func (s *SpotArbitrage) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"min_spread_bps":    5.0,
			"max_spread_bps":    50.0,
			"min_volume_usd":    30000.0,
			"min_depth_usd":     10000.0,
			"exec_fee_bps":      10.0,
			"imbalance_weight":  0.3,
			"sl_bps":            15.0,
			"tp_bps":            8.0,
			"lookback":          15,
		},
	}
}

func (s *SpotArbitrage) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	minSpread := getFloat(p, "min_spread_bps", 5)
	maxSpread := getFloat(p, "max_spread_bps", 50)
	minVolume := getFloat(p, "min_volume_usd", 30000)
	minDepth := getFloat(p, "min_depth_usd", 10000)
	execFee := getFloat(p, "exec_fee_bps", 10)
	imbWeight := getFloat(p, "imbalance_weight", 0.3)
	slBps := getFloat(p, "sl_bps", 15)
	tpBps := getFloat(p, "tp_bps", 8)
	lookback := getInt(p, "lookback", 15)

	price := data.Price
	spread := data.SpreadBps
	volume := data.Volume24hUsd
	depth := data.DepthUsd
	imbalance := data.Imbalance

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"spread_bps":  spread,
			"volume_usd":  volume,
			"depth_usd":   depth,
			"imbalance":   imbalance,
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
	if spread > maxSpread {
		sig.Reason = fmt.Sprintf("spread %.1f bps too wide (max %.1f)", spread, maxSpread)
		return sig, nil
	}

	// Net spread after execution fees (round-trip)
	netSpread := spread - execFee*2
	sig.Indicators["net_spread_bps"] = netSpread

	// Historical spread for anomaly detection
	candles := data.Candles
	if len(candles) >= lookback {
		spreadHist := make([]float64, lookback)
		for i := 0; i < lookback; i++ {
			idx := len(candles) - lookback + i
			c := candles[idx]
			if c.Close > 0 {
				spreadHist[i] = (c.High - c.Low) / c.Close * 10000
			}
		}
		meanSpr := engine.Mean(spreadHist)
		stdSpr := engine.StdDev(spreadHist)
		sig.Indicators["spread_mean"] = meanSpr
		sig.Indicators["spread_std"] = stdSpr

		if stdSpr > 0 {
			sig.Indicators["spread_z"] = (spread - meanSpr) / stdSpr
		}
	}

	if netSpread < minSpread {
		if netSpread > 0 {
			sig.Decision = "WATCH"
			sig.Score = engine.Clamp(netSpread/minSpread*30, 0, 40)
			sig.Reason = fmt.Sprintf("net spread %.1f bps below threshold %.1f bps", netSpread, minSpread)
		} else {
			sig.Reason = fmt.Sprintf("spread %.1f bps consumed by fees (%.1f bps round-trip)", spread, execFee*2)
		}
		return sig, nil
	}

	// Composite score: spread edge * volume factor * execution feasibility
	spreadScore := engine.Clamp(netSpread/minSpread*30, 0, 40)
	volScore := engine.Clamp(math.Log10(volume/minVolume)*15, 0, 25)
	depthScore := engine.Clamp(math.Log10(depth/minDepth)*15, 0, 25)
	imbScore := math.Abs(imbalance) * imbWeight * 10
	score := engine.Clamp(spreadScore+volScore+depthScore+imbScore, 15, 100)

	slDist := price * slBps / 10000
	tpDist := price * tpBps / 10000

	if imbalance > 0.1 {
		// More bids than asks — price likely to push up
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.9999
		sig.EntryHigh = price * 1.0001
		sig.StopLoss = price - slDist
		sig.TakeProfit = price + tpDist
		sig.TakeProfit2 = price + tpDist*1.5
		sig.Reason = fmt.Sprintf("arb opportunity: net spread %.1f bps, bid imbalance %.2f, depth $%.0f", netSpread, imbalance, depth)
	} else if imbalance < -0.1 {
		// More asks than bids — price likely to push down
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.9999
		sig.EntryHigh = price * 1.0001
		sig.StopLoss = price + slDist
		sig.TakeProfit = price - tpDist
		sig.TakeProfit2 = price - tpDist*1.5
		sig.Reason = fmt.Sprintf("arb opportunity: net spread %.1f bps, ask imbalance %.2f, depth $%.0f", netSpread, imbalance, depth)
	} else {
		// Neutral imbalance — still an opportunity but directionally neutral
		sig.Decision = "TRADE"
		sig.Score = engine.Clamp(score*0.7, 15, 80)
		sig.Bias = "LONG" // default to long for neutral arb
		sig.EntryLow = price * 0.9999
		sig.EntryHigh = price * 1.0001
		sig.StopLoss = price - slDist
		sig.TakeProfit = price + tpDist*0.8
		sig.TakeProfit2 = price + tpDist*1.2
		sig.Reason = fmt.Sprintf("arb opportunity: net spread %.1f bps, neutral imbalance, depth $%.0f", netSpread, depth)
	}

	return sig, nil
}
