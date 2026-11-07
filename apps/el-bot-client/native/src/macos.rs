use super::*;
use nsh_platform_macos::{
    AppOptions, AppView, AssetBase, Bundle, Locale,
    objc2::{
        MainThreadMarker, MainThreadOnly, define_class, msg_send, rc::Retained,
        runtime::ProtocolObject, sel,
    },
    objc2_app_kit::{
        NSApplication, NSApplicationActivationPolicy, NSApplicationDelegate,
        NSApplicationTerminateReply, NSBackingStoreType, NSEvent, NSEventModifierFlags,
        NSEventType, NSSegmentSwitchTracking, NSSegmentedControl, NSToolbar, NSToolbarDelegate,
        NSToolbarItem, NSToolbarItemIdentifier, NSWindow, NSWindowDelegate, NSWindowStyleMask,
        NSWindowToolbarStyle,
    },
    objc2_foundation::{
        NSArray, NSNotification, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
    },
};
use serde_json::json;
use std::{cell::RefCell, rc::Rc};

const PAGES: [&str; 3] = ["quickActions", "personas", "settings"];
struct Session {
    resources: PathBuf,
    host: HostChannel,
    controller: Arc<Controller>,
    delegate: Retained<Delegate>,
    window: Option<Retained<NSWindow>>,
    view: Option<Rc<AppView>>,
    navigation: Option<Retained<NSSegmentedControl>>,
    tray: crate::tray::Tray,
}
thread_local! { static SESSION:RefCell<Option<Session>> = const { RefCell::new(None) }; }

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "YunNshDelegate"]
    struct Delegate;
    unsafe impl NSObjectProtocol for Delegate {}
    unsafe impl NSApplicationDelegate for Delegate {
        #[unsafe(method(applicationShouldTerminateAfterLastWindowClosed:))]
        fn keep_running(&self,_app:&NSApplication)->bool { false }
        #[unsafe(method(applicationShouldTerminate:))]
        fn should_quit(&self,_app:&NSApplication)->NSApplicationTerminateReply {
            quit(); NSApplicationTerminateReply::TerminateCancel
        }
        #[unsafe(method(applicationShouldHandleReopen:hasVisibleWindows:))]
        fn reopen(&self,_app:&NSApplication,_visible:bool)->bool { trace("Dock reopen"); show(); false }
    }
    unsafe impl NSWindowDelegate for Delegate {
        #[unsafe(method(windowWillClose:))]
        fn closed(&self,_notification:&NSNotification) {
            trace("window will close");
            dispatch2::DispatchQueue::main().exec_async(|| {
                release_window();
                if let Some(mtm)=MainThreadMarker::new() {
                    NSApplication::sharedApplication(mtm).setActivationPolicy(NSApplicationActivationPolicy::Accessory);
                }
            });
        }
    }
    unsafe impl NSToolbarDelegate for Delegate {
        #[unsafe(method_id(toolbarDefaultItemIdentifiers:))]
        #[unsafe(method_family = none)]
        fn defaults(&self,_toolbar:&NSToolbar)->Retained<NSArray<NSToolbarItemIdentifier>> { identifiers() }
        #[unsafe(method_id(toolbarAllowedItemIdentifiers:))]
        #[unsafe(method_family = none)]
        fn allowed(&self,_toolbar:&NSToolbar)->Retained<NSArray<NSToolbarItemIdentifier>> { identifiers() }
        #[unsafe(method_id(toolbar:itemForItemIdentifier:willBeInsertedIntoToolbar:))]
        #[unsafe(method_family = none)]
        fn item(&self,_toolbar:&NSToolbar,id:&NSToolbarItemIdentifier,_insert:bool)->Option<Retained<NSToolbarItem>> {
            (|| {
            if id.to_string()!="yun.navigation" { return None; }
            let mtm=MainThreadMarker::new()?;
            SESSION.with(|session| {
                let mut session=session.borrow_mut(); let session=session.as_mut()?;
                let state=session.controller.snapshot();
                let labels:Vec<_>=PAGES.iter().map(|key| NSString::from_str(state["strings"][key].as_str().unwrap_or(key))).collect();
                // The toolbar uses Apple's actual NSSegmentedControl; its look,
                // focus ring, keyboard handling and accessibility remain native.
                let control=unsafe { NSSegmentedControl::segmentedControlWithLabels_trackingMode_target_action(
                    &NSArray::from_retained_slice(&labels),NSSegmentSwitchTracking::SelectOne,Some(self),Some(sel!(navigate:)),mtm
                ) };
                control.setSelectedSegment(PAGES.iter().position(|page| Some(*page)==state["page"].as_str()).unwrap_or(0) as isize);
                control.sizeToFit();
                let item=NSToolbarItem::initWithItemIdentifier(NSToolbarItem::alloc(mtm),id);
                item.setView(Some(&control));
                session.navigation=Some(control);
                Some(item)
            })
            })()
        }
    }
    impl Delegate {
        #[unsafe(method(navigate:))]
        fn navigate(&self,sender:&NSSegmentedControl) {
            if let Some(page)=PAGES.get(sender.selectedSegment() as usize) {
                SESSION.with(|session| { if let Some(session)=session.borrow().as_ref() {
                    let _=session.controller.send(&json!({"action":"navigate","value":page}));
                } });
            }
        }
    }
);

fn identifiers() -> Retained<NSArray<NSToolbarItemIdentifier>> {
    NSArray::from_retained_slice(&[
        NSString::from_str("NSToolbarFlexibleSpaceItem"),
        NSString::from_str("yun.navigation"),
        NSString::from_str("NSToolbarFlexibleSpaceItem"),
    ])
}

