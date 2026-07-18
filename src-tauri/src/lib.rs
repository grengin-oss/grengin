mod chat_db;

use tauri::{Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const OAUTH_POPUP_LABEL: &str = "oauth-login";
const NATIVE_OAUTH_CALLBACK_EVENT: &str = "native-oauth-callback";
const NATIVE_OAUTH_SCHEME: &str = "com.grengin.community";
const MICROSOFT_OAUTH_SCHEME: &str = "msauth";
const MICROSOFT_OAUTH_HOST: &str = "com.grengin.community";

fn is_oauth_callback_url(url: &Url) -> bool {
    match url.scheme() {
        NATIVE_OAUTH_SCHEME => url.host_str() == Some("auth"),
        MICROSOFT_OAUTH_SCHEME => url.host_str() == Some(MICROSOFT_OAUTH_HOST),
        _ => false,
    }
}

#[tauri::command]
fn open_oauth_popup(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let auth_url = Url::parse(&url).map_err(|err| format!("Invalid OAuth URL: {err}"))?;

    if auth_url.scheme() != "https" && auth_url.scheme() != "http" {
        return Err("OAuth URL must use http or https".to_string());
    }

    if let Some(existing_popup) = app.get_webview_window(OAUTH_POPUP_LABEL) {
        #[cfg(mobile)]
        {
            return existing_popup
                .navigate(auth_url)
                .map_err(|err| format!("Failed to navigate OAuth popup: {err}"));
        }

        #[cfg(desktop)]
        {
            let _ = existing_popup.close();
        }
    }

    let app_for_navigation = app.clone();
    #[cfg(desktop)]
    let popup_label = OAUTH_POPUP_LABEL.to_string();

    let builder =
        WebviewWindowBuilder::new(&app, OAUTH_POPUP_LABEL, WebviewUrl::External(auth_url))
            .on_navigation(move |navigation_url| {
                if is_oauth_callback_url(navigation_url) {
                    let callback_url = navigation_url.as_str().to_string();
                    let _ = app_for_navigation.emit(NATIVE_OAUTH_CALLBACK_EVENT, callback_url);

                    #[cfg(desktop)]
                    {
                        if let Some(popup) = app_for_navigation.get_webview_window(&popup_label) {
                            let _ = popup.close();
                        }
                    }

                    return false;
                }

                true
            });

    #[cfg(desktop)]
    let builder = builder
        .title("Sign in to Grengin")
        .inner_size(520.0, 720.0)
        .min_inner_size(360.0, 560.0)
        .center()
        .resizable(true)
        .focused(true);

    builder
        .build()
        .map_err(|err| format!("Failed to open OAuth popup: {err}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(chat_db::CHAT_DB_URL, chat_db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_oauth_popup])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
