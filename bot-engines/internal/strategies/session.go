package strategies

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/bitrium/bot-engines/internal/engine"
)

// Session trades based on the active market session (Asian, European, US),
// adapting strategy to each session's characteristics: range-bound for Asian,
// breakout for European, and trend continuation for US.
type Session struct{}

func init() { engine.Register(&Session{}) }

func (s *Session) Name() string     { return "Session Bot" }
func (s *Session) Slug() string     { return "session" }
func (s *Session) Category() string { return "pro" }
func (s *Session) Description() string {
	return "Session-aware trading adapting to Asian, European, and US market characteristics"
}

func (s *Session) DefaultConfig() *engine.StrategyConfig {
	return &engine.StrategyConfig{
		Params: map[string]interface{}{
			"asian_start_utc":  0,
			"asian_end_utc":    8,
			"eu_start_utc":     7,
			"eu_end_utc":       16,
			"us_start_utc":     13,
			"us_end_utc":       22,
			"range_lookback":   12,
			"breakout_mult":    1.2,
			"ema_period":       20,
			"sl_atr_mult":      1.5,
			"tp_atr_mult":      2.0,
			"min_volume_ratio": 0.8,
		},
	}
}

func (s *Session) Evaluate(ctx context.Context, data *engine.MarketData, config *engine.StrategyConfig) (*engine.Signal, error) {
	p := config.Params
	asianStart := getInt(p, "asian_start_utc", 0)
	asianEnd := getInt(p, "asian_end_utc", 8)
	euStart := getInt(p, "eu_start_utc", 7)
	euEnd := getInt(p, "eu_end_utc", 16)
	usStart := getInt(p, "us_start_utc", 13)
	usEnd := getInt(p, "us_end_utc", 22)
	rangeLookback := getInt(p, "range_lookback", 12)
	breakoutMult := getFloat(p, "breakout_mult", 1.2)
	emaPeriod := getInt(p, "ema_period", 20)
	slAtrMult := getFloat(p, "sl_atr_mult", 1.5)
	tpAtrMult := getFloat(p, "tp_atr_mult", 2.0)

	price := data.Price
	candles := data.Candles

	sig := &engine.Signal{
		Decision: "NO_TRADE",
		Bias:     "NEUTRAL",
		Indicators: map[string]float64{
			"price":   price,
			"atr_pct": data.AtrPct,
		},
	}

	closes := engine.ClosesFromCandles(candles)
	if len(closes) < emaPeriod+5 || len(candles) < rangeLookback+1 {
		sig.Reason = "insufficient candle data"
		return sig, nil
	}

	atrSlice := engine.ATR(candles, 14)
	if atrSlice == nil {
		sig.Reason = "ATR calculation failed"
		return sig, nil
	}
	currentATR := engine.LastNonZero(atrSlice)
	slDist := currentATR * slAtrMult
	tpDist := currentATR * tpAtrMult

	// Determine current session
	hour := time.Now().UTC().Hour()
	var session string
	switch {
	case hour >= asianStart && hour < asianEnd:
		session = "asian"
	case hour >= euStart && hour < euEnd:
		session = "european"
	case hour >= usStart && hour < usEnd:
		session = "us"
	default:
		session = "off-hours"
	}
	sig.Indicators["session"] = map[string]float64{"asian": 1, "european": 2, "us": 3, "off-hours": 0}[session]

	highs := engine.HighsFromCandles(candles)
	lows := engine.LowsFromCandles(candles)
	recentHighs := highs[len(highs)-rangeLookback:]
	recentLows := lows[len(lows)-rangeLookback:]
	rangeHigh := recentHigh(recentHighs)
	rangeLow := recentLow(recentLows)
	rangeSize := rangeHigh - rangeLow
	sig.Indicators["range_high"] = rangeHigh
	sig.Indicators["range_low"] = rangeLow

	switch session {
	case "asian":
		// Range-bound: fade extremes
		if rangeSize == 0 {
			sig.Reason = "zero range in Asian session"
			return sig, nil
		}
		posInRange := (price - rangeLow) / rangeSize
		sig.Indicators["range_position"] = posInRange

		if posInRange < 0.2 {
			score := engine.Clamp((0.2-posInRange)*300+20, 20, 85)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = rangeLow
			sig.EntryHigh = rangeLow + rangeSize*0.25
			sig.StopLoss = math.Max(rangeLow-slDist, 0)
			sig.TakeProfit = rangeLow + rangeSize*0.5
			sig.TakeProfit2 = rangeLow + rangeSize*0.75
			sig.Reason = fmt.Sprintf("[asian] price near range low (%.0f%%) — range long", posInRange*100)
			return sig, nil
		}
		if posInRange > 0.8 {
			score := engine.Clamp((posInRange-0.8)*300+20, 20, 85)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = rangeHigh - rangeSize*0.25
			sig.EntryHigh = rangeHigh
			sig.StopLoss = rangeHigh + slDist
			sig.TakeProfit = rangeHigh - rangeSize*0.5
			sig.TakeProfit2 = rangeHigh - rangeSize*0.75
			sig.Reason = fmt.Sprintf("[asian] price near range high (%.0f%%) — range short", posInRange*100)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 15
		sig.Reason = fmt.Sprintf("[asian] price mid-range (%.0f%%) — waiting for extremes", posInRange*100)

	case "european":
		// Breakout strategy
		breakoutHigh := rangeHigh + currentATR*(breakoutMult-1)
		breakoutLow := rangeLow - currentATR*(breakoutMult-1)
		sig.Indicators["breakout_high"] = breakoutHigh
		sig.Indicators["breakout_low"] = breakoutLow

		if price > breakoutHigh {
			score := engine.Clamp((price-breakoutHigh)/currentATR*40+35, 25, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = breakoutHigh
			sig.EntryHigh = price * 1.002
			sig.StopLoss = rangeLow
			sig.TakeProfit = price + tpDist
			sig.TakeProfit2 = price + tpDist*1.8
			sig.Reason = fmt.Sprintf("[european] breakout above %.2f — momentum long", breakoutHigh)
			return sig, nil
		}
		if price < breakoutLow {
			score := engine.Clamp((breakoutLow-price)/currentATR*40+35, 25, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = price * 0.998
			sig.EntryHigh = breakoutLow
			sig.StopLoss = rangeHigh
			sig.TakeProfit = price - tpDist
			sig.TakeProfit2 = price - tpDist*1.8
			sig.Reason = fmt.Sprintf("[european] breakdown below %.2f — momentum short", breakoutLow)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 20
		sig.Reason = fmt.Sprintf("[european] within range — awaiting breakout above %.2f or below %.2f", breakoutHigh, breakoutLow)

	case "us":
		// Trend continuation
		ema := engine.EMA(closes, emaPeriod)
		if ema == nil {
			sig.Reason = "EMA calculation failed for US session"
			return sig, nil
		}
		lastEMA := engine.LastNonZero(ema)
		sig.Indicators["ema"] = lastEMA
		trendUp := price > lastEMA && data.Change24hPct > 0
		trendDown := price < lastEMA && data.Change24hPct < 0

		if trendUp {
			score := engine.Clamp((price-lastEMA)/currentATR*40+30, 25, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "LONG"
			sig.EntryLow = lastEMA
			sig.EntryHigh = price * 1.002
			sig.StopLoss = lastEMA - slDist
			sig.TakeProfit = price + tpDist*1.5
			sig.TakeProfit2 = price + tpDist*2.5
			sig.Reason = fmt.Sprintf("[us] trend continuation long, price above EMA(%d) %.2f", emaPeriod, lastEMA)
			return sig, nil
		}
		if trendDown {
			score := engine.Clamp((lastEMA-price)/currentATR*40+30, 25, 100)
			sig.Decision = "TRADE"
			sig.Score = score
			sig.Bias = "SHORT"
			sig.EntryLow = price * 0.998
			sig.EntryHigh = lastEMA
			sig.StopLoss = lastEMA + slDist
			sig.TakeProfit = price - tpDist*1.5
			sig.TakeProfit2 = price - tpDist*2.5
			sig.Reason = fmt.Sprintf("[us] trend continuation short, price below EMA(%d) %.2f", emaPeriod, lastEMA)
			return sig, nil
		}
		sig.Decision = "WATCH"
		sig.Score = 15
		sig.Reason = fmt.Sprintf("[us] no clear trend continuation — price %.2f vs EMA %.2f", price, lastEMA)

	default:
		sig.Reason = "off-hours — no active session"
	}

	return sig, nil
}
