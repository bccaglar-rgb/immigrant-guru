package strategies

import (
	"context"
	"fmt"
	"math"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Hybrid runs a multi-strategy ensemble combining trend, momentum, and
// mean-reversion sub-strategies. Signal consensus (2/3 agree) strengthens
// confidence. Dynamic weighting adapts to market regime via ADX.
type Hybrid struct{}

func init() { engine.Register(&Hybrid{}) }

func (s *Hybrid) Name() string     { return "Hybrid Bot" }
func (s *Hybrid) Slug() string     { return "hybrid" }
func (s *Hybrid) Category() string { return "advanced" }
func (s *Hybrid) Description() string {
	return "Multi-strategy ensemble with dynamic weighting based on market regime"
}

func (s *Hybrid) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"ema_fast":       12,
			"ema_slow":       26,
			"rsi_period":     14,
			"bb_period":      20,
			"bb_mult":        2.0,
			"adx_trend_min":  25.0,
			"trend_weight":   0.4,
			"mom_weight":     0.35,
			"mr_weight":      0.25,
			"consensus_min":  2,
			"atr_sl_mult":    1.5,
			"atr_tp_mult":    2.5,
		},
	}
}

func (s *Hybrid) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	emaFast := getInt(p, "ema_fast", 12)
	emaSlow := getInt(p, "ema_slow", 26)
	bbPeriod := getInt(p, "bb_period", 20)
	bbMult := getFloat(p, "bb_mult", 2.0)
	adxTrendMin := getFloat(p, "adx_trend_min", 25.0)
	trendW := getFloat(p, "trend_weight", 0.4)
	momW := getFloat(p, "mom_weight", 0.35)
	mrW := getFloat(p, "mr_weight", 0.25)
	consensusMin := getInt(p, "consensus_min", 2)
	atrSL := getFloat(p, "atr_sl_mult", 1.5)
	atrTP := getFloat(p, "atr_tp_mult", 2.5)

	closes := engine.ClosesFromCandles(data.Candles)
	if len(closes) < emaSlow+10 {
		return &engine.Signal{Decision: "NO_TRADE", Reason: "insufficient candle data"}, nil
	}

	fast := engine.EMA(closes, emaFast)
	slow := engine.EMA(closes, emaSlow)
	upper, _, lower := engine.BollingerBands(closes, bbPeriod, bbMult)
	adxArr := engine.ADX(data.Candles, 14)
	atrArr := engine.ATR(data.Candles, 14)
	adx := engine.LastNonZero(adxArr)
	atr := engine.LastNonZero(atrArr)
	rsi := data.Rsi14
	price := data.Price

	sig := &engine.Signal{Decision: "NO_TRADE", Bias: "NEUTRAL", Indicators: map[string]float64{
		"adx": adx, "rsi": rsi, "atr": atr,
		"ema_fast": engine.LastNonZero(fast),
		"ema_slow": engine.LastNonZero(slow),
	}}

	// Sub-strategy 1: Trend (EMA cross direction)
	trendBias := 0.0 // -1 to 1
	lastFast := engine.LastNonZero(fast)
	lastSlow := engine.LastNonZero(slow)
	if lastFast > lastSlow {
		trendBias = engine.Clamp((lastFast-lastSlow)/lastSlow*500, 0.1, 1.0)
	} else if lastFast < lastSlow {
		trendBias = -engine.Clamp((lastSlow-lastFast)/lastSlow*500, 0.1, 1.0)
	}

	// Sub-strategy 2: Momentum (RSI + MACD histogram)
	macdLine, signalLine, _ := engine.MACD(closes, 12, 26, 9)
	macdVal := engine.LastNonZero(macdLine)
	macdSig := engine.LastNonZero(signalLine)
	momBias := 0.0
	if rsi > 55 && macdVal > macdSig {
		momBias = engine.Clamp((rsi-50)/50+(macdVal-macdSig)*100, 0.1, 1.0)
	} else if rsi < 45 && macdVal < macdSig {
		momBias = -engine.Clamp((50-rsi)/50+(macdSig-macdVal)*100, 0.1, 1.0)
	}

	// Sub-strategy 3: Mean Reversion (Bollinger Band touch)
	lastUpper := engine.LastNonZero(upper)
	lastLower := engine.LastNonZero(lower)
	mrBias := 0.0
	if lastLower > 0 && price <= lastLower {
		mrBias = engine.Clamp((lastLower-price)/atr, 0.2, 1.0)
	} else if lastUpper > 0 && price >= lastUpper {
		mrBias = -engine.Clamp((price-lastUpper)/atr, 0.2, 1.0)
	}

	// Dynamic weight adjustment: in trending markets boost trend weight
	trending := adx >= adxTrendMin
	if trending {
		trendW *= 1.3
		mrW *= 0.6
	} else {
		trendW *= 0.6
		mrW *= 1.4
	}
	totalW := trendW + momW + mrW

	// Weighted composite score
	composite := (trendBias*trendW + momBias*momW + mrBias*mrW) / totalW
	sig.Indicators["trend_bias"] = trendBias
	sig.Indicators["mom_bias"] = momBias
	sig.Indicators["mr_bias"] = mrBias
	sig.Indicators["composite"] = composite

	// Count consensus
	longVotes, shortVotes := 0, 0
	if trendBias > 0.1 {
		longVotes++
	} else if trendBias < -0.1 {
		shortVotes++
	}
	if momBias > 0.1 {
		longVotes++
	} else if momBias < -0.1 {
		shortVotes++
	}
	if mrBias > 0.1 {
		longVotes++
	} else if mrBias < -0.1 {
		shortVotes++
	}

	if longVotes >= consensusMin && composite > 0.15 {
		score := engine.Clamp(math.Abs(composite)*100+float64(longVotes)*10, 50, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "LONG"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price - atr*atrSL
		sig.TakeProfit = price + atr*atrTP
		sig.TakeProfit2 = price + atr*atrTP*1.5
		sig.Reason = fmt.Sprintf("hybrid LONG consensus %d/3 (T:%.2f M:%.2f R:%.2f), ADX %.1f regime: %s",
			longVotes, trendBias, momBias, mrBias, adx, map[bool]string{true: "trending", false: "ranging"}[trending])
		return sig, nil
	}

	if shortVotes >= consensusMin && composite < -0.15 {
		score := engine.Clamp(math.Abs(composite)*100+float64(shortVotes)*10, 50, 100)
		sig.Decision = "TRADE"
		sig.Score = score
		sig.Bias = "SHORT"
		sig.EntryLow = price * 0.999
		sig.EntryHigh = price * 1.001
		sig.StopLoss = price + atr*atrSL
		sig.TakeProfit = price - atr*atrTP
		sig.TakeProfit2 = price - atr*atrTP*1.5
		sig.Reason = fmt.Sprintf("hybrid SHORT consensus %d/3 (T:%.2f M:%.2f R:%.2f), ADX %.1f regime: %s",
			shortVotes, trendBias, momBias, mrBias, adx, map[bool]string{true: "trending", false: "ranging"}[trending])
		return sig, nil
	}

	if longVotes > 0 || shortVotes > 0 {
		sig.Decision = "WATCH"
		sig.Score = engine.Clamp(math.Abs(composite)*60, 10, 45)
		sig.Bias = map[bool]string{true: "LONG", false: "SHORT"}[composite > 0]
		sig.Reason = fmt.Sprintf("partial consensus L:%d S:%d, composite %.2f — waiting", longVotes, shortVotes, composite)
	} else {
		sig.Reason = "no sub-strategy bias detected"
	}
	return sig, nil
}
