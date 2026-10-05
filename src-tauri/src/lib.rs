// RDO-MetaLobby backend: switches Red Dead Online matchmaking by writing or
// removing `<game>/x64/data/startup.meta` (see payloads/startup.meta.xml).
//
// Protocol: a private lobby is the base XML with the session key appended
// DIRECTLY after the closing root tag — no whitespace or newline in between.

use serde::Serialize;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use sysinfo::System;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MARKER: &str = "</CDataFileMgr__ContentsOfDataFileXml>";
const GAME_EXE: &str = "RDR2.exe";
const BASE_XML_PAYLOAD: &str = include_str!("../payloads/startup.meta.xml");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LobbyStatus {
    pub is_private: bool,
    pub session_code: Option<String>,
}

fn lobby_file(game_path: &str) -> PathBuf {
    Path::new(game_path).join("x64").join("data").join("startup.meta")
}

#[tauri::command]
fn detect_game_path() -> Result<Option<String>, String> {
    const CANDIDATES: [&str; 3] = [
        r"C:\Program Files (x86)\Steam\steamapps\common\Red Dead Redemption 2",
        r"C:\Program Files\Epic Games\RedDeadRedemption2",
        r"C:\Program Files\Rockstar Games\Red Dead Redemption 2",
    ];
    Ok(CANDIDATES
        .iter()
        .map(PathBuf::from)
        .find(|dir| dir.join(GAME_EXE).is_file())
        .map(|dir| dir.to_string_lossy().into_owned()))
}

#[tauri::command]
fn browse_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(path) = picked else {
        return Ok(None);
    };
    let dir = path.into_path().map_err(|e| e.to_string())?;
    if !dir.join(GAME_EXE).is_file() {
        return Err(format!(
            "Selected folder does not contain {GAME_EXE} — is this the RDR2 install directory?"
        ));
    }
    Ok(Some(dir.to_string_lossy().into_owned()))
}

#[tauri::command]
fn check_lobby_status(game_path: String) -> Result<LobbyStatus, String> {
    let Ok(content) = fs::read_to_string(lobby_file(&game_path)) else {
        // No file (or unreadable) => Rockstar public matchmaking.
        return Ok(LobbyStatus {
            is_private: false,
            session_code: None,
        });
    };
    let code = content
        .split_once(MARKER)
        .map(|(_, rest)| rest.trim().to_string())
        .filter(|s| !s.is_empty());
    Ok(LobbyStatus {
        is_private: true,
        session_code: code,
    })
}

#[tauri::command]
fn apply_public_lobby(game_path: String) -> Result<(), String> {
    match fs::remove_file(lobby_file(&game_path)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Trim, uppercase, then enforce ^[A-Z0-9_-]+$.
fn sanitize_session_code(raw: &str) -> Result<String, String> {
    let code = raw.trim().to_uppercase();
    if code.is_empty() {
        return Err("Session code must not be empty.".into());
    }
    if !code
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(
            "Session code may only contain letters, numbers, hyphens and underscores.".into(),
        );
    }
    Ok(code)
}

#[tauri::command]
fn apply_private_lobby(game_path: String, session_code: String) -> Result<(), String> {
    let code = sanitize_session_code(&session_code)?;
    let dir = Path::new(&game_path).join("x64").join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // The session key must sit flush against the closing root tag.
    fs::write(dir.join("startup.meta"), format!("{}{}", BASE_XML_PAYLOAD.trim_end(), code))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn is_game_running() -> Result<bool, String> {
    let mut sys = System::new();
    sys.refresh_processes();
    Ok(sys
        .processes()
        .values()
        .any(|p| p.name().eq_ignore_ascii_case(GAME_EXE)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_game_path,
            browse_folder,
            check_lobby_status,
            apply_public_lobby,
            apply_private_lobby,
            is_game_running,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_ends_flush_with_marker() {
        assert!(BASE_XML_PAYLOAD.trim_end().ends_with(MARKER));
    }

    #[test]
    fn sanitize_trims_and_uppercases() {
        assert_eq!(sanitize_session_code(" outlaw-9921 ").unwrap(), "OUTLAW-9921");
    }

    #[test]
    fn sanitize_rejects_invalid() {
        assert!(sanitize_session_code("").is_err());
        assert!(sanitize_session_code("   ").is_err());
        assert!(sanitize_session_code("BAD CHAR").is_err());
        assert!(sanitize_session_code("no/slashes").is_err());
        assert!(sanitize_session_code("OUTLAW-9921").is_ok());
        assert!(sanitize_session_code("SOLO_9821-X").is_ok());
    }
}
