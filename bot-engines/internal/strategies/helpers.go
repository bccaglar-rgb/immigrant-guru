package strategies

import "math"

// getFloat reads a float64 from params with a default.
func getFloat(params map[string]interface{}, key string, def float64) float64 {
	if v, ok := params[key]; ok {
		switch t := v.(type) {
		case float64:
			return t
		case int:
			return float64(t)
		}
	}
	return def
}

// getInt reads an int from params with a default.
func getInt(params map[string]interface{}, key string, def int) int {
	if v, ok := params[key]; ok {
		switch t := v.(type) {
		case float64:
			return int(t)
		case int:
			return t
		}
	}
	return def
}

// getString reads a string from params with a default.
func getString(params map[string]interface{}, key string, def string) string {
	if v, ok := params[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return def
}

// getBool reads a bool from params with a default.
func getBool(params map[string]interface{}, key string, def bool) bool {
	if v, ok := params[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return def
}

// recentHigh returns the highest value in a slice.
func recentHigh(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	h := vals[0]
	for _, v := range vals[1:] {
		if v > h {
			h = v
		}
	}
	return h
}

// recentLow returns the lowest value in a slice.
func recentLow(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	l := vals[0]
	for _, v := range vals[1:] {
		if v < l {
			l = v
		}
	}
	return l
}

// pctDiff returns the percentage difference between a and b relative to b.
func pctDiff(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return math.Abs(a-b) / b * 100
}
