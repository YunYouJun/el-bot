package locales

import (
	"embed"
	"encoding/json"
)

//go:embed en.json zh-Hans.json
var files embed.FS

type catalog struct{ values map[string]map[string]string }

var Catalog = func() catalog {
	c := catalog{values: make(map[string]map[string]string)}
	for _, language := range []string{"en", "zh-Hans"} {
		data, _ := files.ReadFile(language + ".json")
		var values map[string]string
		_ = json.Unmarshal(data, &values)
		c.values[language] = values
	}
	return c
}()

func (c catalog) Format(language, key string, _ any) string {
	if value := c.values[language][key]; value != "" {
		return value
	}
	if value := c.values["en"][key]; value != "" {
		return value
	}
	return key
}
