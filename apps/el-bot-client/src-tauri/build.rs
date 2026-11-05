fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "load_settings",
            "save_settings",
            "bot_command",
            "reply_settings",
            "open_local_program",
            "prototype_ui_ready",
        ]),
    ))
    .expect("failed to build desktop manifest");
}