pub fn run(
    resources: PathBuf,
    host: HostChannel,
    controller: Arc<Controller>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mtm = MainThreadMarker::new().ok_or("Expected the main thread")?;
    let app = NSApplication::sharedApplication(mtm);
    let delegate: Retained<Delegate> = unsafe { msg_send![Delegate::alloc(mtm), init] };
    app.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    host.set_params(json!({"nativeChrome":true}).as_object().unwrap().clone());
    let tray = crate::tray::Tray::new(host.clone(), controller.clone())?;
    SESSION.with(|slot| {
        *slot.borrow_mut() = Some(Session {
            resources,
            host,
            controller,
            delegate: delegate.clone(),
            window: None,
            view: None,
            navigation: None,
            tray,
        });
    });
    show_window()?;
    app.run();
    release_window();
    app.setDelegate(None);
    SESSION.with(|slot| {
        slot.borrow_mut().take();
    });
    Ok(())
}

fn show_window() -> Result<(), Box<dyn std::error::Error>> {
    trace("show window");
    let mtm = MainThreadMarker::new().ok_or("Expected the main thread")?;
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    let existing = SESSION.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|session| session.window.clone())
    });
    if let Some(window) = existing {
        if window.isMiniaturized() {
            window.deminiaturize(None);
        }
        window.makeKeyAndOrderFront(None);
        app.activate();
        return Ok(());
    }
    let (resources, host, state, delegate) = SESSION.with(|slot| {
        let slot = slot.borrow();
        let session = slot.as_ref().expect("session");
        (
            session.resources.clone(),
            session.host.clone(),
            session.controller.snapshot(),
            session.delegate.clone(),
        )
    });
    let style = NSWindowStyleMask::Titled
        | NSWindowStyleMask::Closable
        | NSWindowStyleMask::Miniaturizable
        | NSWindowStyleMask::Resizable;
    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            NSWindow::alloc(mtm),
            NSRect::new(NSPoint::new(0., 0.), NSSize::new(1000., 740.)),
            style,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    unsafe {
        window.setReleasedWhenClosed(false);
    }
    window.setTitle(&NSString::from_str(
        state["strings"]["appName"].as_str().unwrap_or("Yun"),
    ));
    window.setContentMinSize(NSSize::new(640., 480.));
    window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    window.setToolbarStyle(NSWindowToolbarStyle::Unified);
    let toolbar =
        NSToolbar::initWithIdentifier(NSToolbar::alloc(mtm), &NSString::from_str("yun.toolbar"));
    toolbar.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    window.setToolbar(Some(&toolbar));
    let view = AppView::new(
        mtm,
        AppOptions {
            app_id: APP_ID.into(),
            title: "Yun Bot".into(),
            size: (1000, 740),
            asset_base: Some(AssetBase::Directory(resources.join("assets"))),
            host,
            ..AppOptions::default()
        },
    );
    view.set_locale(state["locale"].as_str().and_then(Locale::parse));
    window.setContentView(Some(&view.view()));
    // Bytecode may only come from this signed application's own resources.
    let bundle = unsafe { Bundle::read_trusted(&resources.join("bundle.nshc"))? };
    view.load(bundle.into());
    SESSION.with(|slot| {
        if let Some(session) = slot.borrow_mut().as_mut() {
            session.window = Some(window.clone());
            session.view = Some(view);
        }
    });
    window.center();
    window.makeKeyAndOrderFront(None);
    app.activate();
    Ok(())
}

fn release_window() {
    trace("release window");
    SESSION.with(|slot| {
        if let Some(session) = slot.borrow_mut().as_mut() {
            if let Some(view) = session.view.take() {
                view.stop();
            }
            session.navigation.take();
            if let Some(window) = session.window.take() {
                window.setContentView(None);
                window.setDelegate(None);
                window.close();
            }
        }
    });
}

pub fn show() {
    dispatch2::DispatchQueue::main().exec_async(|| {
        if let Err(error) = show_window() {
            eprintln!("Yun: {error}");
        }
    });
}
pub fn quit() {
    dispatch2::DispatchQueue::main().exec_async(|| {
        release_window();
        if let Some(mtm)=MainThreadMarker::new() {
            let app=NSApplication::sharedApplication(mtm); app.stop(None);
            if let Some(event)=NSEvent::otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2(
                NSEventType::ApplicationDefined,NSPoint::new(0.,0.),NSEventModifierFlags::empty(),0.,0,None,0,0,0) { app.postEvent_atStart(&event,true); }
        }
    });
}
pub fn update(state: Value) {
    dispatch2::DispatchQueue::main().exec_async(move || {
        SESSION.with(|slot| {
            if let Some(session) = slot.borrow().as_ref() {
                session.tray.update(&state);
                if let Some(view) = session.view.as_ref() {
                    view.set_locale(state["locale"].as_str().and_then(Locale::parse));
                }
                if let Some(control) = session.navigation.as_ref() {
                    for (index, page) in PAGES.iter().enumerate() {
                        control.setLabel_forSegment(
                            &NSString::from_str(state["strings"][page].as_str().unwrap_or(page)),
                            index as isize,
                        );
                    }
                    control.setSelectedSegment(
                        PAGES
                            .iter()
                            .position(|page| Some(*page) == state["page"].as_str())
                            .unwrap_or(0) as isize,
                    );
                }
            }
        });
    });
}

fn trace(message: &str) {
    if std::env::args().any(|argument| argument == "--trace") {
        eprintln!("[Yun lifecycle] {message}");
    }
}
