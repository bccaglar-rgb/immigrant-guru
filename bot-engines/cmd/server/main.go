package main

import (
	"log"

	"github.com/bitrium/bot-engines/internal/api"
	"github.com/bitrium/bot-engines/internal/market"
	// Import all strategies to trigger init() registration
	_ "github.com/bitrium/bot-engines/internal/strategies"
)

func main() {
	log.Println("Bitrium Bot Engines starting...")
	market.Init()
	log.Printf("Redis connected")
	api.Start()
}
