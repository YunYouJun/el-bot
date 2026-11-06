use fs2::FileExt;
use nsh_engine::HostChannel;
use serde_json::{Value, json};
use std::{
    fs::{File, OpenOptions},
    io::{self, BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    time::Duration,
};

// The per-user file lock owns the listener. A random, private token authenticates
// GUI activation/replacement only; bot IPC stays in the existing CLI.
pub struct Instance {
    _lock: File,
}

impl Instance {
    pub fn acquire(settings: &Path, host: HostChannel, replace: bool) -> io::Result<Option<Self>> {
        let directory = settings
            .parent()
            .ok_or_else(|| io::Error::other("Invalid settings path"))?;
        std::fs::create_dir_all(directory)?;
        let file = settings.with_extension("window.lock");
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut lock = options.open(file)?;
        if let Err(error) = lock.try_lock_exclusive() {
            if error.kind() != io::ErrorKind::WouldBlock {
                return Err(error);
            }
            for _ in 0..20 {
                use std::io::{Read, Seek, SeekFrom};
                lock.seek(SeekFrom::Start(0))?;
                let mut bytes = String::new();
                (&mut lock).take(4096).read_to_string(&mut bytes)?;
                if let Ok(info) = serde_json::from_str::<Value>(&bytes) {
                    if let (Some(port), Some(token)) =
                        (info["port"].as_u64(), info["token"].as_str())
                    {
                        if let Ok(mut socket) = TcpStream::connect_timeout(
                            &([127, 0, 0, 1], port as u16).into(),
                            Duration::from_secs(1),
                        ) {
                            let message = if replace {
                                format!("quit:{token}\n")
                            } else {
                                format!("{token}\n")
                            };
                            socket.write_all(message.as_bytes())?;
                            if replace {
                                // Let the previous GUI clean up. Never stop the bot or
                                // force-kill a process to replace a development window.
                                for _ in 0..60 {
                                    if lock.try_lock_exclusive().is_ok() {
                                        drop(lock);
                                        return Self::acquire(settings, host, false);
                                    }
                                    std::thread::sleep(Duration::from_millis(50));
                                }
                                return Err(io::Error::other(
                                    "The previous Yun window is still closing",
                                ));
                            }
                            return Ok(None);
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            return Err(io::Error::other(
                "The existing Yun instance could not be activated",
            ));
        }
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let token: String = rand::random::<[u8; 32]>()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        lock.set_len(0)?;
        serde_json::to_writer(
            &mut lock,
            &json!({"port":listener.local_addr()?.port(),"token":token}),
        )?;
        lock.sync_all()?;
        std::thread::spawn(move || {
            for socket in listener.incoming().flatten() {
                let _ = socket.set_read_timeout(Some(Duration::from_secs(1)));
                let mut line = String::new();
                use std::io::Read;
                if BufReader::new(socket)
                    .take(128)
                    .read_line(&mut line)
                    .is_ok()
                {
                    if line.trim_end() == token {
                        crate::platform::show();
                        let _ = host.send("desktop.show", json!(null));
                    } else if line.trim_end() == format!("quit:{token}") {
                        crate::platform::quit();
                    }
                }
            }
        });
        Ok(Some(Self { _lock: lock }))
    }
}
