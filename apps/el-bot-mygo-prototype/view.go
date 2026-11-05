package main

import (
	"fmt"
	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// Maps Augma packages/core/src/tokens.css. Decorative animation stays off at idle.
func augmaTheme(dark bool) *ui.Theme {
	var t ui.Theme
	if dark {
		t = *ui.DarkTheme()
		t.Background = ui.Hex("#131e29")
		t.Surface = ui.Hex("#1b2936")
		t.Border = ui.Hex("#435a6e")
		t.Text = ui.Hex("#edf4fa")
		t.TextMuted = ui.Hex("#a0b6c9")
		t.Accent = ui.Hex("#f1a74c")
		t.AccentText = ui.Hex("#172331")
		t.Success = ui.Hex("#7cdaa0")
	} else {
		t = *ui.LightTheme()
		t.Background = ui.Hex("#ffffff")
		t.Surface = ui.Hex("#f3f6f8")
		t.Border = ui.Hex("#becdda")
		t.Text = ui.Hex("#263442")
		t.TextMuted = ui.Hex("#5c7187")
		t.Accent = ui.Hex("#b75e08")
		t.AccentText = ui.Hex("#ffffff")
		t.Success = ui.Hex("#287947")
	}
	t.Radius = 12
	t.FontSize = 14
	t.Font = "Avenir Next"
	t.Focus = t.Accent
	return &t
}
func card(c *ui.Context, fn func()) {
	t := c.Theme()
	ui.Column(c).FillWidth().Shrink(0).Padding(18).Gap(14).Background(t.Surface).Radius(16).Border(1, t.Border).Children(fn)
}
func textOr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
func phase(v string) string {
	return textOr(map[string]string{"stopped": "已停止", "starting": "正在启动", "running": "运行中", "stopping": "正在停止", "unmanaged": "暂不可管理"}[v], "等待连接")
}

func (a *app) view(c *ui.Context) {
	c.SetTheme(augmaTheme(c.Theme().Dark))
	t := c.Theme()
	ui.Row(c).Fill().Background(t.Background).Children(func() {
		ui.Column(c).Width(200).Shrink(0).FillHeight().Padding(20, 16).Gap(12).Background(t.Surface).Children(func() {
			ui.Row(c).AlignItems(ui.Center).Gap(10).Margin(6, 0, 22, 0).Children(func() {
				ui.Text(c, "◎").FontSize(36).TextColor(t.Accent)
				ui.Column(c).Gap(3).Children(func() {
					ui.Text(c, "el-bot").FontSize(22).Bold()
					ui.Text(c, "AUGMA / NATIVE").FontSize(10).TextColor(t.TextMuted)
				})
			})
			for _, p := range []struct{ key, label string }{{"runtime", "机器人"}, {"logs", "运行日志"}, {"settings", "连接设置"}} {
				button := ui.Button(c.Key(p.key), p.label).FillWidth().Height(44)
				if a.page == p.key {
					button.Background(t.Accent).TextColor(t.AccentText)
				}
				if button.Clicked() {
					a.page = p.key
					if p.key == "logs" {
						a.command("logs")
					}
				}
			}
			ui.Spacer(c)
			if ui.Button(c, "托盘操作").FillWidth().Clicked() && a.menu != nil {
				a.menu.PopupAt(a.win, 20, 470)
			}
			ui.Text(c, "MYGO 原型 · v0.1").FontSize(10).TextColor(t.TextMuted)
			ui.Text(c, "关窗释放界面，托盘继续运行").FontSize(11).TextColor(t.TextMuted)
		})
		ui.Box(c).Width(1).Background(t.Border)
		ui.Scroll(c).Grow(1).MinWidth(0).Children(func() {
			ui.Column(c).FillWidth().Shrink(0).Padding(24).Gap(18).Children(func() {
				title := map[string]string{"runtime": "机器人", "logs": "运行日志", "settings": "连接设置"}[a.page]
				ui.Row(c).AlignItems(ui.Center).Gap(12).Children(func() {
					ui.Column(c).Grow(1).Gap(4).Children(func() {
						ui.Text(c, title).FontSize(26).Bold()
						ui.Text(c, "通过 QQ 连接你的本机 AI 助手").FontSize(12).TextColor(t.TextMuted)
					})
					if ui.Button(c, "刷新状态").Disabled(a.pending).Clicked() {
						a.command("status")
					}
				})
				if a.message != "" {
					ui.Text(c, a.message).FontSize(12).Padding(12).FillWidth().Background(t.Surface).Radius(10).Selectable()
				}
				switch a.page {
				case "runtime":
					a.runtimeView(c)
				case "logs":
					a.logsView(c)
				case "settings":
					a.settingsView(c)
				}
			})
		})
	})
}
func (a *app) runtimeView(c *ui.Context) {
	t := c.Theme()
	card(c, func() {
		ui.Row(c).AlignItems(ui.Center).Gap(12).Children(func() {
			if a.avatar != nil {
				ui.Image(c, a.avatar).Size(54, 54).Radius(27).Label("el-bot 头像")
			}
			ui.Column(c).Grow(1).Gap(4).Children(func() {
				ui.Text(c, "el-bot").FontSize(21).Bold()
				ui.Text(c, textOr(a.status.Project, "通过 QQ 私聊使用本机 AI 助手")).FontSize(12).TextColor(t.TextMuted)
			})
			statusColor := t.TextMuted
			if a.status.Phase == "running" {
				statusColor = t.Success
			}
			ui.Text(c, "● "+phase(a.status.Phase)).FontSize(12).TextColor(statusColor)
		})
		ui.Divider(c)
		ui.Row(c).Gap(18).Children(func() {
			ui.Text(c, "QQ 连接  ·  "+textOr(a.status.QQ, "未验证")).Grow(1)
			ui.Text(c, textOr(a.status.Agent, "Codex")+"  ·  "+textOr(a.status.Codex, "未验证")).Grow(1)
		})
		ui.Text(c, "当前任务").Bold()
		task := "连接后显示任务状态。"
		if a.status.Task != nil {
			task = a.status.Task.ID + " · " + a.status.Task.Status
		}
		ui.Text(c, task).TextColor(t.TextMuted).Selectable()
		ui.Row(c).Gap(10).Children(func() {
			if ui.PrimaryButton(c, "启动机器人").Disabled(a.pending || a.status.Phase != "stopped").Clicked() {
				a.action("start")
			}
			if ui.Button(c, "停止").Disabled(a.pending || (a.status.Phase != "running" && a.status.Phase != "starting")).Clicked() {
				a.action("stop")
			}
			if ui.Button(c, "重启").Disabled(a.pending || a.status.Phase != "running").Clicked() {
				a.action("restart")
			}
		})
	})
	ui.Text(c, "关闭窗口后保留托盘；退出客户端不会停止机器人。").FontSize(11).TextColor(t.TextMuted)
	card(c, func() {
		ui.Text(c, "本机程序").Bold()
		ui.Row(c).Gap(8).Wrap().Children(func() {
			for _, name := range []string{"Codex", "QQ", "CodeBuddy", "DSH"} {
				if ui.Button(c, "打开 "+name).Clicked() {
					a.message = openProgram(name)
				}
			}
		})
	})
}
func (a *app) logsView(c *ui.Context) {
	card(c, func() {
		ui.Row(c).AlignItems(ui.Center).Children(func() {
			ui.Text(c, "最近记录").Bold().Grow(1)
			if ui.Button(c, "刷新日志").Disabled(a.pending).Clicked() {
				a.command("logs")
			}
		})
		ui.Text(c, textOr(a.logs, "暂无日志。点击刷新后读取 TypeScript 核心的最近日志。")).Font("monospace").FontSize(12).Selectable().FillWidth()
	})
}
func (a *app) field(c *ui.Context, label string, value *string) {
	ui.Column(c.Key(label)).Gap(6).FillWidth().Children(func() {
		ui.Text(c, label).FontSize(12).TextColor(c.Theme().TextMuted)
		ui.Row(c).Gap(8).Children(func() {
			ui.TextInput(c, value).Label(label).Grow(1).MinWidth(0)
			if ui.Button(c, "选择").Clicked() {
				paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: a.win, Title: label})
				if err == nil && len(paths) > 0 {
					*value = paths[0]
				}
			}
		})
	})
}
func (a *app) settingsView(c *ui.Context) {
	card(c.Key("input-check"), func() {
		ui.Text(c, "中文输入验证").Bold()
		ui.TextInput(c, &a.inputProbe).Label("中文输入验证").Placeholder("使用拼音输入法输入中文、标点与 emoji").FillWidth()
		ui.Text(c, fmt.Sprintf("当前输入：%s", a.inputProbe)).FontSize(12).Selectable()
	})
	card(c, func() {
		ui.Text(c, "运行环境").FontSize(17).Bold()
		for _, f := range []struct {
			label string
			value *string
		}{{"Node 可执行文件", &a.settings.NodePath}, {"el-bot CLI 文件", &a.settings.CLIPath}, {"机器人配置", &a.settings.ConfigPath}, {"凭据文件", &a.settings.CredentialsPath}, {"会话状态文件", &a.settings.StatePath}} {
			a.field(c, f.label, f.value)
		}
		if ui.PrimaryButton(c, "保存原型设置并检查").Disabled(a.pending).Clicked() {
			a.saveSettings()
		}
	})
	card(c, func() {
		ui.Text(c, "QQ 回复展示").FontSize(17).Bold()
		ui.Text(c, "复用现有 preferences 命令，保存后下次启动生效。").FontSize(12).TextColor(c.Theme().TextMuted)
		if ui.Button(c, "读取展示设置").Disabled(a.pending).Clicked() {
			a.command("preferences")
		}
		ui.Row(c).Gap(10).Children(func() {
			for _, v := range []string{"image", "markdown", "text"} {
				ui.Radio(c, &a.format, v, map[string]string{"image": "图片卡片", "markdown": "Markdown", "text": "纯文本"}[v])
			}
		})
		ui.Row(c).Gap(10).Children(func() {
			ui.Radio(c, &a.imageTheme, "light", "浅色图片")
			ui.Radio(c, &a.imageTheme, "dark", "深色图片")
		})
		if ui.Button(c, "保存展示设置").Disabled(a.pending || !a.preferencesLoaded).Clicked() {
			a.command("preferences", "--message-format", a.format, "--image-theme", a.imageTheme)
		}
	})
	ui.Text(c, "独立设置："+a.settingsPath).FontSize(11).TextColor(c.Theme().TextMuted).Selectable()
}
