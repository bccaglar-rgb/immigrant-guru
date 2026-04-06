package engine

import "math"

// Clamp restricts v to the range [min, max].
func Clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// EMA computes the exponential moving average over the given period.
func EMA(data []float64, period int) []float64 {
	if len(data) < period {
		return nil
	}
	result := make([]float64, len(data))
	k := 2.0 / float64(period+1)
	// Seed with SMA.
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += data[i]
	}
	result[period-1] = sum / float64(period)
	for i := period; i < len(data); i++ {
		result[i] = data[i]*k + result[i-1]*(1-k)
	}
	return result
}

// SMA computes the simple moving average over the given period.
func SMA(data []float64, period int) []float64 {
	if len(data) < period {
		return nil
	}
	result := make([]float64, len(data))
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += data[i]
	}
	result[period-1] = sum / float64(period)
	for i := period; i < len(data); i++ {
		sum += data[i] - data[i-period]
		result[i] = sum / float64(period)
	}
	return result
}

// RSI computes the relative strength index over the given period.
func RSI(closes []float64, period int) []float64 {
	if len(closes) < period+1 {
		return nil
	}
	result := make([]float64, len(closes))
	gains, losses := 0.0, 0.0
	for i := 1; i <= period; i++ {
		d := closes[i] - closes[i-1]
		if d > 0 {
			gains += d
		} else {
			losses -= d
		}
	}
	avgGain := gains / float64(period)
	avgLoss := losses / float64(period)
	if avgLoss == 0 {
		result[period] = 100
	} else {
		rs := avgGain / avgLoss
		result[period] = 100 - 100/(1+rs)
	}
	for i := period + 1; i < len(closes); i++ {
		d := closes[i] - closes[i-1]
		var g, l float64
		if d > 0 {
			g = d
		} else {
			l = -d
		}
		avgGain = (avgGain*float64(period-1) + g) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + l) / float64(period)
		if avgLoss == 0 {
			result[i] = 100
		} else {
			rs := avgGain / avgLoss
			result[i] = 100 - 100/(1+rs)
		}
	}
	return result
}

// MACD computes the MACD line, signal line, and histogram.
func MACD(closes []float64, fast, slow, signal int) (macdLine, signalLine, histogram []float64) {
	emaFast := EMA(closes, fast)
	emaSlow := EMA(closes, slow)
	if emaFast == nil || emaSlow == nil {
		return
	}
	macdLine = make([]float64, len(closes))
	for i := slow - 1; i < len(closes); i++ {
		macdLine[i] = emaFast[i] - emaSlow[i]
	}
	signalLine = EMA(macdLine[slow-1:], signal)
	if signalLine != nil {
		padded := make([]float64, len(closes))
		copy(padded[slow-1+signal-1:], signalLine[signal-1:])
		signalLine = padded
	}
	histogram = make([]float64, len(closes))
	start := slow - 1 + signal - 1
	for i := start; i < len(closes); i++ {
		histogram[i] = macdLine[i] - signalLine[i]
	}
	return
}

// BollingerBands computes upper, middle, and lower Bollinger Bands.
func BollingerBands(closes []float64, period int, mult float64) (upper, middle, lower []float64) {
	middle = SMA(closes, period)
	if middle == nil {
		return
	}
	upper = make([]float64, len(closes))
	lower = make([]float64, len(closes))
	for i := period - 1; i < len(closes); i++ {
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			d := closes[j] - middle[i]
			sum += d * d
		}
		std := math.Sqrt(sum / float64(period))
		upper[i] = middle[i] + mult*std
		lower[i] = middle[i] - mult*std
	}
	return
}

// ATR computes the average true range over the given period.
func ATR(candles []Candle, period int) []float64 {
	if len(candles) < period+1 {
		return nil
	}
	trs := make([]float64, len(candles))
	for i := 1; i < len(candles); i++ {
		hl := candles[i].High - candles[i].Low
		hc := math.Abs(candles[i].High - candles[i-1].Close)
		lc := math.Abs(candles[i].Low - candles[i-1].Close)
		trs[i] = math.Max(hl, math.Max(hc, lc))
	}
	result := make([]float64, len(candles))
	sum := 0.0
	for i := 1; i <= period; i++ {
		sum += trs[i]
	}
	result[period] = sum / float64(period)
	for i := period + 1; i < len(candles); i++ {
		result[i] = (result[i-1]*float64(period-1) + trs[i]) / float64(period)
	}
	return result
}

