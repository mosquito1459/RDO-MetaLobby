#!/usr/bin/env node
// RDO-MetaLobby central room server — zero dependencies, Node 18+.
// In-memory room directory with a 90s liveness window (hosts heartbeat every
// 30s); persists a JSON snapshot so rooms survive restarts while hosts keep
// pinging. Run: PORT=8787 node server.mjs

import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const TTL_MS = Number(process.env.TTL_MS || 90_000); // rooms expire without a heartbeat
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 200); // ponytail: hard cap against room spam; raise if needed
// ponytail: per-IP because hostClientId is client-supplied and spoofable.
const MAX_ROOMS_PER_IP = 10;
const SNAPSHOT_PATH =
  process.env.SNAPSHOT_PATH ||
  join(dirname(fileURLToPath(import.meta.url)), "rooms.json");

/** @typedef {{ id: string, roomName: string, description: string, sessionKey: string, isLocked: boolean, roomPasswordHash: string | null, hostClientId: string, hostSecret: string, ip: string, lastPing: number, createdAt: number }} Room */

/** id -> Room */
const rooms = new Map();

// Best-effort snapshot restore: only well-formed entries (first run or a
// corrupt/hand-edited file => start clean rather than brick every request).
try {
  const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  for (const r of raw)
    if (
      r &&
      typeof r.id === "string" &&
      typeof r.sessionKey === "string" &&
      typeof r.lastPing === "number" &&
      typeof r.createdAt === "number"
    )
      rooms.set(r.id, r);
  console.log(`restored ${rooms.size} room(s) from snapshot`);
} catch {
  /* no snapshot yet */
}

let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(SNAPSHOT_PATH, JSON.stringify([...rooms.values()]));
      // The file holds every room's bearer secret — keep it private.
      chmodSync(SNAPSHOT_PATH, 0o600);
    } catch (e) {
      console.error("snapshot write failed:", e.message);
    }
  }, 250);
};

/** Drop expired rooms, return the live map. */
const alive = () => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, r] of rooms) if (r.lastPing < cutoff) rooms.delete(id);
  return rooms;
};

