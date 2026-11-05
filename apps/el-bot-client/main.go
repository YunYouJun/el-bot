package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

//go:embed resources/avatar.webp resources/tray.png
var assets embed.FS

type app struct {
	win                                       *mygo.Window
	tray                                      *mygo.Tray
	menu                                      *mygo.Menu
	settings                                  Settings
	draft                                     Settings
	settingsPath, page, note, logs            string
	err                                       error
	status                                    Status
	pending, localExpanded, preferencesLoaded bool
	preferences                               Preferences
	personas                                  *PersonaResult
	personaSelection                          string
	avatar                                    *ui.Bitmap
}

func (a *app) invalidate() {
	if a.win != nil {
		a.win.Invalidate()
	}
}
func (a *app) background(work func() (func(), error)) {
	if a.pending {
		return
	}
	a.pending = true
	a.err = nil
	a.note = ""
	a.invalidate()
	a.updateMenus()
	go func() {
		apply, err := work()
		mygo.RunOnMain(func() {
			a.pending = false
			a.err = err
			if err == nil && apply != nil {
				apply()
			}
			a.updateMenus()
			a.invalidate()
		})
	}()
}

func (a *app) command(op string, extra ...string) {
	s := a.settings
	a.background(func() (func(), error) {
		data, err := invoke(s, op, extra...)
		if err != nil {
			return nil, err
		}
		switch op {
		case "logs":
			var v struct {
				Text string `json:"text"`
			}
			if json.Unmarshal(data, &v) != nil {
				return nil, clientError("errorResponse")
			}
			return func() { a.logs = v.Text }, nil
		case "preferences":
			var v Preferences
			if json.Unmarshal(data, &v) != nil || v.MessageFormat == "" || v.ImageTheme == "" {
				return nil, clientError("errorResponse")
			}
			return func() {
				a.preferences = v
				a.preferencesLoaded = true
				if len(extra) > 0 {
					a.note = "preferencesSaved"
				}
			}, nil
		default:
			var v Status
			if json.Unmarshal(data, &v) != nil {
				return nil, clientError("errorResponse")
			}
			return func() { a.status = v }, nil
		}
	})
}

func (a *app) action(op string) {
	if a.pending {
		return
	}
	if (op == "start" && a.status.Phase != "stopped") || (op == "restart" && a.status.Phase != "running") || (op == "stop" && a.status.Phase != "running" && a.status.Phase != "starting") {
		a.err = clientError("errorState")
		a.invalidate()
		return
	}
	if a.status.Busy && (op == "stop" || op == "restart") {
		parent := a.win
		go func() {
			result, err := mygo.Dialog.Message(mygo.MessageOptions{Parent: parent, Type: mygo.MessageWarning, Message: t("busyTitle"), Detail: t("busyDetail"), Buttons: []string{t("continue"), t("interrupt")}, DefaultButton: 0, CancelButton: 0})
			mygo.RunOnMain(func() {
				if err == nil && result.Button == 1 {
					a.command(op, "--interrupt")
				}
			})
		}()
		return
	}
	a.command(op)
}

func (a *app) launchProgram(name string) {
	s := a.settings
	a.background(func() (func(), error) { return func() { a.note = "opened" }, openProgram(s, name) })
}
func (a *app) launchCloud(personas bool) {
	s := a.settings.Cloud
	a.background(func() (func(), error) { return func() { a.note = "opened" }, openCloud(s, personas) })
}
func (a *app) readPersonas(operation, id, revision string) {
	s := a.settings.Cloud
	a.background(func() (func(), error) {
		result, err := cloudPersonas(s, operation, id, revision)
		return func() {
			a.personas = result
			a.personaSelection = "default"
			if active := result.Library.Active; active != nil {
				a.personaSelection = active.ID + ":" + active.Hash
			}
			if operation != "list" {
				a.note = "personaSaved"
			}
		}, err
	})
}

func (a *app) save(cloud bool) {
	s := a.draft
	if cloud {
		if err := s.Cloud.validate(); err != nil {
			a.err = err
			a.invalidate()
			return
		}
		s = a.settings
		s.Cloud = a.draft.Cloud
	} else {
		if err := s.validateLocal(); err != nil {
			a.err = err
			a.invalidate()
			return
		}
		s.Cloud = a.settings.Cloud
	}
	if err := saveSettings(a.settingsPath, s); err != nil {
		a.err = err
	} else {
		a.settings = s
		a.err = nil
		a.note = "settingsSaved"
	}
	a.updateMenus()
	a.invalidate()
}

func (a *app) show(page string) {
	a.page = page
	mygo.App.SetActivationPolicy(mygo.ActivationPolicyRegular)
	if a.win != nil {
		a.win.Show()
		a.win.Focus()
		a.invalidate()
		return
	}
	a.win = mygo.NewWindow(mygo.WindowOptions{Title: t("appName"), Width: 960, Height: 720, MinWidth: 780, MinHeight: 580, Hidden: true, Content: ui.View(a.view)})
	w := a.win
	w.OnReadyToShow(func() { w.Show(); w.Focus() })
	w.OnClosed(func() { a.win = nil; runtime.GC(); mygo.App.SetActivationPolicy(mygo.ActivationPolicyAccessory) })
}

func (a *app) ready() {
	mygo.App.SetName(t("appName"))
	icon, _ := assets.ReadFile("resources/tray.png")
	tray, err := mygo.NewTray(mygo.TrayOptions{ID: "yun-bot", Icon: icon, IconIsTemplate: runtime.GOOS == "darwin", ToolTip: t("appName")})
	if err != nil {
		a.err = err
	} else {
		a.tray = tray
		a.tray.OnClick(func() { a.tray.PopUpMenu() })
	}
	a.updateMenus()
	a.show("quickActions")
	mygo.App.OnLocaleChanged(func(string) {
		mygo.App.SetName(t("appName"))
		if a.win != nil {
			a.win.SetTitle(t("appName"))
		}
		if a.tray != nil {
			a.tray.SetToolTip(t("appName"))
		}
		a.updateMenus()
		a.invalidate()
	})
	mygo.App.OnWillQuit(func(*mygo.QuitEvent) {
		if a.tray != nil {
			a.tray.Destroy()
		}
	})
}

func main() {
	home, _ := os.UserHomeDir()
	path := flag.String("settings", filepath.Join(home, ".el-bot/client.json"), "Client settings file")
	check := flag.Bool("check", false, "Read the local bot status without opening a window")
	flag.Parse()
	s, err := loadSettings(*path, home)
	if *check {
		if err != nil {
			log.Fatal(err)
		}
		data, err := invoke(s, "status")
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println(string(data))
		return
	}
	a := &app{settings: s, draft: s, settingsPath: *path, page: "quickActions", err: err, personaSelection: "default", preferences: Preferences{"markdown", "light"}}
	data, _ := assets.ReadFile("resources/avatar.webp")
	a.avatar, _ = ui.DecodeBitmap(data)
	mygo.App.SetName("Yun Bot")
	if !mygo.App.RequestSingleInstanceLock() {
		return
	}
	mygo.App.OnSecondInstance(func([]string, string) { a.show(a.page) })
	mygo.App.OnActivate(func(visible bool) {
		if !visible {
			a.show(a.page)
		}
	})
	mygo.App.OnWindowAllClosed(func() {})
	mygo.App.WhenReady(a.ready)
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
