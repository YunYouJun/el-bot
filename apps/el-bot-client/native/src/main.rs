#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod controller;
mod instance;
mod platform;
#[cfg(any(target_os = "macos", windows))]
mod tray;

use nsh_engine::HostChannel;
use serde_json::json;
use std::{path::PathBuf, sync::Arc};

const APP_ID: &str = "fun.yunle.bot";

fn main() -> std::process::ExitCode {
    match start() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Yun: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}

fn start() -> Result<(), Box<dyn std::error::Error>> {
    let executable = std::env::current_exe()?;
    let parent = executable.parent().ok_or("Missing executable directory")?;
    let resources = if cfg!(target_os = "macos") {
        parent.join("../Resources/nsh")
    } else {
        parent.join("nsh")
    };
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or("Missing user home")?;
    let args: Vec<String> = std::env::args().collect();
    let settings = match args.iter().position(|arg| arg == "--settings") {
        Some(index) => PathBuf::from(args.get(index + 1).ok_or("--settings requires a path")?),
        None => PathBuf::from(home).join(".el-bot/client.json"),
    };
    if !settings.is_absolute() {
        return Err("Settings path must be absolute".into());
    }
    let host = HostChannel::new();
    let Some(_instance) = instance::Instance::acquire(
        &settings,
        host.clone(),
        args.iter().any(|arg| arg == "--replace"),
    )?
    else {
        return Ok(());
    };
    let controller = Arc::new(controller::Controller::start(
        &resources,
        &settings,
        host.clone(),
    )?);
    let events = controller.clone();
    host.handle("client.event", move |call| match events.send(call.data()) {
        Ok(()) => call.resolve(json!(null)),
        Err(_) => call.reject("Client controller is unavailable"),
    });
    let state = controller.clone();
    host.handle("client.snapshot", move |call| {
        call.resolve(state.snapshot())
    });
    host.handle("client.choosePath", move |call| {
        let field = call.data().as_str().unwrap_or_default();
        if !matches!(
            field,
            "nodePath"
                | "cliPath"
                | "configPath"
                | "credentialsPath"
                | "statePath"
                | "codexAppPath"
                | "codebuddyAppPath"
                | "dshAppPath"
                | "qqAppPath"
        ) {
            call.reject("Unsupported path field");
            return;
        }
        // Dialog work must not block the engine thread.
        std::thread::spawn(move || {
            let path = rfd::FileDialog::new().pick_file();
            call.resolve(
                path.map(|file| json!(file.to_string_lossy()))
                    .unwrap_or(json!(null)),
            );
        });
    });
    host.handle("client.quit", move |call| {
        call.resolve(json!(null));
        platform::quit();
    });
    let result = platform::run(resources, host, controller.clone());
    controller.stop();
    result
}
