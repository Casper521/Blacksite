import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import {
  GOOGLE_CLIENT_ID,
  currentSession,
  login,
  loginWithGoogle,
  register,
  saveProfile,
} from "./auth.js";
import { servePublic } from "./static.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const SNAPSHOT_HZ = 20;
const KILL_LIMIT = Number(process.env.KILL_LIMIT ?? 15);
const ROUND_RESET_DELAY = 6000;

/* ------------------------------- HTTP API ------------------------------- */

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

function respond(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", ...CORS });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error("Payload too large"));
    });
    request.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

const bearer = (request) => (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

const routes = {
  "POST /api/auth/register": async (request) => {
    const body = await readBody(request);
    return register(body.email, body.password, body.callsign);
  },
  "POST /api/auth/login": async (request) => {
    const body = await readBody(request);
    return login(body.email, body.password);
  },
  "POST /api/auth/google": async (request) => {
    const body = await readBody(request);
    return loginWithGoogle(body.credential);
  },
  "GET /api/auth/session": async (request) => currentSession(bearer(request)),
  "GET /api/config": async () => ({ googleClientId: GOOGLE_CLIENT_ID, killLimit: KILL_LIMIT }),
  "PUT /api/profile": async (request) => {
    const body = await readBody(request);
    return saveProfile(bearer(request), body.profile);
  },
  "GET /api/health": async () => ({ ok: true }),
};

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const handler = routes[`${request.method} ${url.pathname}`];
  if (!handler) {
    if (request.method === "GET" && servePublic(request, response)) return;
    respond(response, 404, { error: "Not found" });
    return;
  }

  try {
    respond(response, 200, await handler(request));
  } catch (error) {
    respond(response, error.status ?? 500, { error: error.message ?? "Server error" });
  }
});

/* ------------------------------ PvP relay ------------------------------ */

const wss = new WebSocketServer({ server });
const players = new Map();
let mapSeed = (Math.random() * 0xffffffff) >>> 0;
let roundOver = false;

const profile = (player) => ({
  id: player.id,
  name: player.name,
  weapon: player.weapon,
  skin: player.skin,
  score: player.score,
  deaths: player.deaths,
});

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message, exceptId) {
  const payload = JSON.stringify(message);
  for (const player of players.values()) {
    if (player.id === exceptId) continue;
    if (player.socket.readyState === player.socket.OPEN) player.socket.send(payload);
  }
}

const scoreboard = () => [...players.values()].map(profile).sort((a, b) => b.score - a.score);

function resetRound() {
  mapSeed = (Math.random() * 0xffffffff) >>> 0;
  roundOver = false;
  for (const player of players.values()) {
    player.score = 0;
    player.deaths = 0;
  }
  broadcast({ t: "round", seed: mapSeed, players: scoreboard() });
}

wss.on("connection", (socket) => {
  const id = randomUUID().slice(0, 8);
  const player = {
    id,
    socket,
    name: `OPERATOR-${id.slice(0, 4).toUpperCase()}`,
    weapon: "ar-vector",
    skin: "standard",
    score: 0,
    deaths: 0,
    alive: true,
    position: [0, 1.05, 0],
    yaw: 0,
    crouch: false,
    sprint: false,
  };

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.t) {
      case "join": {
        player.name = String(message.name ?? player.name).slice(0, 14).toUpperCase();
        player.weapon = String(message.weapon ?? player.weapon);
        player.skin = String(message.skin ?? player.skin);
        players.set(id, player);
        send(socket, {
          t: "welcome",
          id,
          seed: mapSeed,
          killLimit: KILL_LIMIT,
          players: [...players.values()].filter((other) => other.id !== id).map(profile),
        });
        broadcast({ t: "joined", player: profile(player) }, id);
        break;
      }
      case "state": {
        if (!players.has(id)) return;
        player.position = message.p ?? player.position;
        player.yaw = message.y ?? 0;
        player.crouch = Boolean(message.c);
        player.sprint = Boolean(message.s);
        player.alive = message.a !== false;
        break;
      }
      case "shot": {
        broadcast({ t: "shot", id, o: message.o, e: message.e }, id);
        break;
      }
      case "hit": {
        const victim = players.get(message.id);
        if (victim) send(victim.socket, { t: "damaged", by: id, d: message.d, h: Boolean(message.h) });
        break;
      }
      case "death": {
        const killer = players.get(message.by);
        player.deaths += 1;
        player.alive = false;
        if (killer && killer.id !== id) killer.score += 1;
        broadcast({
          t: "kill",
          killer: killer ? killer.id : null,
          killerName: killer ? killer.name : "THE ARENA",
          victim: id,
          victimName: player.name,
          players: scoreboard(),
        });
        if (killer && killer.score >= KILL_LIMIT && !roundOver) {
          roundOver = true;
          broadcast({ t: "matchEnd", winner: killer.id, winnerName: killer.name, players: scoreboard() });
          setTimeout(resetRound, ROUND_RESET_DELAY);
        }
        break;
      }
      case "respawn": {
        player.alive = true;
        player.position = message.p ?? player.position;
        break;
      }
      default:
        break;
    }
  });

  socket.on("close", () => {
    players.delete(id);
    broadcast({ t: "left", id });
  });

  socket.on("error", () => socket.close());
});

setInterval(() => {
  if (players.size === 0) return;
  broadcast({
    t: "snapshot",
    players: [...players.values()].map((player) => ({
      id: player.id,
      p: player.position,
      y: player.yaw,
      c: player.crouch,
      s: player.sprint,
      a: player.alive,
    })),
  });
}, 1000 / SNAPSHOT_HZ);

server.listen(PORT, HOST, () => {
  console.log(`Blacksite listening on http://${HOST}:${PORT} (site + API + PvP, first to ${KILL_LIMIT} kills)`);
  if (!GOOGLE_CLIENT_ID) console.log("Google sign-in disabled: set GOOGLE_CLIENT_ID to enable it.");
});
