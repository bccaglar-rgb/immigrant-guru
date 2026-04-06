package market

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/bitrium/bot-engines/internal/engine"
	"github.com/redis/go-redis/v9"
)

var client *redis.Client

func Init() {
	addr := os.Getenv("REDIS_URL")
	if addr == "" {
		addr = "localhost:6379"
	}
	client = redis.NewClient(&redis.Options{
		Addr: addr,
		DB:   0, // cache DB
	})
}

func GetClient() *redis.Client {
	return client
}

// redisFeature mirrors the Node.js BotFeatureSnapshot structure
type redisFeature struct {
	Symbol       string   `json:"symbol"`
	Price        float64  `json:"price"`
	Change24hPct float64  `json:"change24hPct"`
	Volume24hUsd float64  `json:"volume24hUsd"`
	SpreadBps    *float64 `json:"spreadBps"`
	DepthUsd     *float64 `json:"depthUsd"`
	Imbalance    *float64 `json:"imbalance"`
	FundingRate  *float64 `json:"fundingRate"`
	AtrPct       *float64 `json:"atrPct"`
	Rsi14        *float64 `json:"rsi14"`
	SrDistPct    *float64 `json:"srDistPct"`
	Tier1Score   float64  `json:"tier1Score"`
	Composite    float64  `json:"compositeScore"`
	UpdatedAt    int64    `json:"updatedAt"`
}

func ReadFeatures(ctx context.Context, symbol string) (*engine.MarketData, error) {
	key := fmt.Sprintf("bot:features:%s", symbol)
	val, err := client.Get(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("feature read %s: %w", symbol, err)
	}
	var f redisFeature
	if err := json.Unmarshal([]byte(val), &f); err != nil {
		return nil, fmt.Errorf("feature parse %s: %w", symbol, err)
	}
	md := &engine.MarketData{
		Symbol:       f.Symbol,
		Price:        f.Price,
		Change24hPct: f.Change24hPct,
		Volume24hUsd: f.Volume24hUsd,
		Tier1Score:   f.Tier1Score,
		Composite:    f.Composite,
	}
	if f.SpreadBps != nil { md.SpreadBps = *f.SpreadBps }
	if f.DepthUsd != nil { md.DepthUsd = *f.DepthUsd }
	if f.Imbalance != nil { md.Imbalance = *f.Imbalance }
	if f.FundingRate != nil { md.FundingRate = *f.FundingRate }
	if f.AtrPct != nil { md.AtrPct = *f.AtrPct }
	if f.Rsi14 != nil { md.Rsi14 = *f.Rsi14 }
	if f.SrDistPct != nil { md.SrDistPct = *f.SrDistPct }
	return md, nil
}

func ReadFeaturesBatch(ctx context.Context, symbols []string) (map[string]*engine.MarketData, error) {
	if len(symbols) == 0 {
		return map[string]*engine.MarketData{}, nil
	}
	keys := make([]string, len(symbols))
	for i, s := range symbols {
		keys[i] = fmt.Sprintf("bot:features:%s", s)
	}
	vals, err := client.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	result := make(map[string]*engine.MarketData, len(symbols))
	for i, v := range vals {
		if v == nil { continue }
		s, ok := v.(string)
		if !ok { continue }
		var f redisFeature
		if json.Unmarshal([]byte(s), &f) != nil { continue }
		md := &engine.MarketData{
			Symbol: symbols[i], Price: f.Price,
			Change24hPct: f.Change24hPct, Volume24hUsd: f.Volume24hUsd,
			Tier1Score: f.Tier1Score, Composite: f.Composite,
		}
		if f.SpreadBps != nil { md.SpreadBps = *f.SpreadBps }
		if f.DepthUsd != nil { md.DepthUsd = *f.DepthUsd }
		if f.Imbalance != nil { md.Imbalance = *f.Imbalance }
		if f.FundingRate != nil { md.FundingRate = *f.FundingRate }
		if f.AtrPct != nil { md.AtrPct = *f.AtrPct }
		if f.Rsi14 != nil { md.Rsi14 = *f.Rsi14 }
		if f.SrDistPct != nil { md.SrDistPct = *f.SrDistPct }
		result[symbols[i]] = md
	}
	return result, nil
}
