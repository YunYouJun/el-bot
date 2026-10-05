#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod programs;
mod settings;
mod tray;
use settings::ClientSettings;
use std::{path::Path, time::Duration};
use tauri::Manager;
use tokio::process::Command;

#[tauri::command]
fn load_settings() -> Result<ClientSettings, String> {
    settings::load()
}

#[tauri::command]
fn save_settings(settings: ClientSettings) -> Result<ClientSettings, String> {
    settings::save(&settings)?;
    Ok(settings)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum Operation {
    Status,
    Start,
    Stop,
    Restart,
    Logs,
}

impl Operation {
    fn name(&self) -> &'static str {
        match self {
            Self::Status => "status",
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
            Self::Logs => "logs",
        }
    }
}

#[tauri::command]
async fn bot_command(
    app: tauri::AppHandle,
    operation: Operation,
    interrupt: bool,
) -> Result<serde_json::Value, String> {
    let is_status = matches!(operation, Operation::Status);
    let result = run_command(operation, interrupt).await;
    if let Ok(status) = &result {
        if status.get("phase").is_some() {
            tray::update(&app, Some(status));
        }
    } else if is_status {
        tray::update(&app, None);
    }
    result
}

async fn run_command(operation: Operation, interrupt: bool) -> Result<serde_json::Value, String> {
    let mut extra = Vec::new();
    if matches!(operation, Operation::Start) {
        extra.push("--background".to_owned());
    }
    if interrupt && matches!(operation, Operation::Stop | Operation::Restart) {
        extra.push("--interrupt".to_owned());
    }
    execute_cli(operation.name(), extra).await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum MessageFormat {
    Image,
    Markdown,
    Text,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum ImageTheme {
    Light,
    Dark,
}

#[tauri::command]
async fn reply_settings(
    message_format: Option<MessageFormat>,
    image_theme: Option<ImageTheme>,
) -> Result<serde_json::Value, String> {
    let mut extra = Vec::new();
    if let Some(format) = message_format {
        extra.extend([
            "--message-format".to_owned(),
            match format {
                MessageFormat::Image => "image",
                MessageFormat::Markdown => "markdown",
                MessageFormat::Text => "text",
            }
            .to_owned(),
        ]);
    }
    if let Some(theme) = image_theme {
        extra.extend([
            "--image-theme".to_owned(),
            match theme {
                ImageTheme::Light => "light",
                ImageTheme::Dark => "dark",
            }
            .to_owned(),
        ]);
    }
    execute_cli("preferences", extra).await
}

#[tauri::command]
fn open_local_program(program: programs::LocalProgram) -> Result<(), String> {
    programs::open(program, &settings::load()?)
}

async fn execute_cli(operation: &str, extra: Vec<String>) -> Result<serde_json::Value, String> {
    let settings = settings::load()?;
    settings.validate()?;
    let mut command = Command::new(&settings.node_path);
    command.args([
        &settings.cli_path,
        "codex",
        operation,
        "--json",
        "--config",
        &settings.config_path,
        "--credentials",
        &settings.credentials_path,
        "--state",
        &settings.state_path,
    ]);
    command.args(extra);
    let mut paths = vec![Path::new(&settings.node_path)
        .parent()
        .unwrap()
        .to_path_buf()];
    paths.extend(std::env::split_paths(
        &std::env::var_os("PATH").unwrap_or_default(),
    ));
    #[cfg(unix)]
    paths.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(Into::into));
    command.env(
        "PATH",
        std::env::join_paths(paths).map_err(|e| e.to_string())?,
    );
    command.kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let output = tokio::time::timeout(Duration::from_secs(75), command.output())
        .await
        .map_err(|_| "控制命令超时；机器人保持原状态，请查看日志。".to_owned())?
        .map_err(|_| "无法启动 Node；请检查连接设置中的可执行文件。".to_owned())?;
    if output.stdout.len() > 128_000 {
        return Err("控制响应过大。".into());
    }
    let reply: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "CLI 未返回有效结果；请确认使用支持本机控制的 el-bot 版本。".to_owned())?;
    if reply["ok"] != true {
        return Err(reply["error"]
            .as_str()
            .unwrap_or("本机控制失败。")
            .to_owned());
    }
    Ok(reply["result"].clone())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            tray::show_window(app);
        }))
        .setup(tray::setup)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                #[cfg(target_os = "macos")]
                let _ = window
                    .app_handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            bot_command,
            reply_settings,
            open_local_program
        ])
        .build(tauri::generate_context!())
        .expect("failed to build el-bot client")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                tray::show_window(_app);
            }
        });
}
