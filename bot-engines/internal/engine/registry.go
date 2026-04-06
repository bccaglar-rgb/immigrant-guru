package engine

import "fmt"

var registry = map[string]Engine{}

// Register adds a strategy engine to the global registry.
func Register(e Engine) {
	registry[e.Slug()] = e
}

// Get retrieves a strategy engine by its slug.
func Get(slug string) (Engine, error) {
	e, ok := registry[slug]
	if !ok {
		return nil, fmt.Errorf("unknown strategy: %s", slug)
	}
	return e, nil
}

// All returns the full registry map.
func All() map[string]Engine {
	return registry
}

// EngineInfo is a serializable summary of an engine.
type EngineInfo struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Category    string `json:"category"`
	Description string `json:"description"`
}

// ListAll returns info for every registered engine.
func ListAll() []EngineInfo {
	var list []EngineInfo
	for _, e := range registry {
		list = append(list, EngineInfo{
			Name:        e.Name(),
			Slug:        e.Slug(),
			Category:    e.Category(),
			Description: e.Description(),
		})
	}
	return list
}
