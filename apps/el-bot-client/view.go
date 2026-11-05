package main

import (
	"strings"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

func clientTheme(dark bool) *ui.Theme {
	var theme ui.Theme
	if dark {
		theme = *ui.DarkTheme()
		theme.Background = ui.Hex("#111b28")
		theme.Surface = ui.Hex("#1b2939")
		theme.Border = ui.Hex("#34485f")
		theme.Text = ui.Hex("#edf4fc")
		theme.TextMuted = ui.Hex("#a2b5ca")
		theme.Accent = ui.Hex("#9dc6fa")
		theme.AccentText = ui.Hex("#14243a")
	} else {
		theme = *ui.LightTheme()
		theme.Background = ui.Hex("#ffffff")
		theme.Surface = ui.Hex("#f3f7fc")
		theme.Border = ui.Hex("#d6e2f0")
		theme.Text = ui.Hex("#21334c")
		theme.TextMuted = ui.Hex("#61758e")
		theme.Accent = ui.Hex("#356eaf")
		theme.AccentText = ui.Hex("#ffffff")
	}
	theme.Radius = 12
	theme.FontSize = 14
	theme.Font = "Avenir Next"
	theme.Focus = theme.Accent
	return &theme
}
func card(c *ui.Context, draw func()) {
	theme := c.Theme()
	ui.Column(c).FillWidth().Shrink(0).Padding(22).Gap(14).Background(theme.Surface).Radius(16).Border(1, theme.Border).Children(draw)
}
func textOr(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
func phaseLabel(value string) string {
	switch value {
	case "stopped", "starting", "running", "stopping", "unmanaged":
		return t(value)
	}
	return t("waiting")
}
func connectionLabel(value string) string {
	switch value {
	case "connected", "connecting", "disconnected", "webhook":
		return t(value)
	}
	return t("waiting")
}
func (a *app) navigate(page string) {
	a.page = page
	a.err = nil
	a.note = ""
	if page == "personas" && a.settings.Cloud.SSHHost != "" {
		a.readPersonas("list", "", "")
	}
}

func (a *app) view(c *ui.Context) {
	c.SetTheme(clientTheme(c.Theme().Dark))
	theme := c.Theme()
	ui.Row(c).Fill().Background(theme.Background).Children(func() {
		ui.Column(c).Width(210).Shrink(0).FillHeight().Padding(22, 16).Gap(12).Background(theme.Surface).Children(func() {
			ui.Row(c).AlignItems(ui.Center).Gap(10).Margin(6, 0, 26, 0).Children(func() {
				if a.avatar != nil {
					ui.Image(c, a.avatar).Size(40, 40).Radius(12).Label(t("appName"))
				}
				ui.Column(c).Gap(4).Children(func() {
					ui.Text(c, t("appName")).FontSize(23).Bold()
					ui.Text(c, t("caption")).FontSize(11).TextColor(theme.TextMuted)
				})
			})
			for _, page := range []string{"quickActions", "personas", "settings"} {
				button := ui.Button(c.Key(page), t(page)).FillWidth().Height(44)
				if a.page == page {
					button.Background(theme.Accent).TextColor(theme.AccentText)
				}
				if button.Clicked() {
					a.navigate(page)
				}
			}
			ui.Spacer(c)
			ui.Text(c, t("language")).FontSize(11).TextColor(theme.TextMuted)
			ui.Row(c).Gap(8).Children(func() {
				if ui.Button(c, "简体中文").Clicked() {
					mygo.App.SetLocale("zh-Hans")
				}
				if ui.Button(c, "English").Clicked() {
					mygo.App.SetLocale("en")
				}
			})
			if ui.Button(c, t("trayMenu")).FillWidth().Clicked() && a.menu != nil {
				a.menu.PopupAt(a.win, 20, 440)
			}
			ui.Text(c, t("closeHint")).FontSize(11).TextColor(theme.TextMuted).FillWidth()
		})
		ui.Box(c).Width(1).Background(theme.Border)
		ui.Scroll(c).Grow(1).MinWidth(0).Children(func() {
			ui.Column(c).FillWidth().Shrink(0).Padding(28).Gap(20).Children(func() {
				ui.Text(c, t(a.page)).FontSize(27).Bold()
				description := map[string]string{"quickActions": "homeDescription", "personas": "personasDescription", "settings": "settingsDescription"}[a.page]
				ui.Text(c, t(description)).FontSize(13).TextColor(theme.TextMuted)
				if a.err != nil {
					ui.Text(c, errorText(a.err)).FontSize(12).Selectable().FillWidth().TextColor(theme.Danger)
				}
				if a.note != "" {
					ui.Text(c, t(a.note)).FontSize(12).TextColor(theme.Success)
				}
				if a.pending {
					ui.Text(c, t("pending")).FontSize(12).TextColor(theme.TextMuted)
				}
				switch a.page {
				case "quickActions":
					a.homeView(c)
				case "personas":
					a.personasView(c)
				case "settings":
					a.settingsView(c)
				}
			})
		})
	})
}
func (a *app) homeView(c *ui.Context) {
	theme := c.Theme()
	card(c, func() {
		ui.Text(c, t("cloud")).FontSize(19).Bold()
		ui.Text(c, t("cloudDescription")).FontSize(13).FillWidth().TextColor(theme.TextMuted)
		ui.Row(c).Gap(10).Children(func() {
			if ui.PrimaryButton(c, t("openCloud")).Disabled(a.pending || a.settings.Cloud.SSHHost == "").Clicked() {
				a.launchCloud(false)
			}
			if ui.Button(c, t("configureCloud")).Clicked() {
				a.navigate("settings")
			}
		})
		if a.settings.Cloud.SSHHost != "" {
			ui.Text(c, a.settings.Cloud.SSHHost).FontSize(12).TextColor(theme.TextMuted)
		}
	})
	card(c, func() {
		ui.Text(c, t("programs")).FontSize(17).Bold()
		ui.Row(c).Gap(10).Wrap().Children(func() {
			for _, program := range []struct{ name, key string }{{"codex", "openCodex"}, {"qq", "openQq"}, {"codebuddy", "openCodebuddy"}, {"dsh", "openDsh"}} {
				if ui.Button(c, t(program.key)).Disabled(a.pending).Clicked() {
					a.launchProgram(program.name)
				}
			}
		})
	})
	key := "expandLocal"
	if a.localExpanded {
		key = "collapseLocal"
	}
	if ui.Button(c, t(key)).Clicked() {
		a.localExpanded = !a.localExpanded
		if a.localExpanded {
			a.command("status")
		}
	}
	if a.localExpanded {
		a.localView(c)
	}
}
func (a *app) localView(c *ui.Context) {
	card(c, func() {
		ui.Row(c).AlignItems(ui.Center).Children(func() {
			ui.Text(c, t("localBot")).FontSize(17).Bold().Grow(1)
			if ui.Button(c, t("refresh")).Disabled(a.pending).Clicked() {
				a.command("status")
			}
		})
		ui.Text(c, phaseLabel(a.status.Phase)).TextColor(c.Theme().TextMuted)
		ui.Text(c, "QQ · "+connectionLabel(a.status.QQ))
		ui.Text(c, textOr(a.status.Agent, "Codex")+" · "+connectionLabel(a.status.Codex))
		if a.status.Task != nil {
			ui.Text(c, t("task")+" · "+a.status.Task.ID+" · "+a.status.Task.Status).Selectable()
		}
		ui.Row(c).Gap(10).Children(func() {
			if ui.PrimaryButton(c, t("start")).Disabled(a.pending || a.status.Phase != "stopped").Clicked() {
				a.action("start")
			}
			if ui.Button(c, t("stop")).Disabled(a.pending || (a.status.Phase != "running" && a.status.Phase != "starting")).Clicked() {
				a.action("stop")
			}
			if ui.Button(c, t("restart")).Disabled(a.pending || a.status.Phase != "running").Clicked() {
				a.action("restart")
			}
		})
	})
}
func (a *app) field(c *ui.Context, key string, value *string, picker bool) {
	ui.Column(c.Key(key)).Gap(6).FillWidth().Children(func() {
		ui.Text(c, t(key)).FontSize(12).TextColor(c.Theme().TextMuted)
		ui.Row(c).Gap(8).Children(func() {
			ui.TextInput(c, value).Label(t(key)).Grow(1).MinWidth(0)
			if picker && ui.Button(c, t("choose")).Clicked() {
				parent := a.win
				go func() {
					paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: parent, Title: t(key)})
					mygo.RunOnMain(func() {
						if err == nil && len(paths) > 0 {
							*value = paths[0]
							a.invalidate()
						}
					})
				}()
			}
		})
	})
}
func (a *app) settingsView(c *ui.Context) {
	card(c, func() {
		ui.Text(c, t("cloud")).FontSize(18).Bold()
		a.field(c, "sshHost", &a.draft.Cloud.SSHHost, false)
		ui.Text(c, t("cloudHint")).FontSize(12).FillWidth().TextColor(c.Theme().TextMuted)
		if ui.PrimaryButton(c, t("saveCloud")).Disabled(a.pending).Clicked() {
			a.save(true)
		}
	})
	card(c, func() {
		ui.Text(c, t("environment")).FontSize(18).Bold()
		ui.Text(c, t("savedPathsHint")).FontSize(12).FillWidth().TextColor(c.Theme().TextMuted)
		for _, field := range []struct {
			key   string
			value *string
		}{{"nodePath", &a.draft.NodePath}, {"cliPath", &a.draft.CLIPath}, {"configPath", &a.draft.ConfigPath}, {"credentialsPath", &a.draft.CredentialsPath}, {"statePath", &a.draft.StatePath}, {"codexAppPath", &a.draft.CodexAppPath}, {"codebuddyAppPath", &a.draft.CodebuddyAppPath}, {"dshAppPath", &a.draft.DshAppPath}, {"qqAppPath", &a.draft.QqAppPath}} {
			a.field(c, field.key, field.value, true)
		}
		if ui.PrimaryButton(c, t("saveSettings")).Disabled(a.pending).Clicked() {
			a.save(false)
		}
	})
	card(c, func() {
		ui.Text(c, t("preferences")).FontSize(18).Bold()
		if ui.Button(c, t("readPreferences")).Disabled(a.pending).Clicked() {
			a.command("preferences")
		}
		ui.Row(c).Gap(10).Wrap().Children(func() {
			for _, value := range []string{"image", "markdown", "text"} {
				ui.Radio(c, &a.preferences.MessageFormat, value, t(value))
			}
		})
		ui.Row(c).Gap(10).Children(func() {
			for _, value := range []string{"light", "dark"} {
				ui.Radio(c, &a.preferences.ImageTheme, value, t(value))
			}
		})
		if ui.Button(c, t("savePreferences")).Disabled(a.pending || !a.preferencesLoaded).Clicked() {
			a.command("preferences", "--message-format", a.preferences.MessageFormat, "--image-theme", a.preferences.ImageTheme)
		}
	})
	card(c, func() {
		ui.Text(c, t("logs")).FontSize(18).Bold()
		if ui.Button(c, t("refreshLogs")).Disabled(a.pending).Clicked() {
			a.command("logs")
		}
		ui.Text(c, textOr(a.logs, t("noLogs"))).Font("monospace").FontSize(12).Selectable().FillWidth()
	})
}

