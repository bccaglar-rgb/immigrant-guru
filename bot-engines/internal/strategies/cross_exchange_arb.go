package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// CrossExchangeArb captures price discrepancies between exchanges by comparing
// composite pricing data, factoring in transfer fees and execution latency.
type CrossExchangeArb struct{}

func init() { engine.Register(&CrossExchangeArb{}) }

func (s *CrossExchangeArb) Name() string     { return "Cross-Exchange Arbitrage Bot" }
func (s *CrossExchangeArb) Slug() string     { return "cross-exchange-arb" }
func (s *CrossExchangeArb) Category() string { return "pro" }
func (s *CrossExchangeArb) Description() string {
	return "Cross-exchange spread capture with fee-adjusted scoring"
}

func (s *CrossExchangeArb) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"transfer_fee_pct": 0.1,
			"execution_fee_pct": 0.15,
			"min_edge_pct":     0.3,
			"min_volume_usd":   100000.0,
			"sl_pct":           0.5,
			"tp_pct":           0.8,
			"lookback":         20,
		},
	}
}

func (s *CrossExchangeArb) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	transferFee := getFloat(p, "transfer_fee_pct", 0.1)
	execFee := getFloat(p, "execution_fee_pct", 0.15)
	minEdge := getFloat(p, "min_edge_pct", 0.3)
	minVolume := getFloat(p, "min_volume_usd", 100000)
	slPct := getFloat(p, "sl_pct", 0.5)
	tpPct := getFloat(p, "tp_pct", 0.8)
	lookback := getInt(p, "lookback", 20)

	price := data.Price
	composite := data.Composite
	volume := data.Volume24hUsd

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Bias:       "NEUTRAL",
		Indicators: map[string]float64{"price": price, "composite": composite, "volume": volume},
	}

	if volume < minVolume {
		sig.Reason = fmt.Sprintf("volume $%.0f below minimum $%.0f", volume, minVolume)
		return sig, nil
	}
	if composite == 0 {
		sig.Reason = "no composite price available"
		return sig, nil
	}

	// Gross edge between local price and composite
	grossEdgePct := (price - composite) / composite * 100
	totalFees := transferFee + execFee*2 // buy+sell exec fee
	netEdge := math.Abs(grossEdgePct) - totalFees
	sig.Indicators["gross_edge_pct"] = grossEdgePct
	sig.Indicators["net_edge_pct"] = netEdge
	sig.Indicators["total_fees_pct"] = totalFees

	// Historical spread for context
	candles := data.Candles
	if len(candles) >= lookback {
		spreads := make([]float64, lookback)
		for i := 0; i < lookback; i++ {
			idx := len(candles) - lookback + i
			if candles[idx].Close > 0 {
				spreads[i] = (candles[idx].Close - composite) / composite * 100
			}
		}
		sig.Indicators["spread_mean"] = engine.Mean(spreads)
		sig.Indicators["spread_std"] = engine.StdDev(spreads)
	}

	if netEdge < minEdge {
		if netEdge > 0 {
			sig.Decision = "WATCH"
			sig.Score = engine.Clamp(netEdge/minEdge*40, 0, 50)
			sig.Reason = fmt.Sprintf("net edge %.3f%% below threshold %.3f%%", netEdge, minEdge)
		} else {
			sig.Reason = fmt.Sprintf("net edge %.3f%% negative after fees %.3f%%", netEdge, totalFees)
		}
		return sig, nil
	}

	score := engine.Clamp(netEdge/minEdge*50, 20, 100)

	if grossEdgePct > 0 {
		// Local price higher than composite → sell here, buy elsewhere
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price * (1 + slPct/100)
		sig.TakeProfit = price * (1 - tpPct/100)
		sig.TakeProfit2 = price * (1 - tpPct*1.5/100)
		sig.Reason = fmt.Sprintf("local price %.2f above composite %.2f — net edge %.3f%% after fees", price, composite, netEdge)
	} else {
		// Local price lower → buy here, sell elsewhere
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price * (1 - slPct/100)
		sig.TakeProfit = price * (1 + tpPct/100)
		sig.TakeProfit2 = price * (1 + tpPct*1.5/100)
		sig.Reason = fmt.Sprintf("local price %.2f below composite %.2f — net edge %.3f%% after fees", price, composite, netEdge)
	}

	return sig, nil
}
