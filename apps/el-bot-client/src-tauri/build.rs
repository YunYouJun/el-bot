fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "load_settings",
            "save_settings",
            "save_cloud_settings",
            "open_cloud",
            "bot_command",
            "reply_settings",
            "dsh_persona",
            "open_persona_manager",
            "open_local_program",
        ]),
    ))
    .expect("failed to build desktop manifest");
}
