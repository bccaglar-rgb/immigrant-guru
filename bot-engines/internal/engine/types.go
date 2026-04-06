package engine

import "context"

// MarketData holds all market information for a symbol.
type MarketData struct {
	Symbol       string  `json:"symbol"`
	Price        float64 `json:"price"`
	Change24hPct float64 `json:"change24hPct"`
	Volume24hUsd float64 `json:"volume24hUsd"`
	SpreadBps    float64 `json:"spreadBps"`
	DepthUsd     float64 `json:"depthUsd"`
	Imbalance    float64 `json:"imbalance"`
	FundingRate  float64 `json:"fundingRate"`
	AtrPct       float64 `json:"atrPct"`
	Rsi14        float64 `json:"rsi14"`
	SrDistPct    float64 `json:"srDistPct"`
	Tier1Score   float64 `json:"tier1Score"`
	Composite    float64 `json:"compositeScore"`
	// Candles holds the most recent N OHLCV candles.
	Candles []Candle `json:"candles,omitempty"`
}

// Candle represents a single OHLCV bar.
type Candle struct {
	Open   float64 `json:"o"`
	High   float64 `json:"h"`
	Low    float64 `json:"l"`
	Close  float64 `json:"c"`
	Volume float64 `json:"v"`
	Time   int64   `json:"t"`
}

// Signal is the output of a strategy evaluation.
type Signal struct {
	Decision    string             `json:"decision"`              // TRADE, WATCH, NO_TRADE
	Score       float64            `json:"score"`                 // 0-100
	Bias        string             `json:"bias"`                  // LONG, SHORT, NEUTRAL
	EntryLow    float64            `json:"entryLow"`
	EntryHigh   float64            `json:"entryHigh"`
	StopLoss    float64            `json:"stopLoss"`
	TakeProfit  float64            `json:"takeProfit"`
	TakeProfit2 float64            `json:"takeProfit2,omitempty"`
	Reason      string             `json:"reason"`
	Indicators  map[string]float64 `json:"indicators,omitempty"`
}

// StrategyConfig holds configurable parameters for a strategy.
type StrategyConfig struct {
	Params map[string]interface{} `json:"params"`
}

// Engine is the interface all strategy engines must implement.
type Engine interface {
	Name() string
	Slug() string
	Category() string
	Description() string
	Evaluate(ctx context.Context, data *MarketData, config *StrategyConfig) (*Signal, error)
	DefaultConfig() *StrategyConfig
}
