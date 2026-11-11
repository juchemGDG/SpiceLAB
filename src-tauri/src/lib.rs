// Desktop-Hülle für SpiceLab: Sie öffnet ein Fenster mit der Web-App aus ../app und stellt
// Dateidialoge zum Speichern bereit (der WebView lädt Downloads nicht wie ein Browser).
// Die gesamte Logik steckt in der Web-App (app/js) – es gibt keinen zweiten Code-Stand.

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("SpiceLab konnte nicht gestartet werden");
}