// VWAP computes the volume-weighted average price.
func VWAP(candles []Candle) []float64 {
	result := make([]float64, len(candles))
	cumVol, cumTP := 0.0, 0.0
	for i, c := range candles {
		tp := (c.High + c.Low + c.Close) / 3
		cumTP += tp * c.Volume
		cumVol += c.Volume
		if cumVol > 0 {
			result[i] = cumTP / cumVol
		}
	}
	return result
}

// ADX computes the average directional index over the given period.
func ADX(candles []Candle, period int) []float64 {
	n := len(candles)
	if n < period*2+1 {
		return nil
	}
	result := make([]float64, n)
	plusDM := make([]float64, n)
	minusDM := make([]float64, n)
	tr := make([]float64, n)
	for i := 1; i < n; i++ {
		upMove := candles[i].High - candles[i-1].High
		downMove := candles[i-1].Low - candles[i].Low
		if upMove > downMove && upMove > 0 {
			plusDM[i] = upMove
		}
		if downMove > upMove && downMove > 0 {
			minusDM[i] = downMove
		}
		hl := candles[i].High - candles[i].Low
		hc := math.Abs(candles[i].High - candles[i-1].Close)
		lc := math.Abs(candles[i].Low - candles[i-1].Close)
		tr[i] = math.Max(hl, math.Max(hc, lc))
	}
	smoothTR := make([]float64, n)
	smoothPDM := make([]float64, n)
	smoothMDM := make([]float64, n)
	for i := 1; i <= period; i++ {
		smoothTR[period] += tr[i]
		smoothPDM[period] += plusDM[i]
		smoothMDM[period] += minusDM[i]
	}
	for i := period + 1; i < n; i++ {
		smoothTR[i] = smoothTR[i-1] - smoothTR[i-1]/float64(period) + tr[i]
		smoothPDM[i] = smoothPDM[i-1] - smoothPDM[i-1]/float64(period) + plusDM[i]
		smoothMDM[i] = smoothMDM[i-1] - smoothMDM[i-1]/float64(period) + minusDM[i]
	}
	dx := make([]float64, n)
	for i := period; i < n; i++ {
		if smoothTR[i] == 0 {
			continue
		}
		pdi := 100 * smoothPDM[i] / smoothTR[i]
		mdi := 100 * smoothMDM[i] / smoothTR[i]
		if pdi+mdi > 0 {
			dx[i] = 100 * math.Abs(pdi-mdi) / (pdi + mdi)
		}
	}
	sum := 0.0
	for i := period; i < period*2; i++ {
		sum += dx[i]
	}
	result[period*2-1] = sum / float64(period)
	for i := period * 2; i < n; i++ {
		result[i] = (result[i-1]*float64(period-1) + dx[i]) / float64(period)
	}
	return result
}

// LastNonZero returns the last non-zero value in data, or 0 if all zeros.
func LastNonZero(data []float64) float64 {
	for i := len(data) - 1; i >= 0; i-- {
		if data[i] != 0 {
			return data[i]
		}
	}
	return 0
}

// ClosesFromCandles extracts close prices from a slice of candles.
func ClosesFromCandles(candles []Candle) []float64 {
	result := make([]float64, len(candles))
	for i, c := range candles {
		result[i] = c.Close
	}
	return result
}

// HighsFromCandles extracts high prices from a slice of candles.
func HighsFromCandles(candles []Candle) []float64 {
	result := make([]float64, len(candles))
	for i, c := range candles {
		result[i] = c.High
	}
	return result
}

// LowsFromCandles extracts low prices from a slice of candles.
func LowsFromCandles(candles []Candle) []float64 {
	result := make([]float64, len(candles))
	for i, c := range candles {
		result[i] = c.Low
	}
	return result
}

// VolumesFromCandles extracts volumes from a slice of candles.
func VolumesFromCandles(candles []Candle) []float64 {
	result := make([]float64, len(candles))
	for i, c := range candles {
		result[i] = c.Volume
	}
	return result
}

// Mean returns the arithmetic mean of data.
func Mean(data []float64) float64 {
	if len(data) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range data {
		sum += v
	}
	return sum / float64(len(data))
}

// StdDev returns the population standard deviation of data.
func StdDev(data []float64) float64 {
	if len(data) < 2 {
		return 0
	}
	m := Mean(data)
	sum := 0.0
	for _, v := range data {
		d := v - m
		sum += d * d
	}
	return math.Sqrt(sum / float64(len(data)))
}
