use super::*;
use nsh_platform_linux::{
    AppOptions, AppSource, AssetBase, Bundle,
    gtk4::{self, prelude::*},
};

pub fn run(
    resources: PathBuf,
    host: HostChannel,
    _controller: Arc<Controller>,
) -> Result<(), Box<dyn std::error::Error>> {
    let bundle = unsafe { Bundle::read_trusted(&resources.join("bundle.nshc"))? };
    nsh_platform_linux::run_app(
        AppSource::Bundle(bundle),
        AppOptions {
            app_id: APP_ID.into(),
            title: "Yun Bot".into(),
            size: (1000, 740),
            asset_base: Some(AssetBase::Directory(resources.join("assets"))),
            host,
            ..AppOptions::default()
        },
    );
    Ok(())
}
pub fn show() {
    gtk4::glib::MainContext::default().invoke(|| {
        for window in gtk4::Window::list_toplevels() {
            if let Ok(window) = window.downcast::<gtk4::Window>() {
                window.present();
            }
        }
    });
}
pub fn quit() {
    gtk4::glib::MainContext::default().invoke(|| {
        if let Some(app) = gtk4::gio::Application::default() {
            app.quit();
        }
    });
}
pub fn update(_state: Value) {}
