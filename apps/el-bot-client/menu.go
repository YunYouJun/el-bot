package main

import (
	"runtime"

	"github.com/egoist/mygo"
)

func (a *app) menuAction(key string, action func()) *mygo.MenuItem {
	return &mygo.MenuItem{Label: t(key), Disabled: a.pending, Click: func(*mygo.MenuItem, *mygo.Window) { action() }}
}
func (a *app) languageMenu() []*mygo.MenuItem {
	choices := languageChoices()
	items := make([]*mygo.MenuItem, 0, len(choices)+1)
	for index, language := range choices {
		if index == 1 {
			items = append(items, mygo.Separator())
		}
		items = append(items, &mygo.MenuItem{Label: language.Name, Type: mygo.MenuItemRadio, Checked: a.localePreference == language.Tag, Click: func(*mygo.MenuItem, *mygo.Window) { a.setLocale(language.Tag) }})
	}
	return items
}

func (a *app) showWindowItem() *mygo.MenuItem {
	item := a.menuAction("showWindow", func() { a.show("quickActions") })
	item.Accelerator = "CmdOrCtrl+Shift+B"
	return item
}

func (a *app) openCloudItem() *mygo.MenuItem {
	item := a.menuAction("openCloud", func() { a.launchCloud(false) })
	item.Disabled = a.pending || a.settings.Cloud.SSHHost == ""
	return item
}

func (a *app) settingsItem() *mygo.MenuItem {
	item := a.menuAction("settings", func() { a.show("settings") })
	item.Accelerator = "CmdOrCtrl+,"
	return item
}

func (a *app) quitItem() *mygo.MenuItem {
	return &mygo.MenuItem{Role: mygo.RoleQuit, Label: t("quit")}
}

func (a *app) localMenu() []*mygo.MenuItem {
	refresh := a.menuAction("refresh", func() { a.command("status") })
	if runtime.GOOS == "windows" {
		refresh.Accelerator = "F5"
	}
	items := []*mygo.MenuItem{{Label: phaseLabel(a.status.Phase), Disabled: true}, refresh}
	for _, op := range []string{"start", "stop", "restart"} {
		item := a.menuAction(op, func() { a.show("quickActions"); a.localExpanded = true; a.action(op) })
		item.Disabled = a.pending || (op == "start" && a.status.Phase != "stopped") || (op == "stop" && a.status.Phase != "running" && a.status.Phase != "starting") || (op == "restart" && a.status.Phase != "running")
		items = append(items, item)
	}
	return items
}

func (a *app) programMenuItems() []*mygo.MenuItem {
	items := make([]*mygo.MenuItem, 0, len(programEntries))
	for _, program := range programEntries {
		items = append(items, a.menuAction(program.ActionKey, func() { a.launchProgram(program.Name) }))
	}
	return items
}

func (a *app) updateMenus() {
	items := []*mygo.MenuItem{{Label: t("appName"), Disabled: true}, mygo.Separator(), a.showWindowItem(), a.openCloudItem(), a.menuAction("personas", func() { a.show("personas"); a.readPersonas("list", "", "") }), a.settingsItem(), mygo.Separator()}
	items = append(items, a.programMenuItems()...)
	items = append(items, mygo.Separator(), &mygo.MenuItem{Label: t("localBot"), Submenu: a.localMenu()}, &mygo.MenuItem{Label: t("language"), Submenu: a.languageMenu()}, mygo.Separator(), a.quitItem())
	a.menu = mygo.NewMenu(items)
	if a.tray != nil {
		a.tray.SetMenu(a.menu)
	}
	// Each native menu owns its items; never reuse tray items in the menu bar.
	mygo.App.SetMenu(mygo.NewMenu([]*mygo.MenuItem{
		{Label: t("appName"), Submenu: []*mygo.MenuItem{{Role: mygo.RoleAbout}, mygo.Separator(), a.settingsItem(), mygo.Separator(), {Role: mygo.RoleHide}, {Role: mygo.RoleHideOthers}, {Role: mygo.RoleUnhide}, mygo.Separator(), a.quitItem()}},
		{Role: mygo.RoleEditMenu, Label: t("editMenu")},
		{Label: t("viewMenu"), Submenu: []*mygo.MenuItem{a.showWindowItem(), a.openCloudItem(), {Label: t("language"), Submenu: a.languageMenu()}}},
		{Role: mygo.RoleWindowMenu, Label: t("windowMenu")},
	}))
}
