package main

import (
	"testing"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

func TestPlatformWindowOptions(t *testing.T) {
	base := mygo.WindowOptions{Title: "Yun Bot", Width: 960, Height: 720}

	windows := platformWindowOptionsFor(base, "windows")
	if windows.TitleBarStyle != mygo.TitleBarHidden || windows.TitleBarHeight != 40 {
		t.Fatalf("Windows title bar = %q/%d", windows.TitleBarStyle, windows.TitleBarHeight)
	}
	if !windows.AutoHideMenuBar {
		t.Fatal("Windows menu bar should auto-hide")
	}
	if windows.Vibrancy != mygo.VibrancyMica {
		t.Fatalf("Windows vibrancy = %q", windows.Vibrancy)
	}
	if windows.Title != base.Title || windows.Width != base.Width || windows.Height != base.Height {
		t.Fatal("Windows options changed common window fields")
	}

	darwin := platformWindowOptionsFor(base, "darwin")
	if darwin.TitleBarStyle != "" || darwin.AutoHideMenuBar || darwin.Vibrancy != mygo.VibrancyNone {
		t.Fatalf("macOS options changed: %+v", darwin)
	}
}

func TestPlatformTypography(t *testing.T) {
	if got := platformUIFont("windows"); got != "Segoe UI Variable Text" {
		t.Fatalf("Windows font = %q", got)
	}
	if got := platformUIFont("darwin"); got != "Avenir Next" {
		t.Fatalf("macOS font = %q", got)
	}
}

func TestWindowsThemeUsesDesktopPreferences(t *testing.T) {
	theme := *ui.LightTheme()
	theme.FontSize = 14
	accent := ui.Color{R: 230, G: 200, B: 90, A: 255}
	applyPlatformThemeFor(&theme, ui.Preferences{Accent: accent, HighContrast: true, TextScale: 1.25}, "windows")

	if theme.Font != "Segoe UI Variable Text" || theme.Accent != accent {
		t.Fatalf("Windows theme = font %q, accent %+v", theme.Font, theme.Accent)
	}
	if theme.FontSize != 17.5 {
		t.Fatalf("Windows text scale = %v", theme.FontSize)
	}
	if theme.AccentText != (ui.Color{R: 24, G: 24, B: 27, A: 255}) {
		t.Fatalf("Windows accent text = %+v", theme.AccentText)
	}

	branded := *ui.LightTheme()
	applyPlatformThemeFor(&branded, ui.Preferences{Accent: accent}, "linux")
	if branded.Accent != ui.LightTheme().Accent {
		t.Fatal("Linux theme unexpectedly adopted the system accent")
	}
}
