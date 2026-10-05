// Smoke test for the room server: spawns it on a scratch port, exercises every
// endpoint, asserts the protocol (secrets, lock hiding, unlock, caps, expiry).
// Run: node smoke.mjs

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const TTL_MS = 1500; // short TTL so the expiry test finishes fast
const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), "smoke-rooms.json");

const server = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "server.mjs")], {
  env: { ...process.env, PORT: String(PORT), SNAPSHOT_PATH: SNAPSHOT, TTL_MS: String(TTL_MS) },
  stdio: ["ignore", "inherit", "inherit"],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/rooms`);
      if (res.ok) return res;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error("server did not start");
}

const req = (method, path, body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

// Raw-body variant: exercises the server's JSON parse rejection.
const rawReq = (method, path, raw) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: raw,
  });

let failed = 0;
const expect = (cond, label, extra = "") => {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failed++;
    console.error(`FAIL  ${label} ${extra}`);
  }
};

try {
  await waitForServer();

  // Empty directory
  let res = await req("GET", "/rooms");
  expect(res.status === 200 && (await res.json()).length === 0, "GET /rooms starts empty");

  // Reject invalid payloads
  res = await req("POST", "/rooms", { roomName: "", sessionKey: "BAD KEY!" });
  expect(res.status === 400, "create rejects empty name / bad key");
  res = await rawReq("POST", "/rooms", "not json");
  expect(res.status === 400, "create rejects malformed JSON");
  res = await req("POST", "/rooms", {
    roomName: "Broken Lock",
    sessionKey: "NOHASH-1",
    isLocked: true,
    roomPasswordHash: null,
  });
  expect(res.status === 400, "create rejects locked room without a password");

  // Create an open room
  res = await req("POST", "/rooms", {
    roomName: "Outlaws",
    description: "open room",
    sessionKey: "outlaw-9921",
    isLocked: false,
    roomPasswordHash: null,
    hostClientId: "client-a",
  });
  const open = await res.json();
  expect(res.status === 201, "create open room -> 201");
  expect(typeof open.hostSecret === "string" && open.hostSecret.length > 10, "create returns hostSecret");
  expect(open.sessionKey === "OUTLAW-9921", "sessionKey normalized to uppercase");
  expect(typeof open.lastPing === "string" && open.lastPing.endsWith("Z"), "timestamps are ISO strings");

  // Create a locked room
  res = await req("POST", "/rooms", {
    roomName: "Secret Posse",
    sessionKey: "SECRET-1",
    isLocked: true,
    roomPasswordHash: "deadbeef",
    hostClientId: "client-b",
  });
  const locked = await res.json();
  expect(res.status === 201 && locked.isLocked, "create locked room -> 201");

  // Directory view: no secret/ip/hash leak, newest first, locked keys hidden
  res = await req("GET", "/rooms");
  const list = await res.json();
  expect(list.length === 2, "GET /rooms lists both rooms");
  expect(list.every((r) => r.hostSecret === undefined), "GET /rooms never leaks hostSecret");
  expect(list.every((r) => r.ip === undefined), "GET /rooms never leaks the host IP");
  expect(list.every((r) => r.roomPasswordHash === null), "GET /rooms never leaks the PIN hash");
  expect(list[0].roomName === "Secret Posse", "GET /rooms sorts newest first");
  const lockedRow = list.find((r) => r.id === locked.id);
  expect(lockedRow.sessionKey === "", "locked room hides its session key from strangers");

  // Owner view: own locked room keeps its key
  res = await req("GET", "/rooms?clientId=client-b");
  const ownList = await res.json();
  expect(
    ownList.find((r) => r.id === locked.id).sessionKey === "SECRET-1",
    "owner (matching clientId) sees their locked room's key",
  );
  expect(
    ownList.find((r) => r.id === open.id).sessionKey === "OUTLAW-9921",
    "open rooms keep their key for everyone",
  );

  // Heartbeat: wrong secret rejected, right secret accepted
  res = await req("POST", `/rooms/${open.id}/ping`, { hostSecret: "wrong" });
  expect(res.status === 404, "ping with wrong secret -> 404");
  res = await req("POST", `/rooms/${open.id}/ping`, { hostSecret: open.hostSecret });
  expect(res.status === 200, "ping with right secret -> 200");

  // Unlock: unknown room, wrong PIN — then a properly hashed room for the 200 path
  res = await req("POST", "/rooms/does-not-exist/unlock", { password: "x" });
  expect(res.status === 404, "unlock unknown room -> 404");
  res = await req("POST", `/rooms/${locked.id}/unlock`, { password: "wrong" });
  expect(res.status === 401, "unlock with wrong PIN -> 401");
  const realHash = (
    await import("node:crypto")
  ).createHash("sha256").update("letmein").digest("hex");
  res = await req("POST", "/rooms", {
    roomName: "Unlockable",
    sessionKey: "UNLOCK-1",
    isLocked: true,
    roomPasswordHash: realHash,
    hostClientId: "client-c",
  });
  const unlockable = await res.json();
  res = await req("POST", `/rooms/${unlockable.id}/unlock`, { password: "nope" });
  expect(res.status === 401, "unlock with wrong PIN -> 401");
  res = await req("POST", `/rooms/${unlockable.id}/unlock`, { password: "letmein" });
  expect(res.status === 200 && (await res.json()).sessionKey === "UNLOCK-1", "unlock with right PIN returns the key");

  // Delete: wrong secret rejected, right secret (in the body, like the client) removes the room
  res = await req("DELETE", `/rooms/${unlockable.id}?secret=nope`);
  expect(res.status === 404, "delete with wrong secret -> 404");
  res = await req("DELETE", `/rooms/${unlockable.id}`, { hostSecret: unlockable.hostSecret });
  expect(res.status === 200, "delete with right secret (body) -> 200");
  res = await req("GET", "/rooms");
  expect((await res.json()).length === 2, "deleted room is gone");

  // Per-IP cap: 3 live rooms already from this address — the loop fills up to 10, then 429
  let saw429 = false;
  for (let i = 0; i < 15 && !saw429; i++) {
    const r = await req("POST", "/rooms", {
      roomName: `Filler ${i}`,
      sessionKey: `FILL-${i}`,
      isLocked: false,
      roomPasswordHash: null,
      hostClientId: "client-spam",
    });
    if (r.status === 429) saw429 = true;
  }
  expect(saw429, "per-IP cap rejects the 11th live room from one address");

  // TTL expiry: nothing has been pinged since creation — after TTL + margin, all gone
  await sleep(TTL_MS + 300);
  res = await req("GET", "/rooms");
  expect((await res.json()).length === 0, "rooms expire after TTL without heartbeats");

  console.log(failed === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failed})`);
} catch (e) {
  console.error("SMOKE ERROR:", e.message);
  failed++;
} finally {
  server.kill();
  try {
    rmSync(SNAPSHOT);
  } catch {
    /* nothing to clean */
  }
}

process.exit(failed === 0 ? 0 : 1);
