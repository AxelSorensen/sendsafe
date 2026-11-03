use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// Updated from the main thread; read from the poll thread (webview calls are not thread-safe on macOS).
static FOCUSED: AtomicBool = AtomicBool::new(false);

/// The app used to be called SafeDrop (com.safedrop.desktop). Move its data over once so nothing is lost.
fn migrate_legacy_data(new_dir: &std::path::Path) {
    if new_dir.exists() {
        return;
    }
    let Some(base) = new_dir.parent().and_then(|p| p.parent()) else { return };
    let old = base.join("com.safedrop.desktop").join("safedrop");
    if old.exists() {
        if let Some(parent) = new_dir.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::rename(&old, new_dir);
    }
}

struct Server(Mutex<Option<CommandChild>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .expect("no free port")
}

fn wait_for(port: u16, timeout: Duration) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}


fn random_token() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    (0..4)
        .map(|_| format!("{:016x}", RandomState::new().build_hasher().finish()))
        .collect()
}

#[derive(serde::Deserialize)]
struct Latest {
    count: u64,
    latest: u64,
}

fn fetch_latest(port: u16, token: &str) -> Option<Latest> {
    ureq::get(&format!("http://127.0.0.1:{port}/api/notify/latest"))
        .set("x-notify-token", token)
        .timeout(Duration::from_secs(3))
        .call()
        .ok()?
        .into_json()
        .ok()
}

/// Show a native notification, except while the user is already looking at the app.
fn notify(app: &AppHandle, body: &str) {
    if FOCUSED.load(Ordering::Relaxed) {
        return;
    }
    let _ = app.notification().builder().title("SendSafe").body(body).show();
}

/// Native notification whenever a new file lands (works while the window is hidden in the tray).
fn watch_inbox(app: AppHandle, port: u16, token: String) {
    std::thread::spawn(move || {
        let _ = app.notification().request_permission();
        let mut last: Option<Latest> = None;
        loop {
            if let Some(cur) = fetch_latest(port, &token) {
                if let Some(prev) = &last {
                    if cur.latest > prev.latest {
                        let added = cur.count.saturating_sub(prev.count).max(1);
                        let body = if added == 1 { "1 new file received".to_string() } else { format!("{added} new files received") };
                        notify(&app, &body);
                    }
                }
                last = Some(cur);
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    FOCUSED.store(false, Ordering::Relaxed);
                    let _ = window.hide();
                }
                WindowEvent::Focused(f) => FOCUSED.store(*f, Ordering::Relaxed),
                _ => {}
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // Start on login so uploads keep arriving. Enabled once, on first run, so a user who turns it off stays off.
            let hidden = std::env::args().any(|a| a == "--hidden");
            if let Ok(dir) = app.path().app_data_dir() {
                let marker = dir.join(".autostart-set");
                if !marker.exists() {
                    let _ = app.autolaunch().enable();
                    let _ = std::fs::create_dir_all(&dir);
                    let _ = std::fs::write(&marker, "1");
                }
            }

            // Menu-bar icon: closing the window hides it; the server and tunnel keep running.
            let open = MenuItem::with_id(app, "open", "Open SendSafe", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Dev mode: load a live `nuxt dev` server (hot reload) instead of the bundled build.
            if cfg!(debug_assertions) {
                if let Ok(dev_url) = std::env::var("SENDSAFE_DEV_URL") {
                    let parsed: tauri::Url = dev_url.parse().expect("SENDSAFE_DEV_URL");
                    if let (Some(p), Ok(t)) = (parsed.port(), std::env::var("SENDSAFE_NOTIFY_TOKEN")) {
                        watch_inbox(handle.clone(), p, t);
                    }
                    let b = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(parsed))
                        .title("SendSafe (dev)")
                        .inner_size(1100.0, 800.0)
                        .min_inner_size(640.0, 480.0);
                    #[cfg(target_os = "macos")]
                    let b = b.title_bar_style(TitleBarStyle::Overlay).hidden_title(true).traffic_light_position(tauri::LogicalPosition::new(16.0, 18.0));
                    b.build()?;
                    return Ok(());
                }
            }

            let data_dir = app.path().app_data_dir()?.join("sendsafe");
            migrate_legacy_data(&data_dir);
            std::fs::create_dir_all(&data_dir)?;
            let server_entry = app.path().resource_dir()?.join("server/server/index.mjs");

            let port = free_port();
            let notify_token = random_token();
            let (_rx, child) = handle
                .shell()
                .sidecar("node")?
                .arg(server_entry)
                .env("NODE_ENV", "production")
                .env("HOST", "127.0.0.1")
                .env("NITRO_HOST", "127.0.0.1")
                .env("PORT", port.to_string())
                .env("NITRO_PORT", port.to_string())
                .env("SENDSAFE_DATA_DIR", data_dir)
                .env("SENDSAFE_TRUST_PROXY", "1")
                .env("SENDSAFE_NOTIFY_TOKEN", &notify_token)
                .env("SENDSAFE_RELAY_URL", option_env!("SENDSAFE_RELAY_URL").unwrap_or(""))
                .spawn()?;
            app.manage(Server(Mutex::new(Some(child))));
            let notify_handle = handle.clone();

            // Open the window right away on a splash page (same look as the app's own loading screen), then hand over once the server is up.
            let b = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("splash.html".into()))
                .title("SendSafe")
                .background_color(tauri::window::Color(255, 255, 255, 255))
                .visible(!hidden)
                .inner_size(1100.0, 800.0)
                .min_inner_size(640.0, 480.0);
            #[cfg(target_os = "macos")]
            let b = b.title_bar_style(TitleBarStyle::Overlay).hidden_title(true).traffic_light_position(tauri::LogicalPosition::new(16.0, 18.0));
            b.build()?;

            std::thread::spawn(move || {
                let ready = wait_for(port, Duration::from_secs(30));
                let Some(w) = handle.get_webview_window("main") else { return };
                if ready {
                    watch_inbox(notify_handle, port, notify_token);
                    let _ = w.eval(&format!("window.location.replace('http://127.0.0.1:{port}/')"));
                } else {
                    let _ = w.eval("document.getElementById('msg').textContent = 'Could not start. Quit SendSafe and open it again.'");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building app");

    app.run(|handle, event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            show_main(handle);
        }
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<Server>() {
                if let Some(child) = state.0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        }
    });
}