const json = (res, status, body) => {
  res.writeHead(status, {
    "content-type": "application/json",
    // The Tauri webview runs on its own origin — allow it (and browsers).
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 16_384) {
        req.destroy(); // cap request size
        resolve(""); // still settle so the handler answers (400/404) instead of hanging
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });

const parseBody = async (req) => {
  const body = await readBody(req);
  try {
    return JSON.parse(body || "{}");
  } catch {
    return null;
  }
};

/**
 * Public view of a room: never hostSecret/ip or the PIN hash. Locked rooms
 * hide their session key from everyone but the owner (matched by clientId).
 */
const toPub = (room, clientId = null) => {
  const own = clientId !== null && room.hostClientId === clientId;
  const { hostSecret, ip, roomPasswordHash, ...pub } = room;
  return {
    ...pub,
    roomPasswordHash: null, // hash stays server-side; the PIN check runs there
    sessionKey: room.isLocked && !own ? "" : pub.sessionKey,
    lastPing: new Date(room.lastPing).toISOString(),
    createdAt: new Date(room.createdAt).toISOString(),
  };
};

/** Parse the host secret from ?secret= (fallback) or the JSON body. */
const readSecret = async (url, req) => {
  const fromQuery = url.searchParams.get("secret");
  if (fromQuery) return fromQuery;
  const body = await parseBody(req);
  return body ? String(body.hostSecret ?? "") : "";
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // ["rooms", id, ...]

    if (req.method === "OPTIONS") return json(res, 204, {});

    // GET /rooms — live rooms, newest first (?clientId= unlocks own locked keys)
    if (req.method === "GET" && url.pathname === "/rooms") {
      const clientId = url.searchParams.get("clientId");
      const list = [...alive().values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => toPub(r, clientId));
      return json(res, 200, list);
    }

    // POST /rooms — create a room, returns its host secret once
    if (req.method === "POST" && url.pathname === "/rooms") {
      const body = await parseBody(req);
      if (!body) return json(res, 400, { error: "invalid JSON body" });
      const roomName = String(body.roomName ?? "").trim().slice(0, 80);
      const sessionKey = String(body.sessionKey ?? "")
        .trim()
        .toUpperCase()
        .slice(0, 32);
      if (!roomName || !/^[A-Z0-9_-]+$/.test(sessionKey)) {
        return json(res, 400, {
          error: "roomName and a valid sessionKey (A-Z 0-9 - _) are required",
        });
      }
      if (body.isLocked && !body.roomPasswordHash) {
        return json(res, 400, { error: "locked rooms require a password" });
      }
      const ip = req.socket.remoteAddress || "unknown";
      const live = [...alive().values()];
      if (live.length >= MAX_ROOMS) {
        return json(res, 429, { error: "room directory is full, try again later" });
      }
      if (live.filter((r) => r.ip === ip).length >= MAX_ROOMS_PER_IP) {
        return json(res, 429, { error: "too many rooms from your address" });
      }
      const now = Date.now();
      const room = {
        id: randomUUID(),
        roomName,
        description: String(body.description ?? "").slice(0, 300),
        sessionKey,
        isLocked: Boolean(body.isLocked),
        roomPasswordHash: body.isLocked
          ? String(body.roomPasswordHash)
          : null,
        hostClientId: String(body.hostClientId ?? "unknown").slice(0, 64),
        hostSecret: randomUUID(),
        ip,
        lastPing: now,
        createdAt: now,
      };
      rooms.set(room.id, room);
      save();
      return json(res, 201, {
        ...toPub(room, room.hostClientId),
        hostSecret: room.hostSecret,
      });
    }

    // POST /rooms/:id/ping — heartbeat (host secret required)
    if (req.method === "POST" && parts[0] === "rooms" && parts[2] === "ping") {
      const room = rooms.get(parts[1]);
      const secret = await readSecret(url, req);
      if (!room || room.hostSecret !== secret) {
        return json(res, 404, { error: "room not found" });
      }
      room.lastPing = Date.now();
      save();
      return json(res, 200, {});
    }

    // POST /rooms/:id/unlock — verify the PIN server-side, return the key on match
    if (req.method === "POST" && parts[0] === "rooms" && parts[2] === "unlock") {
      const room = rooms.get(parts[1]);
      if (!room) return json(res, 404, { error: "room not found" });
      if (!room.isLocked || !room.roomPasswordHash) {
        return json(res, 400, { error: "room is not locked" });
      }
      const body = await parseBody(req);
      if (!body) return json(res, 400, { error: "invalid JSON body" });
      const hash = createHash("sha256")
        .update(String(body.password ?? ""))
        .digest("hex");
      if (hash !== room.roomPasswordHash) {
        return json(res, 401, { error: "Wrong password." });
      }
      return json(res, 200, { sessionKey: room.sessionKey });
    }

    // DELETE /rooms/:id — stop hosting (host secret required)
    if (req.method === "DELETE" && parts[0] === "rooms" && parts.length === 2) {
      const room = rooms.get(parts[1]);
      const secret = await readSecret(url, req);
      if (!room || room.hostSecret !== secret) {
        return json(res, 404, { error: "room not found" });
      }
      rooms.delete(parts[1]);
      save();
      return json(res, 200, {});
    }

    return json(res, 404, { error: "not found" });
  } catch (e) {
    // Never let a bad request kill the connection without a response.
    json(res, 500, { error: e instanceof Error ? e.message : "internal error" });
  }
});

// Periodic sweep keeps the map tidy (and the snapshot fresh) without traffic.
setInterval(() => {
  alive();
  save();
}, 15_000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `RDO-MetaLobby room server listening on http://0.0.0.0:${PORT} (TTL ${TTL_MS / 1000}s)`,
  );
});
