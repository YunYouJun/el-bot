package main

import (
	"runtime"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

func platformWindowOptions(base mygo.WindowOptions) mygo.WindowOptions {
	return platformWindowOptionsFor(base, runtime.GOOS)
}

func platformWindowOptionsFor(base mygo.WindowOptions, goos string) mygo.WindowOptions {
	if goos != "windows" {
		return base
	}
	base.TitleBarStyle = mygo.TitleBarHidden
	base.TitleBarHeight = 40
	base.AutoHideMenuBar = true
	base.Vibrancy = mygo.VibrancyMica
	return base
}

func platformUIFont(goos string) string {
	if goos == "windows" {
		return "Segoe UI Variable Text"
	}
	return "Avenir Next"
}

func platformUsesWindowsConventions(goos string) bool {
	return goos == "windows"
}

func applyPlatformTheme(theme *ui.Theme, preferences ui.Preferences) {
	applyPlatformThemeFor(theme, preferences, runtime.GOOS)
}

func applyPlatformThemeFor(theme *ui.Theme, preferences ui.Preferences, goos string) {
	theme.Font = platformUIFont(goos)
	if !platformUsesWindowsConventions(goos) {
		return
	}

	theme.Radius = 8
	theme.Spacing = 4
	if accent := preferences.Accent; accent.A > 0 {
		white := ui.Color{R: 255, G: 255, B: 255, A: 255}
		black := ui.Color{A: 255}
		theme.Accent = accent
		if theme.Dark {
			theme.AccentHover = accent.Mix(white, 0.2)
			theme.AccentPressed = accent.Mix(black, 0.15)
			theme.Selection = accent.Alpha(0.4)
			theme.Focus = accent.Mix(white, 0.2).Alpha(0.6)
		} else {
			theme.AccentHover = accent.Mix(black, 0.12)
			theme.AccentPressed = accent.Mix(black, 0.25)
			theme.Selection = accent.Alpha(0.25)
			theme.Focus = accent.Alpha(0.55)
		}
		luminance := (299*int(accent.R) + 587*int(accent.G) + 114*int(accent.B)) / 1000
		if luminance > 165 {
			theme.AccentText = ui.Color{R: 24, G: 24, B: 27, A: 255}
		}
	}
	if preferences.HighContrast {
		theme.Border = theme.Border.Mix(theme.Text, 0.45)
		theme.TextMuted = theme.TextMuted.Mix(theme.Text, 0.4)
		theme.Focus.A = 255
	}
	if preferences.TextScale > 0 && preferences.TextScale != 1 {
		theme.FontSize *= preferences.TextScale
	}
}
