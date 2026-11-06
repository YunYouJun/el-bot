package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// The controller runs over private stdio; only its fixed JSON events reach commands.
type app struct {
	settings, draft                                  Settings
	settingsPath, page, note, logs                   string
	err                                              error
	status                                           Status
	pending, localExpanded, preferencesLoaded        bool
	preferences                                      Preferences
	personas                                         *PersonaResult
	personaSelection, localePreference, confirmation string
	publish                                          func([]byte)
	dispatch                                         func(func())
}

func (a *app) invalidate() {
	if a.publish != nil {
		a.publish(a.nativeSnapshot())
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
	go func() {
		apply, err := work()
		a.dispatch(func() {
			a.pending = false
			a.err = err
			if err == nil && apply != nil {
				apply()
			}
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
		a.confirmation = op
		a.invalidate()
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
	a.invalidate()
}

func main() {
	home, _ := os.UserHomeDir()
	path := flag.String("settings", filepath.Join(home, ".el-bot/client.json"), "Client settings file")
	check := flag.Bool("check", false, "Read local bot status without opening a window")
	flag.Parse()
	settings, err := loadSettings(*path, home)
	if *check {
		if err != nil {
			log.Fatal(err)
		}
		data, err := invoke(settings, "status")
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println(string(data))
		return
	}
	actions := make(chan func(), 64)
	a := &app{settings: settings, draft: settings, settingsPath: *path, page: "quickActions", err: err,
		personaSelection: "default", preferences: Preferences{"markdown", "light"}}
	a.dispatch = func(apply func()) { actions <- apply }
	a.publish = func(data []byte) { _, _ = os.Stdout.Write(append(data, '\n')) }
	a.applyLocalePreference()
	a.invalidate()
	done := make(chan struct{})
	go func() {
		defer close(done)
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 4096), 16385)
		for scanner.Scan() {
			data := append([]byte(nil), scanner.Bytes()...)
			actions <- func() { a.handleNativeEvent(data) }
		}
	}()
	for {
		select {
		case apply := <-actions:
			apply()
		case <-done:
			return
		}
	}
}
