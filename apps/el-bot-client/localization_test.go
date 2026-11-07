package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestLocalePreferenceDistinguishesSystemAndExplicitLanguages(t *testing.T) {
	tests := []struct {
		name      string
		current   string
		preferred []string
		want      string
	}{
		{"system English", "en", []string{"en-US"}, ""},
		{"system Chinese", "zh-Hans", []string{"zh-CN"}, ""},
		{"explicit English", "en", []string{"zh-CN"}, "en"},
		{"explicit Chinese", "zh-Hans", []string{"en-US"}, "zh-Hans"},
		{"unsupported system falls back to English", "en", []string{"ja-JP"}, ""},
		{"no preferred language", "en", nil, ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := localePreferenceFor(test.current, test.preferred); got != test.want {
				t.Fatalf("localePreferenceFor(%q, %v) = %q, want %q", test.current, test.preferred, got, test.want)
			}
		})
	}
}

func TestSavedLocalePreferenceDistinguishesExplicitSystemLanguage(t *testing.T) {
	tests := []struct {
		name      string
		saved     string
		current   string
		preferred []string
		want      string
	}{
		{"explicit Chinese matching system", "zh-Hans", "zh-Hans", []string{"zh-CN"}, "zh-Hans"},
		{"explicit English matching system", "en", "en", []string{"en-US"}, "en"},
		{"explicit English on Chinese system", "en", "en", []string{"zh-CN"}, "en"},
		{"follow system", "", "zh-Hans", []string{"zh-CN"}, ""},
		{"external change wins", "en", "zh-Hans", []string{"zh-CN"}, ""},
		{"invalid saved language", "fr", "en", []string{"zh-CN"}, "en"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := resolveLocalePreference(test.saved, test.current, test.preferred); got != test.want {
				t.Fatalf("resolveLocalePreference(%q, %q, %v) = %q, want %q", test.saved, test.current, test.preferred, got, test.want)
			}
		})
	}
}

func TestLocalePreferencePersistsWithClientSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "client.json")
	settings := Settings{Locale: "zh-Hans", Cloud: CloudSettings{SSHHost: "yunlefun"}}
	if err := saveSettings(path, settings); err != nil {
		t.Fatal(err)
	}
	loaded, err := loadSettings(path, "/home/test")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Locale != "zh-Hans" || loaded.Cloud.SSHHost != "yunlefun" {
		t.Fatalf("locale preference was not persisted: %+v", loaded)
	}

	a := &app{settingsPath: path, settings: settings, draft: settings}
	a.persistLocalePreference("en")
	loaded, err = loadSettings(path, "/home/test")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Locale != "en" || a.draft.Locale != "en" {
		t.Fatalf("changed locale preference was not persisted: settings=%+v draft=%+v", loaded, a.draft)
	}
	a.persistLocalePreference("")
	loaded, err = loadSettings(path, "/home/test")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Locale != "" {
		t.Fatalf("follow system did not clear the locale preference: %+v", loaded)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatal("client settings are not private")
	}
}

func TestLanguageChoicesFollowCatalogOrder(t *testing.T) {
	choices := languageChoices()
	if len(choices) != 3 {
		t.Fatalf("language choices = %+v", choices)
	}
	if choices[0].Tag != "" || choices[1].Tag != "zh-Hans" || choices[2].Tag != "en" {
		t.Fatalf("unexpected language order: %+v", choices)
	}
	for _, choice := range choices {
		if choice.Name == "" {
			t.Fatalf("language %q has no label", choice.Tag)
		}
	}
	if validLanguage("fr") || !validLanguage("") || !validLanguage("zh-Hans") || !validLanguage("en") {
		t.Fatal("language validation accepts an unsupported tag")
	}
}
