package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// CustomRule is a JSON-configurable rule engine that evaluates weighted
// indicator conditions. Users define rules as an array of {indicator, op,
// value, weight} objects in the config params.
type CustomRule struct{}

func init() { engine.Register(&CustomRule{}) }

func (s *CustomRule) Name() string     { return "Custom Rule Bot" }
func (s *CustomRule) Slug() string     { return "custom-rule" }
func (s *CustomRule) Category() string { return "advanced" }
func (s *CustomRule) Description() string {
	return "JSON-configurable rule engine with weighted indicator conditions"
}

func (s *CustomRule) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"rules": []interface{}{
				map[string]interface{}{"indicator": "rsi", "op": "<", "value": 30.0, "weight": 1.0},
				map[string]interface{}{"indicator": "volume_ratio", "op": ">", "value": 1.5, "weight": 0.8},
			},
			"score_threshold": 0.6,
			"bias":            "LONG",
			"atr_sl_mult":     1.5,
			"atr_tp_mult":     2.5,
		},
	}
}

// indicatorValue resolves a named indicator to its current value.
func indicatorValue(name string, data *engine.MarketData, extras map[string]float64) float64 {
	switch name {
	case "rsi":
		return data.Rsi14
	case "price":
		return data.Price
	case "change_pct":
		return data.Change24hPct
	case "spread_bps":
		return data.SpreadBps
	case "depth_usd":
		return data.DepthUsd
	case "imbalance":
		return data.Imbalance
	case "funding_rate":
		return data.FundingRate
	case "atr_pct":
		return data.AtrPct
	case "sr_dist_pct":
		return data.SrDistPct
	case "tier1_score":
		return data.Tier1Score
	case "composite":
		return data.Composite
	case "volume_24h":
		return data.Volume24hUsd
	default:
		if v, ok := extras[name]; ok {
			return v
		}
		return 0
	}
}

// evalOp evaluates a comparison operator.
func evalOp(actual float64, op string, target float64) bool {
	switch op {
	case "<":
		return actual < target
	case "<=":
		return actual <= target
	case ">":
		return actual > target
	case ">=":
		return actual >= target
	case "==":
		return actual == target
	case "!=":
		return actual != target
	default:
		return false
	}
}

func (s *CustomRule) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	scoreThresh := getFloat(p, "score_threshold", 0.6)
	bias := getString(p, "bias", "LONG")
	atrSL := getFloat(p, "atr_sl_mult", 1.5)
	atrTP := getFloat(p, "atr_tp_mult", 2.5)

	// Parse rules
	rulesRaw, ok := p["rules"]
	if !ok {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "no rules configured"}, nil
	}
	ruleSlice, ok := rulesRaw.([]interface{})
	if !ok || len(ruleSlice) == 0 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "rules must be a non-empty array"}, nil
	}

	// Precompute extras
	volumes := engine.VolumesFromCandles(data.Candles)
	extras := map[string]float64{}
	if len(volumes) >= 20 {
		avg := engine.Mean(volumes[len(volumes)-20:])
		if avg > 0 {
			extras["volume_ratio"] = volumes[len(volumes)-1] / avg
		}
	}
	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) >= 26 {
		fast := engine.EMA(closes, 12)
		slow := engine.EMA(closes, 26)
		extras["ema_fast"] = engine.LastNonZero(fast)
		extras["ema_slow"] = engine.LastNonZero(slow)
	}

	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{"atr": atr}}

	totalWeight := 0.0
	hitWeight := 0.0
	var matched, missed []string

	for _, raw := range ruleSlice {
		rm, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		ind := getString(rm, "indicator", "")
		op := getString(rm, "op", ">")
		val := getFloat(rm, "value", 0)
		weight := getFloat(rm, "weight", 1.0)
		if ind == "" {
			continue
		}

		actual := indicatorValue(ind, data, extras)
		totalWeight += math.Abs(weight)
		sig.Indicators[ind] = actual

		if evalOp(actual, op, val) {
			hitWeight += math.Abs(weight)
			matched = append(matched, fmt.Sprintf("%s(%.2f)%s%.2f", ind, actual, op, val))
		} else {
			missed = append(missed, fmt.Sprintf("%s(%.2f)!%s%.2f", ind, actual, op, val))
		}
	}

	if totalWeight == 0 {
		sig.Reason = "all rules have zero weight"
		return sig, nil
	}

	ratio := hitWeight / totalWeight
	sig.Indicators["rule_ratio"] = ratio

	price := data.Price

	if ratio >= scoreThresh {
		score := engine.Clamp(ratio*100, 50, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = bias
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		if bias == "LONG" {
			sig.StopLoss = price - atr*atrSL
			sig.TakeProfit = price + atr*atrTP
			sig.TakeProfit2 = price + atr*atrTP*1.5
		} else {
			sig.StopLoss = price + atr*atrSL
			sig.TakeProfit = price - atr*atrTP
			sig.TakeProfit2 = price - atr*atrTP*1.5
		}
		sig.Reason = fmt.Sprintf("rules hit %.0f%% (%d/%d): %v", ratio*100, len(matched), len(matched)+len(missed), matched)
		return sig, nil
	}

	if ratio >= scoreThresh*0.5 {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(ratio*60, 10, 45)
		sig.Bias = bias
		sig.Reason = fmt.Sprintf("partial rules %.0f%% — matched: %v, missed: %v", ratio*100, matched, missed)
	} else {
		sig.Reason = fmt.Sprintf("rules score %.0f%% below threshold — missed: %v", ratio*100, missed)
	}
	return sig, nil
}
