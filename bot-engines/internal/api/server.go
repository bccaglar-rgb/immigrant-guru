package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/bitrium/bot-engines/internal/engine"
	"github.com/bitrium/bot-engines/internal/market"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type EvaluateRequest struct {
	Symbol string                 `json:"symbol"`
	Config map[string]interface{} `json:"config,omitempty"`
}

type EvaluateResponse struct {
	OK     bool           `json:"ok"`
	Signal *engine.Signal `json:"signal,omitempty"`
	Error  string         `json:"error,omitempty"`
}

type StrategiesResponse struct {
	OK         bool                `json:"ok"`
	Strategies []engine.EngineInfo `json:"strategies"`
}

func NewRouter() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/health", healthHandler)
	r.Get("/strategies", strategiesHandler)
	r.Post("/evaluate/{strategy}", evaluateHandler)
	r.Post("/evaluate-batch/{strategy}", evaluateBatchHandler)

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	redisOK := "ok"
	if err := market.GetClient().Ping(ctx).Err(); err != nil {
		redisOK = "error: " + err.Error()
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"redis":      redisOK,
		"strategies": len(engine.All()),
	})
}

func strategiesHandler(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(StrategiesResponse{
		OK:         true,
		Strategies: engine.ListAll(),
	})
}

func evaluateHandler(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "strategy")
	eng, err := engine.Get(slug)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(EvaluateResponse{OK: false, Error: err.Error()})
		return
	}

	var req EvaluateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(EvaluateResponse{OK: false, Error: "invalid request body"})
		return
	}

	data, err := market.ReadFeatures(r.Context(), req.Symbol)
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(EvaluateResponse{OK: false, Error: err.Error()})
		return
	}

	cfg := eng.DefaultConfig()
	if req.Config != nil {
		cfg = &engine.StrategyConfig{Params: req.Config}
	}

	signal, err := eng.Evaluate(r.Context(), data, cfg)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(EvaluateResponse{OK: false, Error: err.Error()})
		return
	}

	json.NewEncoder(w).Encode(EvaluateResponse{OK: true, Signal: signal})
}

type BatchRequest struct {
	Symbols []string               `json:"symbols"`
	Config  map[string]interface{} `json:"config,omitempty"`
}

type BatchResponse struct {
	OK      bool                      `json:"ok"`
	Results map[string]*engine.Signal `json:"results"`
}

func evaluateBatchHandler(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "strategy")
	eng, err := engine.Get(slug)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}

	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": "invalid request"})
		return
	}

	dataMap, err := market.ReadFeaturesBatch(r.Context(), req.Symbols)
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}

	cfg := eng.DefaultConfig()
	if req.Config != nil {
		cfg = &engine.StrategyConfig{Params: req.Config}
	}

	results := make(map[string]*engine.Signal, len(req.Symbols))
	for sym, data := range dataMap {
		sig, err := eng.Evaluate(r.Context(), data, cfg)
		if err != nil { continue }
		results[sym] = sig
	}

	json.NewEncoder(w).Encode(BatchResponse{OK: true, Results: results})
}

func Start() {
	port := os.Getenv("PORT")
	if port == "" { port = "8092" }
	addr := fmt.Sprintf(":%s", port)
	log.Printf("bot-engines listening on %s (%d strategies)", addr, len(engine.All()))
	if err := http.ListenAndServe(addr, NewRouter()); err != nil {
		log.Fatal(err)
	}
}
