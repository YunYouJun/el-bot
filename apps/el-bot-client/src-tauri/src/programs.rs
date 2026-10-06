use crate::settings::ClientSettings;
use std::path::PathBuf;

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LocalProgram {
    Codex,
    Codebuddy,
    Dsh,
    Qq,
}

impl LocalProgram {
    #[cfg(target_os = "macos")]
    fn bundle_id(&self) -> &'static str {
        match self {
            Self::Codex => "com.openai.codex",
            Self::Codebuddy => "com.tencent.codebuddycn",
            Self::Dsh => "dsh-tauri",
            Self::Qq => "com.tencent.qq",
        }
    }

    fn configured_path<'a>(&self, settings: &'a ClientSettings) -> &'a str {
        match self {
            Self::Codex => &settings.codex_app_path,
            Self::Codebuddy => &settings.codebuddy_app_path,
            Self::Dsh => &settings.dsh_app_path,
            Self::Qq => &settings.qq_app_path,
        }
    }

    pub fn path(&self, settings: &ClientSettings) -> Result<PathBuf, String> {
        let configured = self.configured_path(settings);
        if configured.is_empty() {
            return Err("请先在连接设置中填写该应用的完整可执行文件路径。".into());
        }
        let path = PathBuf::from(configured);
        if !path.is_absolute() || path.to_string_lossy().contains('\0') {
            return Err("应用路径必须为完整本机路径。".into());
        }
        Ok(path)
    }
}

pub fn open(program: LocalProgram, settings: &ClientSettings) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("/usr/bin/open");
        if program.configured_path(settings).is_empty() {
            command.args(["-b", program.bundle_id()]);
        } else {
            let path = program.path(settings)?;
            if path.extension().and_then(|v| v.to_str()) != Some("app") || !path.is_dir() {
                return Err("找不到应用；请在连接设置中选择已安装的 .app 路径。".into());
            }
            command.arg("-a").arg(path);
        }
        let status = command.status().map_err(|_| "无法打开本机应用。")?;
        if !status.success() {
            return Err("无法打开本机应用；请检查安装和应用路径。".into());
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let path = program.path(settings)?;
        if !path.is_file() {
            return Err("找不到应用可执行文件；请检查连接设置中的路径。".into());
        }
        #[cfg(windows)]
        if !path
            .extension()
            .and_then(|v| v.to_str())
            .is_some_and(|v| v.eq_ignore_ascii_case("exe"))
        {
            return Err("请选择应用的 .exe 文件。".into());
        }
        let mut command = std::process::Command::new(path);
        command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        command
            .spawn()
            .map_err(|_| "无法启动应用；请检查安装和可执行文件权限。")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_named_apps_can_be_requested() {
        assert!(serde_json::from_str::<LocalProgram>("\"qq\"").is_ok());
        assert!(serde_json::from_str::<LocalProgram>("\"shell\"").is_err());
        assert!(serde_json::from_str::<LocalProgram>("\"https://example.com\"").is_err());
    }
}
