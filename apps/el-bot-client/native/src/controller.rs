use nsh_engine::HostChannel;
use serde_json::{Value, json};
use std::{
    io::{self, BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex, RwLock, mpsc},
};

const MAX_SNAPSHOT: u64 = 2 * 1024 * 1024;

pub struct Controller {
    child: Mutex<Child>,
    events: mpsc::SyncSender<Value>,
    state: Arc<RwLock<Value>>,
}

impl Controller {
    pub fn start(resources: &Path, settings: &Path, host: HostChannel) -> io::Result<Self> {
        let name = if cfg!(windows) {
            "yun-controller.exe"
        } else {
            "yun-controller"
        };
        let mut command = Command::new(resources.join(name));
        command
            .args(["--settings".as_ref(), settings.as_os_str()])
            .env(
                "YUN_SYSTEM_LOCALE",
                sys_locale::get_locale().unwrap_or_else(|| "en".into()),
            )
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn()?;
        let input = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("No controller input"))?;
        let output = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("No controller output"))?;
        let mut reader = BufReader::new(output);
        let initial = read_snapshot(&mut reader)?;
        let state = Arc::new(RwLock::new(initial));
        let (tx, rx) = mpsc::sync_channel(64);
        std::thread::spawn(move || write_events(input, rx));
        let current = state.clone();
        std::thread::spawn(move || {
            while let Ok(snapshot) = read_snapshot(&mut reader) {
                if let Ok(mut state) = current.write() {
                    *state = snapshot.clone();
                }
                platform_state(&snapshot);
                let _ = host.send("client.state", snapshot);
            }
            let _ = host.send(
                "client.failed",
                json!("Client controller disconnected. Reopen Yun."),
            );
        });
        Ok(Self {
            child: Mutex::new(child),
            events: tx,
            state,
        })
    }

    pub fn send(&self, event: &Value) -> io::Result<()> {
        if !event.is_object() || serde_json::to_vec(event)?.len() > 16384 {
            return Err(io::Error::other("Invalid controller event"));
        }
        self.events
            .try_send(event.clone())
            .map_err(io::Error::other)
    }

    pub fn snapshot(&self) -> Value {
        self.state
            .read()
            .map(|state| state.clone())
            .unwrap_or(json!(null))
    }

    pub fn stop(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for Controller {
    fn drop(&mut self) {
        self.stop();
    }
}

fn write_events(mut input: ChildStdin, events: mpsc::Receiver<Value>) {
    for event in events {
        if serde_json::to_writer(&mut input, &event).is_err()
            || input.write_all(b"\n").is_err()
            || input.flush().is_err()
        {
            break;
        }
    }
}

fn read_snapshot(reader: &mut impl BufRead) -> io::Result<Value> {
    use std::io::Read;
    let mut bytes = Vec::new();
    let count = reader
        .take(MAX_SNAPSHOT + 1)
        .read_until(b'\n', &mut bytes)?;
    if count == 0 || count as u64 > MAX_SNAPSHOT || !bytes.ends_with(b"\n") {
        return Err(io::Error::other("Invalid controller response"));
    }
    let value: Value = serde_json::from_slice(&bytes)?;
    if !value.is_object() {
        return Err(io::Error::other("Invalid controller state"));
    }
    Ok(value)
}

fn platform_state(snapshot: &Value) {
    crate::platform::update(snapshot.clone());
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_requires_bounded_json_objects() {
        assert!(read_snapshot(&mut &b"{\"pending\":false}\n"[..]).is_ok());
        for invalid in [&b"[]\n"[..], &b"invalid\n"[..], &b"{}"[..], &b""[..]] {
            assert!(read_snapshot(&mut &invalid[..]).is_err());
        }
        let large = vec![b'x'; MAX_SNAPSHOT as usize + 1];
        assert!(read_snapshot(&mut &large[..]).is_err());
    }
}
