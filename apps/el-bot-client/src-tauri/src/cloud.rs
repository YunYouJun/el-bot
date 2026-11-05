use serde::{Deserialize, Serialize};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::process::Command;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSettings {
    pub ssh_host: String,
}

impl CloudSettings {
    pub fn validate(&self) -> Result<(), String> {
        let host = &self.ssh_host;
        if host.is_empty()
            || host.len() > 64
            || host.starts_with('-')
            || !host
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        {
            return Err(
                "请填写 SSH 配置中已有的主机别名，只允许字母、数字、点、下划线和连字符。".into(),
            );
        }
        Ok(())
    }
}

fn socket(host: &str) -> Result<PathBuf, String> {
    let directory = dirs::home_dir()
        .ok_or("无法定位用户目录。")?
        .join(".el-bot/tunnels");
    std::fs::create_dir_all(&directory).map_err(|_| "无法创建 SSH 连接目录。")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法保护 SSH 连接目录。")?;
    }
    Ok(directory.join(format!("cloud-{host}")))
}

fn ssh(socket: &std::path::Path) -> Command {
    let mut command = Command::new("ssh");
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ConnectTimeout=10",
        "-S",
    ]);
    command.arg(socket).stdin(Stdio::null());
    command.kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
}

async fn output(command: &mut Command) -> Result<std::process::Output, String> {
    tokio::time::timeout(Duration::from_secs(25), command.output())
        .await
        .map_err(|_| "云端连接超时，请检查 SSH 与网络。".to_owned())?
        .map_err(|_| "无法调用 SSH；请确认已安装并配置 SSH。".to_owned())
}

fn web_url(logs: &str) -> Result<tauri::Url, String> {
    let url = logs
        .lines()
        .rev()
        .find_map(|line| {
            line.find("dsh web: http")
                .map(|index| line[index + "dsh web: ".len()..].trim())
        })
        .ok_or("云端尚未提供 Web 入口，请检查 DSH 服务。")?;
    let parsed = tauri::Url::parse(url).map_err(|_| "云端 Web 入口格式无效。")?;
    if parsed.scheme() != "http"
        || parsed.host_str() != Some("127.0.0.1")
        || parsed.port() != Some(13080)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("云端返回了非预期入口，已停止打开。".into());
    }
    Ok(parsed)
}

async fn connected() -> Result<(CloudSettings, PathBuf), String> {
    let settings = crate::settings::load()?.cloud;
    settings.validate()?;
    let control = socket(&settings.ssh_host)?;
    let check = output(ssh(&control).args(["-O", "check"]).arg(&settings.ssh_host)).await?;
    if !check.status.success() {
        let connect = output(
            ssh(&control)
                .args([
                    "-M",
                    "-f",
                    "-N",
                    "-T",
                    "-o",
                    "ExitOnForwardFailure=yes",
                    "-o",
                    "ServerAliveInterval=30",
                    "-o",
                    "ServerAliveCountMax=3",
                    "-L",
                    "127.0.0.1:13080:127.0.0.1:3080",
                ])
                .arg(&settings.ssh_host),
        )
        .await?;
        if !connect.status.success() {
            return Err(
                "无法建立云端连接；请检查 SSH 别名、密钥、主机指纹和本机 13080 端口。".into(),
            );
        }
    }
    Ok((settings, control))
}

pub async fn personas(
    operation: &str,
    id: Option<&str>,
    revision: Option<&str>,
) -> Result<serde_json::Value, String> {
    let (settings, control) = connected().await?;
    let mut command =
        "sudo -n docker exec --user node el-bot-dsh node /opt/el-bot-dsh/dist/cli.mjs --profile cloud"
            .to_owned();
    match operation {
        "list" => {}
        "disable" => command.push_str(" --disable"),
        "use" => {
            let id = id.ok_or("请选择人物卡。")?;
            if id.is_empty()
                || id.len() > 64
                || !id.as_bytes()[0].is_ascii_alphanumeric()
                || !id
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_')
            {
                return Err("人物卡 ID 无效。".into());
            }
            command.push_str(&format!(" --use {id}"));
            if let Some(hash) = revision {
                if hash.len() != 64 || !hash.bytes().all(|c| c.is_ascii_hexdigit()) {
                    return Err("人物卡版本无效。".into());
                }
                command.push_str(&format!(" --revision {hash}"));
            }
        }
        _ => return Err("未知人物卡操作。".into()),
    }
    let result = output(ssh(&control).arg(&settings.ssh_host).arg(command)).await?;
    if result.stdout.len() > 2 * 1024 * 1024 {
        return Err("人物卡响应过大。".into());
    }
    let reply: serde_json::Value = serde_json::from_slice(&result.stdout)
        .map_err(|_| "请先在远端安装 @el-bot/dsh 人物卡插件。".to_owned())?;
    if !result.status.success() || reply["ok"] != true {
        return Err(reply["error"]
            .as_str()
            .unwrap_or("远端人物卡操作失败。")
            .to_owned());
    }
    Ok(reply["result"].clone())
}

pub async fn open() -> Result<(), String> {
    open_page(false).await
}
pub async fn open_personas() -> Result<(), String> {
    open_page(true).await
}
async fn open_page(personas: bool) -> Result<(), String> {
    let (settings, control) = connected().await?;
    // Only this fixed deployment command is available. Neither the web page nor
    // a caller can supply a remote command, browser URL, or shell arguments.
    let result = output(
        ssh(&control)
            .arg(&settings.ssh_host)
            .args(["sudo -n docker logs --tail 500 el-bot-dsh 2>&1"]),
    )
    .await?;
    if !result.status.success() || result.stdout.len() > 256_000 {
        return Err("无法读取云端 DSH 入口，请检查服务与 SSH 权限。".into());
    }
    let mut url = web_url(&String::from_utf8_lossy(&result.stdout))?;
    if personas {
        url.set_fragment(Some("el-bot-personas"));
    }
    #[cfg(target_os = "macos")]
    let mut browser = Command::new("/usr/bin/open");
    #[cfg(target_os = "linux")]
    let mut browser = Command::new("xdg-open");
    #[cfg(windows)]
    let mut browser = {
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler");
        command
    };
    let result = output(browser.arg(url.as_str())).await?;
    if !result.status.success() {
        return Err("无法打开默认浏览器。".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_alias_cannot_be_an_option_or_command() {
        for host in ["", "-F", "host; id", "user@host", "host\ncommand"] {
            assert!(CloudSettings {
                ssh_host: host.into()
            }
            .validate()
            .is_err());
        }
        assert!(CloudSettings {
            ssh_host: "yunlefun".into()
        }
        .validate()
        .is_ok());
    }

    #[test]
    fn authenticated_entry_must_use_the_local_tunnel() {
        assert!(web_url("dsh web: http://127.0.0.1:13080/?token=example").is_ok());
        for url in [
            "https://example.com",
            "http://127.0.0.1:3080",
            "file:///tmp/test",
            "http://user@127.0.0.1:13080",
        ] {
            assert!(web_url(&format!("dsh web: {url}")).is_err());
        }
    }
}
