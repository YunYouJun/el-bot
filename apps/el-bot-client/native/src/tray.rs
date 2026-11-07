use crate::controller::Controller;
use nsh_engine::HostChannel;
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc};
use tray_icon::{
    TrayIcon, TrayIconBuilder,
    menu::{Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem},
};

pub struct Tray {
    pub _icon: TrayIcon,
    labels: Vec<(MenuItem, String)>,
}

impl Tray {
    pub fn new(
        host: HostChannel,
        controller: Arc<Controller>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let menu = Menu::new();
        let mut actions: HashMap<MenuId, &'static str> = HashMap::new();
        let mut labels = vec![];
        let state = controller.snapshot();
        for (key, action) in [
            ("showWindow", "show"),
            ("openCloud", "openCloud"),
            ("personas", "personas"),
            ("settings", "settings"),
            ("openCodex", "codex"),
            ("openQq", "qq"),
            ("openCodebuddy", "codebuddy"),
            ("openDsh", "dsh"),
            ("quit", "quit"),
        ] {
            if action == "quit" {
                menu.append(&PredefinedMenuItem::separator())?;
            }
            let item = MenuItem::new(state["strings"][key].as_str().unwrap_or(key), true, None);
            actions.insert(item.id().clone(), action);
            menu.append(&item)?;
            labels.push((item, key.to_owned()));
        }
        let image =
            image::load_from_memory(include_bytes!("../../icons/tray-icon.png"))?.into_rgba8();
        let icon =
            tray_icon::Icon::from_rgba(image.as_raw().clone(), image.width(), image.height())?;
        let builder = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip("Yun");
        #[cfg(target_os = "macos")]
        let builder = builder.with_icon_templated(icon);
        #[cfg(not(target_os = "macos"))]
        let builder = builder.with_icon(icon);
        let tray = builder.build()?;
        MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
            let Some(action) = actions.get(&event.id) else {
                return;
            };
            if *action == "quit" {
                crate::platform::quit();
                return;
            }
            crate::platform::show();
            let _ = host.send("desktop.show", json!(null));
            let event = match *action {
                "show" => json!({"action":"navigate","value":"quickActions"}),
                "personas" | "settings" => json!({"action":"navigate","value":action}),
                "openCloud" => json!({"action":"openCloud"}),
                name => json!({"action":"openProgram","value":name}),
            };
            let _ = controller.send(&event);
        }));
        Ok(Self {
            _icon: tray,
            labels,
        })
    }
    pub fn update(&self, state: &Value) {
        for (item, key) in &self.labels {
            if let Some(label) = state["strings"][key].as_str() {
                item.set_text(label);
            }
        }
    }
}
