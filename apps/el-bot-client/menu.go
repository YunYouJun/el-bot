package main

import "github.com/egoist/mygo"

func (a *app) menuAction(key string, action func()) *mygo.MenuItem {
	return &mygo.MenuItem{Label: t(key), Disabled: a.pending, Click: func(*mygo.MenuItem, *mygo.Window) { action() }}
}
func (a *app) languageMenu() []*mygo.MenuItem {
	items := []*mygo.MenuItem{}
	for _, language := range []struct{ tag, label string }{{"zh-Hans", "简体中文"}, {"en", "English"}} {
		items = append(items, &mygo.MenuItem{Label: language.label, Type: mygo.MenuItemRadio, Checked: mygo.App.Locale() == language.tag, Click: func(*mygo.MenuItem, *mygo.Window) { mygo.App.SetLocale(language.tag) }})
	}
	items = append(items, mygo.Separator(), &mygo.MenuItem{Label: t("followSystem"), Click: func(*mygo.MenuItem, *mygo.Window) { mygo.App.SetLocale("") }})
	return items
}
func (a *app) updateMenus() {
	show := a.menuAction("showWindow", func() { a.show("quickActions") })
	show.Accelerator = "CmdOrCtrl+Shift+B"
	cloud := a.menuAction("openCloud", func() { a.launchCloud(false) })
	cloud.Disabled = a.pending || a.settings.Cloud.SSHHost == ""
	settings := a.menuAction("settings", func() { a.show("settings") })
	settings.Accelerator = "CmdOrCtrl+,"
	quit := &mygo.MenuItem{Role: mygo.RoleQuit, Label: t("quit")}
	items := []*mygo.MenuItem{{Label: t("appName"), Disabled: true}, mygo.Separator(), show, cloud, a.menuAction("personas", func() { a.show("personas"); a.readPersonas("list", "", "") }), settings, mygo.Separator()}
	for _, name := range []string{"codex", "qq", "codebuddy", "dsh"} {
		key := map[string]string{"codex": "openCodex", "qq": "openQq", "codebuddy": "openCodebuddy", "dsh": "openDsh"}[name]
		items = append(items, a.menuAction(key, func() { a.launchProgram(name) }))
	}
	local := []*mygo.MenuItem{{Label: phaseLabel(a.status.Phase), Disabled: true}, a.menuAction("refresh", func() { a.command("status") })}
	for _, op := range []string{"start", "stop", "restart"} {
		item := a.menuAction(op, func() { a.show("quickActions"); a.localExpanded = true; a.action(op) })
		item.Disabled = a.pending || (op == "start" && a.status.Phase != "stopped") || (op == "stop" && a.status.Phase != "running" && a.status.Phase != "starting") || (op == "restart" && a.status.Phase != "running")
		local = append(local, item)
	}
	items = append(items, mygo.Separator(), &mygo.MenuItem{Label: t("localBot"), Submenu: local}, &mygo.MenuItem{Label: t("language"), Submenu: a.languageMenu()}, mygo.Separator(), quit)
	a.menu = mygo.NewMenu(items)
	if a.tray != nil {
		a.tray.SetMenu(a.menu)
	}
	// Each native menu owns its items; never reuse tray items in the menu bar.
	show = a.menuAction("showWindow", func() { a.show("quickActions") })
	show.Accelerator = "CmdOrCtrl+Shift+B"
	cloud = a.menuAction("openCloud", func() { a.launchCloud(false) })
	cloud.Disabled = a.pending || a.settings.Cloud.SSHHost == ""
	settings = a.menuAction("settings", func() { a.show("settings") })
	settings.Accelerator = "CmdOrCtrl+,"
	quit = &mygo.MenuItem{Role: mygo.RoleQuit, Label: t("quit")}
	mygo.App.SetMenu(mygo.NewMenu([]*mygo.MenuItem{
		{Label: t("appName"), Submenu: []*mygo.MenuItem{{Role: mygo.RoleAbout}, mygo.Separator(), settings, mygo.Separator(), {Role: mygo.RoleHide}, {Role: mygo.RoleHideOthers}, {Role: mygo.RoleUnhide}, mygo.Separator(), quit}},
		{Role: mygo.RoleEditMenu, Label: t("editMenu")},
		{Label: t("viewMenu"), Submenu: []*mygo.MenuItem{show, cloud, {Label: t("language"), Submenu: a.languageMenu()}}},
		{Role: mygo.RoleWindowMenu, Label: t("windowMenu")},
	}))
}
