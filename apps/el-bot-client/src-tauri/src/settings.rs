use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSettings {
    pub node_path: String,
    pub cli_path: String,
    pub config_path: String,
    pub credentials_path: String,
    pub state_path: String,
    #[serde(default)]
    pub codex_app_path: String,
    #[serde(default)]
    pub qq_app_path: String,
}

fn file() -> Result<PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or("无法定位用户目录。")?
        .join(".el-bot/client.json"))
}

impl ClientSettings {
    pub fn validate(&self) -> Result<(), String> {
        for path in [
            &self.node_path,
            &self.cli_path,
            &self.config_path,
            &self.credentials_path,
            &self.state_path,
        ] {
            if !Path::new(path).is_absolute() || path.contains('\0') {
                return Err("请在连接设置中填写所有文件的完整路径。".into());
            }
        }
        for path in [&self.node_path, &self.cli_path] {
            if !Path::new(path).is_file() {
                return Err("找不到 Node 或 el-bot CLI；请检查连接设置。".into());
            }
        }
        for path in [&self.codex_app_path, &self.qq_app_path] {
            if !path.is_empty() && (!Path::new(path).is_absolute() || path.contains('\0')) {
                return Err("应用路径必须为完整本机路径。".into());
            }
        }
        Ok(())
    }
}

pub fn load() -> Result<ClientSettings, String> {
    let path = file()?;
    if path.exists() {
        return serde_json::from_slice(&fs::read(path).map_err(|_| "无法读取客户端设置。")?)
            .map_err(|_| "客户端设置格式无效。".into());
    }
    let directory = path.parent().unwrap();
    let node = if cfg!(target_os = "windows") {
        PathBuf::from("C:/Program Files/nodejs/node.exe")
    } else {
        [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]
        .into_iter()
        .find(|p| Path::new(p).is_file())
        .unwrap_or("/opt/homebrew/bin/node")
        .into()
    };
    Ok(ClientSettings {
        node_path: node.to_string_lossy().into(),
        cli_path: directory
            .join("client-runtime/node_modules/el-bot/dist/cli.mjs")
            .to_string_lossy()
            .into(),
        config_path: directory.join("qq-codex.json").to_string_lossy().into(),
        credentials_path: directory.join("qq-codex.env").to_string_lossy().into(),
        state_path: directory
            .join("qq-codex-state.json")
            .to_string_lossy()
            .into(),
        codex_app_path: String::new(),
        qq_app_path: String::new(),
    })
}

pub fn save(settings: &ClientSettings) -> Result<(), String> {
    settings.validate()?;
    let path = file()?;
    let directory = path.parent().unwrap();
    fs::create_dir_all(directory).map_err(|_| "无法创建客户端设置目录。")?;
    let temporary = directory.join(format!("client-{}.tmp", std::process::id()));
    use std::io::Write;
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|_| "无法保存客户端设置。")?;
    let result = (|| {
        file.write_all(&serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    let _ = fs::remove_file(temporary);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_settings_without_app_paths_still_load() {
        let settings: ClientSettings = serde_json::from_str(r#"{"nodePath":"/bin/node","cliPath":"/cli.mjs","configPath":"/config.json","credentialsPath":"/private.env","statePath":"/state.json"}"#).unwrap();
        assert!(settings.codex_app_path.is_empty());
        assert!(settings.qq_app_path.is_empty());
        let saved = serde_json::to_value(settings).unwrap();
        assert_eq!(saved["codexAppPath"], "");
    }
}
