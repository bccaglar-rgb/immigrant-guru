package strategies

import (
	"context"
	"fmt"
	"math"
	"strings"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Builder is a fully configurable multi-condition strategy engine. The config
// contains a list of condition objects, each specifying an indicator, operator,
// threshold, weight, and action. All conditions are evaluated and a weighted
// score determines the final signal.
type Builder struct{}

func init() { engine.Register(&Builder{}) }

func (s *Builder) Name() string     { return "Multi-Condition Builder" }
func (s *Builder) Slug() string     { return "builder" }
func (s *Builder) Category() string { return "create" }
func (s *Builder) Description() string {
	return "Fully configurable multi-condition strategy with weighted scoring and action mapping"
}

func (s *Builder) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"conditions": []interface{}{
				map[string]interface{}{"indicator": "rsi", "op": "<", "value": 30.0, "weight": 1.0, "action": "long"},
				map[string]interface{}{"indicator": "rsi", "op": ">", "value": 70.0, "weight": 1.0, "action": "short"},
				map[string]interface{}{"indicator": "atr_pct", "op": ">", "value": 1.0, "weight": 0.5, "action": "long"},
			},
			"min_score":     30.0,
			"sl_atr_mult":   1.5,
			"tp_atr_mult":   2.5,
			"require_all":   false,
		},
	}
}

// condition represents a single rule in the builder.
type condition struct {
	Indicator string
	Op        string
	Value     float64
	Weight    float64
	Action    string // "long", "short", "neutral"
}

func parseConditions(raw interface{}) []condition {
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	var conds []condition
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		c := condition{
			Indicator: getString(m, "indicator", ""),
			Op:        getString(m, "op", ">"),
			Value:     getFloat(m, "value", 0),
			Weight:    getFloat(m, "weight", 1.0),
			Action:    getString(m, "action", "neutral"),
		}
		if c.Indicator != "" {
			conds = append(conds, c)
		}
	}
	return conds
}

// resolveIndicator maps an indicator name to its current value.
func resolveIndicator(name string, data *engine.MarketData) (float64, bool) {
	switch strings.ToLower(name) {
	case "rsi", "rsi14":
		return data.Rsi14, true
	case "atr_pct", "atr":
		return data.AtrPct, true
	case "price":
		return data.Price, true
	case "change_24h", "change24h", "change":
		return data.Change24hPct, true
	case "volume", "volume_usd":
		return data.Volume24hUsd, true
	case "spread", "spread_bps":
		return data.SpreadBps, true
	case "depth", "depth_usd":
		return data.DepthUsd, true
	case "imbalance":
		return data.Imbalance, true
	case "funding", "funding_rate":
		return data.FundingRate, true
	case "sr_dist", "sr_dist_pct":
		return data.SrDistPct, true
	case "tier1", "tier1_score":
		return data.Tier1Score, true
	case "composite":
		return data.Composite, true
	default:
		return 0, false
	}
}

func evalOp(op string, actual, threshold float64) bool {
	switch op {
	case ">":
		return actual > threshold
	case ">=":
		return actual >= threshold
	case "<":
		return actual < threshold
	case "<=":
		return actual <= threshold
	case "==", "=":
		return math.Abs(actual-threshold) < 1e-9
	case "!=":
		return math.Abs(actual-threshold) >= 1e-9
	default:
		return false
	}
}

func (s *Builder) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	minScore := getFloat(p, "min_score", 30)
	slAtrMult := getFloat(p, "sl_atr_mult", 1.5)
	tpAtrMult := getFloat(p, "tp_atr_mult", 2.5)
	requireAll := getBool(p, "require_all", false)

	conds := parseConditions(p["conditions"])

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Bias:       "NEUTRAL",
		Indicators: map[string]float64{},
	}

	if len(conds) == 0 {
		sig.Reason = "no conditions configured"
		return sig, nil
	}

	price := data.Price
	atrPct := data.AtrPct
	if atrPct == 0 {
		atrPct = 1.0
	}
	atr := atrPct / 100 * price

	// Evaluate each condition
	totalWeight := 0.0
	longWeight := 0.0
	shortWeight := 0.0
	neutralWeight := 0.0
	matchedCount := 0
	var reasons []string

	for i, c := range conds {
		actual, ok := resolveIndicator(c.Indicator, data)
		if !ok {
			sig.Indicators[fmt.Sprintf("cond_%d_unknown", i)] = 1
			continue
		}
		sig.Indicators[c.Indicator] = actual

		matched := evalOp(c.Op, actual, c.Value)
		matchKey := fmt.Sprintf("cond_%d_match", i)
		if matched {
			sig.Indicators[matchKey] = 1
			matchedCount++
			totalWeight += c.Weight
			switch strings.ToLower(c.Action) {
			case "long":
				longWeight += c.Weight
			case "short":
				shortWeight += c.Weight
			default:
				neutralWeight += c.Weight
			}
			reasons = append(reasons, fmt.Sprintf("%s %s %.2f (actual=%.2f, w=%.1f, %s)",
				c.Indicator, c.Op, c.Value, actual, c.Weight, c.Action))
		} else {
			sig.Indicators[matchKey] = 0
		}
	}

	sig.Indicators["matched_count"] = float64(matchedCount)
	sig.Indicators["total_weight"] = totalWeight
	sig.Indicators["long_weight"] = longWeight
	sig.Indicators["short_weight"] = shortWeight

	if requireAll && matchedCount < len(conds) {
		sig.Reason = fmt.Sprintf("require_all: %d/%d conditions matched", matchedCount, len(conds))
		return sig, nil
	}

	if matchedCount == 0 {
		sig.Reason = "no conditions matched"
		return sig, nil
	}

	// Normalize score to 0-100
	maxPossibleWeight := 0.0
	for _, c := range conds {
		maxPossibleWeight += c.Weight
	}
	score := 0.0
	if maxPossibleWeight > 0 {
		score = totalWeight / maxPossibleWeight * 100
	}
	sig.Score = engine.Clamp(score, 0, 100)

	if score < minScore {
		sig.Decision = "WATCH"
		sig.Reason = fmt.Sprintf("score %.1f below minimum %.1f — %s", score, minScore, strings.Join(reasons, "; "))
		return sig, nil
	}

	// Determine bias from action weights
	bias := "NEUTRAL"
	if longWeight > shortWeight && longWeight > neutralWeight {
		bias = "LONG"
	} else if shortWeight > longWeight && shortWeight > neutralWeight {
		bias = "SHORT"
	}

	sig.Decision = "TRADE"
	sig.Bias = bias

	switch bias {
	case "LONG":
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price - atr*slAtrMult
		sig.TakeProfit = price + atr*tpAtrMult
		sig.TakeProfit2 = price + atr*tpAtrMult*1.5
	case "SHORT":
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price + atr*slAtrMult
		sig.TakeProfit = price - atr*tpAtrMult
		sig.TakeProfit2 = price - atr*tpAtrMult*1.5
	default:
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price - atr*slAtrMult
		sig.TakeProfit = price + atr*tpAtrMult
		sig.TakeProfit2 = price + atr*tpAtrMult*1.5
	}

	sig.Reason = fmt.Sprintf("%d/%d conditions matched (score %.1f) — %s", matchedCount, len(conds), score, strings.Join(reasons, "; "))
	return sig, nil
}
