use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

struct TrayMenu {
    status: MenuItem<tauri::Wry>,
    start: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
    restart: MenuItem<tauri::Wry>,
}

pub fn show_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let item = |id, label, enabled| MenuItem::with_id(app, id, label, enabled, None::<&str>);
    let status = item("status", "机器人：等待连接", false)?;
    let start = item("start", "启动机器人", false)?;
    let stop = item("stop", "停止机器人…", false)?;
    let restart = item("restart", "重启机器人…", false)?;
    let runtime = item("runtime", "打开控制台", true)?;
    let logs = item("logs", "运行日志", true)?;
    let settings = item("settings", "连接设置", true)?;
    let codex = item("open-codex", "打开 Codex", true)?;
    let qq = item("open-qq", "打开 QQ", true)?;
    let quit = item("quit", "退出客户端（机器人继续运行）", true)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let separator_end = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &separator,
            &start,
            &stop,
            &restart,
            &runtime,
            &logs,
            &settings,
            &codex,
            &qq,
            &separator_end,
            &quit,
        ],
    )?;
    app.manage(TrayMenu {
        status,
        start,
        stop,
        restart,
    });
    #[cfg(target_os = "macos")]
    let icon = {
        const PIXELS: &[u8; 32 * 32 * 4] = include_bytes!("../icons/tray-icon.rgba");
        tauri::image::Image::new(PIXELS, 32, 32)
    };
    #[cfg(not(target_os = "macos"))]
    let icon = app.default_window_icon().ok_or("missing app icon")?.clone();
    TrayIconBuilder::with_id("el-bot")
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("el-bot · 本机机器人")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            action @ ("start" | "stop" | "restart" | "runtime" | "logs" | "settings"
            | "open-codex" | "open-qq") => {
                show_window(app);
                // Reuse the window's pending guard and explicit interruption confirmation.
                let _ = app.emit_to("main", "tray-action", action);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn update(app: &AppHandle, status: Option<&serde_json::Value>) {
    let Some(menu) = app.try_state::<TrayMenu>() else {
        return;
    };
    let phase = status.and_then(|value| value["phase"].as_str());
    let label = match phase {
        Some("stopped") => "已停止",
        Some("starting") => "正在启动",
        Some("running") if status.is_some_and(|value| value["busy"] == true) => "运行中 · 有任务",
        Some("running") => "运行中 · 空闲",
        Some("stopping") => "正在停止",
        Some("unmanaged") => "暂不可管理",
        _ => "连接不可用",
    };
    let _ = menu.status.set_text(format!("机器人：{label}"));
    let _ = menu.start.set_enabled(phase == Some("stopped"));
    let _ = menu
        .stop
        .set_enabled(matches!(phase, Some("starting" | "running")));
    let _ = menu.restart.set_enabled(phase == Some("running"));
}
