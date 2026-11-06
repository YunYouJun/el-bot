package main

import (
	"os"
	"strings"
)

type languageChoice struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

var activeLocale = "en"

func languageChoices() []languageChoice {
	return []languageChoice{{"", t("followSystem")}, {"zh-Hans", "简体中文"}, {"en", "English"}}
}
func validLanguage(tag string) bool { return tag == "" || tag == "en" || tag == "zh-Hans" }
func matchLanguage(preferred []string) string {
	for _, tag := range preferred {
		tag = strings.ToLower(strings.ReplaceAll(tag, "_", "-"))
		if strings.HasPrefix(tag, "zh") {
			return "zh-Hans"
		}
		if strings.HasPrefix(tag, "en") {
			return "en"
		}
	}
	return "en"
}
func localePreferenceFor(current string, preferred []string) string {
	if matchLanguage(preferred) == current {
		return ""
	}
	return current
}
func resolveLocalePreference(saved, current string, preferred []string) string {
	if saved != "" && saved == current && validLanguage(saved) {
		return saved
	}
	return localePreferenceFor(current, preferred)
}
func (a *app) applyLocalePreference() {
	a.localePreference = a.settings.Locale
	if !validLanguage(a.localePreference) {
		a.localePreference = ""
	}
	a.refreshLocale()
}
func (a *app) setLocale(tag string) {
	if !validLanguage(tag) {
		return
	}
	a.localePreference = tag
	a.persistLocalePreference(tag)
	a.refreshLocale()
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
	activeLocale = a.localePreference
	if activeLocale == "" {
		activeLocale = matchLanguage([]string{os.Getenv("YUN_SYSTEM_LOCALE"), os.Getenv("LANG")})
	}
	a.invalidate()
}