func (a *app) personasView(c *ui.Context) {
	card(c, func() {
		ui.Text(c, t("currentPersona")).FontSize(19).Bold()
		name, description := t("defaultPersona"), t("defaultDescription")
		if a.personas != nil {
			if active := a.personas.Library.Active; active != nil {
				for _, card := range a.personas.Library.Cards {
					if card.Metadata.ID == active.ID {
						for _, revision := range card.Revisions {
							if revision.Hash == active.Hash {
								name = revision.Metadata.Name
								description = revision.Metadata.Description
							}
						}
					}
				}
			}
			ui.Text(c, name).FontSize(22).Bold()
			ui.Text(c, description).FillWidth().TextColor(c.Theme().TextMuted)
			selection := ui.SelectBase(c, &a.personaSelection)
			selection.Trigger.Disabled(a.pending).Label(t("currentPersona")).Padding(12).Border(1, c.Theme().Border).Radius(10).FillWidth().Children(func() { ui.Text(c, name) })
			selection.Popup(func(panel ui.Element) {
				panel.Padding(6).Background(c.Theme().Surface).Radius(10)
				selection.Item("default").Padding(10).Children(func() { ui.Text(c, t("defaultPersona")) })
				for _, card := range a.personas.Library.Cards {
					selection.Item(card.Metadata.ID + ":" + card.Hash).Padding(10).Children(func() { ui.Text(c, card.Metadata.Name) })
				}
			})
			if selection.Trigger.Changed() && !a.pending {
				if a.personaSelection == "default" {
					a.readPersonas("disable", "", "")
				} else {
					parts := strings.SplitN(a.personaSelection, ":", 2)
					if len(parts) == 2 {
						a.readPersonas("use", parts[0], parts[1])
					}
				}
			}
		} else {
			ui.Text(c, t("noPersonas")).FillWidth().TextColor(c.Theme().TextMuted)
		}
		ui.Text(c, t("personaHint")).FontSize(12).FillWidth().TextColor(c.Theme().TextMuted)
		ui.Row(c).Gap(10).Children(func() {
			if ui.Button(c, t("refreshPersona")).Disabled(a.pending || a.settings.Cloud.SSHHost == "").Clicked() {
				a.readPersonas("list", "", "")
			}
			if ui.PrimaryButton(c, t("managePersonas")).Disabled(a.pending || a.settings.Cloud.SSHHost == "").Clicked() {
				a.launchCloud(true)
			}
		})
	})
}
