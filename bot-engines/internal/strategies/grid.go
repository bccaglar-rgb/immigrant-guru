package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Grid places buy and sell limit orders at fixed price intervals around the
// current price, profiting from oscillations in ranging markets.
type Grid struct{}

func init() { engine.Register(&Grid{}) }

func (s *Grid) Name() string     { return "Grid Bot" }
func (s *Grid) Slug() string     { return "grid" }
func (s *Grid) Category() string { return "market" }
func (s *Grid) Description() string {
	return "Places buy/sell orders at fixed price intervals in ranging markets"
}

func (s *Grid) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"grid_levels":  10,
			"grid_spacing": 1.0,  // percent between grid lines
			"upper_price":  0.0,  // 0 = auto from price + levels*spacing
			"lower_price":  0.0,  // 0 = auto from price - levels*spacing
			"adx_max":      25.0, // above this = trending, avoid grid
			"min_volume":   50000.0,
			"max_spread":   20.0, // bps
		},
	}
}

func (s *Grid) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	levels := getInt(p, "grid_levels", 10)
	spacing := getFloat(p, "grid_spacing", 1.0) / 100.0
	upperPrice := getFloat(p, "upper_price", 0)
	lowerPrice := getFloat(p, "lower_price", 0)
	adxMax := getFloat(p, "adx_max", 25)
	minVolume := getFloat(p, "min_volume", 50000)
	maxSpread := getFloat(p, "max_spread", 20)

	price := data.Price
	if price <= 0 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "invalid price"}, nil
	}

	// Auto-calculate boundaries if not set.
	if upperPrice <= 0 {
		upperPrice = price * (1 + float64(levels/2)*spacing)
	}
	if lowerPrice <= 0 {
		lowerPrice = price * (1 - float64(levels/2)*spacing)
	}

	// Compute ADX to check for trending market.
	adxArr := engine.ADX(data.Candles, 14)
	adx := engine.LastNonZero(adxArr)

	// ATR for volatility assessment.
	atrArr := engine.ATR(data.Candles, 14)
	atr := engine.LastNonZero(atrArr)
	atrPct := 0.0
	if price > 0 {
		atrPct = atr / price * 100
	}

	indicators := map[string]float64{
		"adx":         adx,
		"atr_pct":     atrPct,
		"upper_price": upperPrice,
		"lower_price": lowerPrice,
		"grid_levels": float64(levels),
		"spread_bps":  data.SpreadBps,
	}

	sig := &engine.Signal{
		Decision:   "NO_TRADE",
		Score:      0,
		Bias:       "NEUTRAL",
		Indicators: indicators,
	}

	// Reject if market is trending.
	if adx > adxMax {
		sig.Reason = fmt.Sprintf("ADX %.1f exceeds max %.1f — market trending, grid unsuitable", adx, adxMax)
		return sig, nil
	}

	// Reject if volume too low or spread too wide.
	if data.Volume24hUsd < minVolume {
		sig.Reason = fmt.Sprintf("volume $%.0f below minimum $%.0f", data.Volume24hUsd, minVolume)
		return sig, nil
	}
	if data.SpreadBps > maxSpread {
		sig.Reason = fmt.Sprintf("spread %.1f bps too wide (max %.1f)", data.SpreadBps, maxSpread)
		return sig, nil
	}

	// Determine nearest grid levels.
	gridStep := (upperPrice - lowerPrice) / float64(levels)
	if gridStep <= 0 {
		sig.Reason = "invalid grid range"
		return sig, nil
	}

	nearestBuyLevel := lowerPrice + math.Floor((price-lowerPrice)/gridStep)*gridStep
	nearestSellLevel := nearestBuyLevel + gridStep

	// Score: volatility matching grid spacing, plus liquidity quality.
	spacingScore := engine.Clamp(50-math.Abs(atrPct-spacing*100)*10, 0, 50)
	spreadScore := engine.Clamp(25-data.SpreadBps, 0, 25)
	rangeScore := engine.Clamp((adxMax-adx)*1.5, 0, 25)
	totalScore := engine.Clamp(spacingScore+spreadScore+rangeScore, 0, 100)

	sig.Decision = "TRADE"
	sig.Score = totalScore
	sig.Bias = "NEUTRAL"
	sig.EntryLow = nearestBuyLevel
	sig.EntryHigh = nearestSellLevel
	sig.StopLoss = lowerPrice - gridStep
	sig.TakeProfit = upperPrice
	sig.TakeProfit2 = upperPrice + gridStep
	sig.Reason = fmt.Sprintf("grid %d levels (%.2f—%.2f), step $%.2f, ATR %.2f%% vs spacing %.2f%%, ADX %.1f",
		levels, lowerPrice, upperPrice, gridStep, atrPct, spacing*100, adx)

	if totalScore < 40 {
		sig.Decision = "WATCH"
	}

	return sig, nil
}
