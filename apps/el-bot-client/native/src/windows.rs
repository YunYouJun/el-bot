use super::*;
use nsh_platform_windows::{App, AppOptions, AppView, AssetBase, Bundle};
use std::{
    cell::RefCell,
    sync::atomic::{AtomicIsize, Ordering},
};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::Ole::{OleInitialize, OleUninitialize},
    UI::{
        HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext},
        Shell::{DefSubclassProc, SetWindowSubclass},
        WindowsAndMessaging::*,
    },
};

static WINDOW: AtomicIsize = AtomicIsize::new(0);
const SHOW: u32 = WM_APP + 100;
const QUIT: u32 = WM_APP + 101;
const UPDATE: u32 = WM_APP + 102;
thread_local! { static TRAY: RefCell<Option<crate::tray::Tray>> = const { RefCell::new(None) }; }

pub fn run(
    resources: PathBuf,
    host: HostChannel,
    controller: Arc<Controller>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Match nsh's standalone host: deep view trees need a larger stack,
    // and native/GPU resources must drop before the UI thread ends.
    let result = std::thread::Builder::new()
        .name("yun-ui".into())
        .stack_size(8 << 20)
        .spawn(move || {
            run_on_thread(resources, host, controller).map_err(|error| error.to_string())
        })?
        .join()
        .map_err(|_| std::io::Error::other("Windows UI thread failed"))?;
    result.map_err(Into::into)
}

fn run_on_thread(
    resources: PathBuf,
    host: HostChannel,
    controller: Arc<Controller>,
) -> Result<(), Box<dyn std::error::Error>> {
    // OLE and the window/tray all belong to this UI thread.
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        OleInitialize(None)?;
    }
    let view = AppView::new(
        None,
        AppOptions {
            app_id: "cn.elpsy.elbot.client".into(),
            title: "Yun".into(),
            size: (1000, 740),
            asset_base: Some(AssetBase::Directory(resources.join("assets"))),
            host,
            ..AppOptions::default()
        },
    )?;
    WINDOW.store(view.hwnd().0 as isize, Ordering::Release);
    unsafe {
        if !SetWindowSubclass(view.hwnd(), Some(window_proc), 1, 0).as_bool() {
            return Err("Could not install window lifecycle".into());
        }
    }
    TRAY.with(|tray| -> Result<(), Box<dyn std::error::Error>> {
        *tray.borrow_mut() = Some(crate::tray::Tray::new(view.host(), controller.clone())?);
        Ok(())
    })?;
    let bundle = unsafe { Bundle::read_trusted(&resources.join("bundle.nshc"))? };
    view.load(App::Js(bundle));
    view.show();
    let mut message = MSG::default();
    unsafe {
        loop {
            let result = GetMessageW(&mut message, None, 0, 0).0;
            if result == -1 {
                return Err("Windows event loop failed".into());
            }
            if result == 0 {
                break;
            }
            if message.message == UPDATE {
                TRAY.with(|tray| {
                    if let Some(tray) = tray.borrow().as_ref() {
                        tray.update(&controller.snapshot());
                    }
                });
            }
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
    view.stop();
    TRAY.with(|tray| {
        tray.borrow_mut().take();
    });
    WINDOW.store(0, Ordering::Release);
    drop(view);
    unsafe {
        OleUninitialize();
    }
    Ok(())
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    // The subclass borrows a live nsh window. Forward every input/IME/accessibility
    // message unchanged; only our close/activation lifecycle is intercepted.
    unsafe {
        match message {
            WM_CLOSE => {
                let _ = ShowWindow(hwnd, SW_HIDE);
                LRESULT(0)
            }
            SHOW => {
                let _ = ShowWindow(hwnd, SW_RESTORE);
                let _ = SetForegroundWindow(hwnd);
                LRESULT(0)
            }
            QUIT => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefSubclassProc(hwnd, message, wparam, lparam),
        }
    }
}
fn post(message: u32) {
    let hwnd = HWND(WINDOW.load(Ordering::Acquire) as *mut _);
    if !hwnd.0.is_null() {
        unsafe {
            let _ = PostMessageW(Some(hwnd), message, WPARAM(0), LPARAM(0));
        }
    }
}
pub fn show() {
    post(SHOW);
}
pub fn quit() {
    post(QUIT);
}
pub fn update(_state: Value) {
    post(UPDATE);
}
