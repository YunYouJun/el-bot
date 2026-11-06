// Prototype: native client; bot behavior stays in the TypeScript CLI.
package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

//go:embed resources/avatar.webp resources/tray.png
var assets embed.FS
var processStarted = time.Now()
var windowOpened bool

type app struct {
	menu                                                              *mygo.Menu
	win                                                               *mygo.Window
	tray                                                              *mygo.Tray
	settings                                                          Settings
	settingsPath, page, message, logs, inputProbe, format, imageTheme string
	status                                                            Status
	pending                                                           bool
	preferencesLoaded                                                 bool
	avatar                                                            *ui.Bitmap
}

func (a *app) command(op string, extra ...string) {
	if a.pending {
		return
	}
	a.pending = true
	s := a.settings
	if a.win != nil {
		a.win.Invalidate()
	}
	go func() {
		data, err := invoke(s, op, extra...)
		mygo.RunOnMain(func() {
			a.pending = false
			if err != nil {
				a.message = err.Error()
			} else {
				a.message = ""
				switch op {
				case "logs":
					var v struct {
						Text string `json:"text"`
					}
					_ = json.Unmarshal(data, &v)
					a.logs = v.Text
				case "preferences":
					var v struct {
						MessageFormat string `json:"messageFormat"`
						ImageTheme    string `json:"imageTheme"`
					}
					if json.Unmarshal(data, &v) == nil && v.MessageFormat != "" && v.ImageTheme != "" {
						a.format, a.imageTheme, a.preferencesLoaded = v.MessageFormat, v.ImageTheme, true
					}
					a.message = "已读取或保存 TypeScript 核心的回复设置。"
				default:
					_ = json.Unmarshal(data, &a.status)
				}
			}
			if a.win != nil {
				a.win.Invalidate()
			}
		})
	}()
}

func (a *app) action(op string) {
	if a.pending {
		return
	}
	if (op == "start" && a.status.Phase != "stopped") || (op == "restart" && a.status.Phase != "running") || (op == "stop" && a.status.Phase != "running" && a.status.Phase != "starting") {
		a.message = "当前状态不允许此操作，请先刷新状态。"
		return
	}
	if a.status.Busy && (op == "stop" || op == "restart") {
		r, err := mygo.Dialog.Message(mygo.MessageOptions{Parent: a.win, Type: mygo.MessageWarning, Message: "仍有任务正在执行", Detail: "中断会保留已产生的修改。", Buttons: []string{"继续运行", "中断并操作"}, DefaultButton: 0, CancelButton: 0})
		if err == nil && r.Button == 1 {
			a.command(op, "--interrupt")
		}
		return
	}
	a.command(op)
}

func recordReady(kind string, elapsed time.Duration) {
	const dir = "/tmp/el-bot-prototype-bench"
	if _, err := os.Stat(filepath.Join(dir, "enabled")); err != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(dir, "mygo.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	_ = json.NewEncoder(f).Encode(map[string]any{"kind": kind, "pid": os.Getpid(), "readyMs": float64(elapsed.Microseconds()) / 1000, "at": time.Now().UnixMilli()})
}

func (a *app) show(page string) {
	a.page = page
	mygo.App.SetActivationPolicy(mygo.ActivationPolicyRegular)
	if a.win != nil {
		a.win.Show()
		a.win.Focus()
		a.win.Invalidate()
		return
	}
	requested := time.Now()
	kind := "reopen"
	if !windowOpened {
		requested = processStarted
		kind = "startup"
		windowOpened = true
	}
	a.win = mygo.NewWindow(mygo.WindowOptions{Title: "el-bot · MyGo 原型", Width: 940, Height: 690, MinWidth: 720, MinHeight: 550, Hidden: true, Content: ui.View(a.view)})
	w := a.win
	w.OnReadyToShow(func() { w.Show(); w.Focus(); recordReady(kind, time.Since(requested)) })
	w.OnClosed(func() { a.win = nil; runtime.GC(); mygo.App.SetActivationPolicy(mygo.ActivationPolicyAccessory) })
	a.command("status")
}

func (a *app) ready() {
	a.show("runtime")
	icon, _ := assets.ReadFile("resources/tray.png")
	var err error
	a.tray, err = mygo.NewTray(mygo.TrayOptions{Icon: icon, IconIsTemplate: runtime.GOOS == "darwin", ToolTip: "el-bot · MyGo 原型"})
	if err != nil {
		a.message = err.Error()
		return
	}
	a.menu = mygo.NewMenu([]*mygo.MenuItem{
		{Label: "el-bot · MyGo 原型"}, mygo.Separator(),
		{Label: "打开机器人", Click: func(*mygo.MenuItem, *mygo.Window) { a.show("runtime") }},
		{Label: "运行日志", Click: func(*mygo.MenuItem, *mygo.Window) { a.show("logs") }},
		{Label: "连接设置", Click: func(*mygo.MenuItem, *mygo.Window) { a.show("settings") }}, mygo.Separator(),
		{Label: "启动机器人", Click: func(*mygo.MenuItem, *mygo.Window) { a.show("runtime"); a.action("start") }},
		{Label: "停止机器人…", Click: func(*mygo.MenuItem, *mygo.Window) { a.show("runtime"); a.action("stop") }},
		{Label: "重启机器人…", Click: func(*mygo.MenuItem, *mygo.Window) { a.show("runtime"); a.action("restart") }}, mygo.Separator(),
		{Label: "退出原型（机器人继续运行）", Click: func(*mygo.MenuItem, *mygo.Window) { mygo.App.Quit() }},
	})
	a.tray.SetMenu(a.menu)
	a.tray.OnClick(func() { a.tray.PopUpMenu() })
	mygo.App.OnWillQuit(func(*mygo.QuitEvent) { a.tray.Destroy() })
}

func main() {
	home, _ := os.UserHomeDir()
	settingsPath := flag.String("settings", filepath.Join(home, ".el-bot/mygo-prototype-client.json"), "Independent prototype settings")
	check := flag.Bool("check", false, "Read status through the TypeScript CLI without opening a window")
	operation := flag.String("check-operation", "status", "Read-only check: status, logs or preferences")
	flag.Parse()
	a := &app{settingsPath: *settingsPath, page: "runtime", format: "markdown", imageTheme: "light", settings: defaultSettings(home)}
	if data, err := os.ReadFile(*settingsPath); err == nil {
		if err = json.Unmarshal(data, &a.settings); err != nil {
			log.Fatal(err)
		}
	}
	if *check {
		if *operation != "status" && *operation != "logs" && *operation != "preferences" {
			log.Fatal("Only read-only operations are allowed with --check")
		}
		data, err := invoke(a.settings, *operation)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println(string(data))
		return
	}
	data, _ := assets.ReadFile("resources/avatar.webp")
	a.avatar, _ = ui.DecodeBitmap(data)
	mygo.App.SetName("el-bot MyGo Prototype")
	if !mygo.App.RequestSingleInstanceLock() {
		return
	}
	mygo.App.OnSecondInstance(func([]string, string) { a.show("runtime") })
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
