# RDO-MetaLobby

Desktop lobby switcher for **Red Dead Online (PC)** — toggle between Rockstar public
sessions and private lobbies by injecting/removing `startup.meta`, plus a live
community room directory backed by your own room server.

## How it works

The game engine reads `<RDR2_INSTALL_DIR>\x64\data\startup.meta` only at startup:

- **Public lobby** — the file is deleted (vanilla matchmaking).
- **Private lobby** — the base XML is written with the session key appended **flush**
  against the closing `</CDataFileMgr__ContentsOfDataFileXml>` tag, e.g.
  `</CDataFileMgr__ContentsOfDataFileXml>OUTLAW-9921`. Keys are trimmed, uppercased
  and validated against `^[A-Z0-9_-]+$`.

While `RDR2.exe` is running, changes only take effect after a game restart — the app
warns about this in the header.

## Setup

Prerequisites: Node 20+, Rust (MSVC toolchain on Windows), WebView2.

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # production bundle
```

### Room server (community directory, optional)

The directory is a tiny zero-dependency Node server (`server/server.mjs`, Node 18+).
On your server machine:

```bash
node server/server.mjs          # PORT=8787 by default
```

Rooms live in memory (200-room cap), hosts heartbeat every 30s, rooms unpinged for
90s are pruned, and a snapshot file (`server/rooms.json`) survives restarts. Open
the port in your firewall; no domain or HTTPS needed.

Then copy `.env.example` to `.env` and point the app at it:

```
VITE_ROOMS_URL=http://your-server-ip:8787
```

Without this the Quick Switcher works fully offline; the Community tab shows a
setup notice instead. Run `node server/smoke.mjs` to smoke-test the server.

## Layout

| Path | Purpose |
| --- | --- |
| `src-tauri/src/lib.rs` | Tauri commands: path detection, `startup.meta` read/write/delete, process check |
| `src-tauri/payloads/startup.meta.xml` | Base XML template (byte-exact), embedded at compile time |
| `src/lib/commands.ts` | Typed `invoke` wrappers for the Rust commands |
| `src/lib/rooms.ts` | Room subscription (5s polling), hosting heartbeat, PIN hashing |
| `src/lib/backend.ts` | Fetch client for the room server API |
| `server/server.mjs` | Central room server (zero deps, Node 18+) |
| `src/*.tsx` | Header, status card, tabs |
