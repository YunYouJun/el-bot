// Instrumentation for the isolated MyGo/Tauri comparison, inactive without the marker file.
use std::{
    fs::OpenOptions,
    io::Write,
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

pub struct PrototypeMetrics(pub Mutex<Option<(Instant, &'static str)>>);

pub fn shown(app: &tauri::AppHandle) {
    if let Some(metrics) = app.try_state::<PrototypeMetrics>() {
        *metrics.0.lock().unwrap() = Some((Instant::now(), "reopen"));
    }
}

#[tauri::command]
pub fn prototype_ui_ready(app: tauri::AppHandle) {
    let root = std::path::Path::new("/tmp/el-bot-prototype-bench");
    if !root.join("enabled").exists() {
        return;
    }
    let metrics = app.state::<PrototypeMetrics>();
    let Some((start, kind)) = metrics.0.lock().unwrap().take() else {
        return;
    };
    let data = serde_json::json!({"kind":kind,"pid":std::process::id(),"readyMs":start.elapsed().as_secs_f64()*1000.0,"at":SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()});
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("tauri.jsonl"))
    {
        let _ = writeln!(file, "{data}");
    }
}
