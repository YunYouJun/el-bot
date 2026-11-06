use crate::controller::Controller;
use nsh_engine::HostChannel;
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};

#[cfg(target_os = "macos")]
#[path = "macos.rs"]
mod implementation;
#[cfg(windows)]
#[path = "windows.rs"]
mod implementation;
#[cfg(target_os = "linux")]
#[path = "linux.rs"]
mod implementation;

pub fn run(
    resources: PathBuf,
    host: HostChannel,
    controller: Arc<Controller>,
) -> Result<(), Box<dyn std::error::Error>> {
    implementation::run(resources, host, controller)
}
pub fn show() {
    implementation::show();
}
pub fn quit() {
    implementation::quit();
}
pub fn update(state: Value) {
    implementation::update(state);
}
