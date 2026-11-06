package main

import (
	"os"
	"strings"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/i18n"
)

type languageChoice struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

var appLanguages = []string{"en", "zh-Hans"}
var displayedLanguages = []string{"zh-Hans", "en"}

func languageChoices() []languageChoice {
	choices := make([]languageChoice, 0, len(displayedLanguages)+1)
	choices = append(choices, languageChoice{Tag: "", Name: t("followSystem")})
	for _, tag := range displayedLanguages {
		name := i18n.Autonym(tag)
		if name == "" {
			name = tag
		}
		choices = append(choices, languageChoice{Tag: tag, Name: name})
	}
	return choices
}

func validLanguage(tag string) bool {
	if tag == "" {
		return true
	}
	for _, language := range appLanguages {
		if language == tag {
			return true
		}
	}
	return false
}

// localePreferenceFor infers the preference when the client has no saved one.
// MyGo exposes the resolved locale but not whether it came from an override,
// so a choice that matches the system is treated as following the system.
func localePreferenceFor(current string, preferred []string) string {
	system := i18n.Match(preferred, appLanguages)
	if system == "" {
		system = appLanguages[0]
	}
	if system == current {
		return ""
	}
	return current
}

// resolveLocalePreference keeps an explicitly selected language even when it
// matches the system. A saved choice that no longer matches the resolved
// locale yields to an external language change.
func resolveLocalePreference(saved, current string, preferred []string) string {
	if saved != "" && saved == current && validLanguage(saved) {
		return saved
	}
	return localePreferenceFor(current, preferred)
}

func inferLocalePreference() string {
	return localePreferenceFor(mygo.App.Locale(), mygo.App.PreferredLanguages())
}

func (a *app) applyLocalePreference() {
	if strings.TrimSpace(os.Getenv("MYGO_LOCALE")) != "" {
		a.localePreference = inferLocalePreference()
		return
	}
	resolved := resolveLocalePreference(a.settings.Locale, mygo.App.Locale(), mygo.App.PreferredLanguages())
	if resolved != a.settings.Locale {
		a.persistLocalePreference(resolved)
	}
	a.localePreference = resolved
	mygo.App.SetLocale(a.localePreference)
}

func (a *app) setLocale(tag string) {
	if !validLanguage(tag) {
		return
	}
	a.localePreference = tag
	a.persistLocalePreference(tag)
	before := i18n.Locale()
	mygo.App.SetLocale(tag)
	if i18n.Locale() == before {
		a.refreshLocale()
	}
}

func (a *app) persistLocalePreference(tag string) {
	a.draft.Locale = tag
	if a.settings.Locale == tag {
		return
	}
	a.settings.Locale = tag
	if a.settingsPath == "" {
		return
	}
	if err := saveSettings(a.settingsPath, a.settings); err != nil {
		a.err = err
	}
}

func (a *app) refreshLocale() {
	mygo.App.SetName(t("appName"))
	if a.win != nil {
		a.win.SetTitle(t("appName"))
	}
	if a.tray != nil {
		a.tray.SetToolTip(t("appName"))
	}
	a.updateMenus()
	a.invalidate()
}
