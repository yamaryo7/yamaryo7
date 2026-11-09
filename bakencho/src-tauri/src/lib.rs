use tauri_plugin_sql::{Migration, MigrationKind};

/// SQLite のファイル名。保存先はOSのアプリ設定フォルダ
/// （Windows: %APPDATA%\jp.bakencho.app、macOS: ~/Library/Application Support/jp.bakencho.app）
const DB_URL: &str = "sqlite:bakencho.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "init",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("馬券帳の起動に失敗しました");
}
