const defaultUrl = () => {
  if (import.meta.env?.VITE_PVP_URL) return import.meta.env.VITE_PVP_URL;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (local && location.port !== "8787") return `${protocol}//${location.hostname}:8787`;
  return `${protocol}//${location.host}`;
};

export class NetClient {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.socket = null;
    this.id = null;
    this.status = "offline";
    this.killLimit = 15;
    this.lastSend = 0;
    this.sendInterval = 1 / 20;
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(identity, url = defaultUrl()) {
    this.disconnect();
    this.setStatus("connecting");
    return new Promise((resolve, reject) => {
      let socket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        this.setStatus("error");
        reject(error);
        return;
      }
      this.socket = socket;
      const timeout = setTimeout(() => {
        if (this.status !== "online") {
          socket.close();
          this.setStatus("error");
          reject(new Error("Connection timed out"));
        }
      }, 6000);

      socket.addEventListener("open", () => {
        this.send({ t: "join", name: identity.name, weapon: identity.weapon, skin: identity.skin });
      });

      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.t === "welcome") {
          clearTimeout(timeout);
          this.id = message.id;
          this.killLimit = message.killLimit ?? 15;
          this.setStatus("online");
          resolve(message);
        }
        this.handle(message);
      });

      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (this.status === "online") this.setStatus("offline");
        this.callbacks.onClose?.();
      });

      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        this.setStatus("error");
        reject(new Error("Unable to reach the PvP relay"));
      });
    });
  }

  handle(message) {
    switch (message.t) {
      case "joined":
        this.callbacks.onJoined?.(message.player);
        break;
      case "left":
        this.callbacks.onLeft?.(message.id);
        break;
      case "snapshot":
        this.callbacks.onSnapshot?.(message.players);
        break;
      case "shot":
        this.callbacks.onShot?.(message);
        break;
      case "damaged":
        this.callbacks.onDamaged?.(message);
        break;
      case "kill":
        this.callbacks.onKill?.(message);
        break;
      case "matchEnd":
        this.callbacks.onMatchEnd?.(message);
        break;
      case "round":
        this.callbacks.onRound?.(message);
        break;
      default:
        break;
    }
  }

  setStatus(status) {
    this.status = status;
    this.callbacks.onStatus?.(status);
  }

  send(message) {
    if (this.connected) this.socket.send(JSON.stringify(message));
  }

  sendState(elapsed, player) {
    if (!this.connected || elapsed - this.lastSend < this.sendInterval) return;
    this.lastSend = elapsed;
    this.send({
      t: "state",
      p: [
        Number(player.position.x.toFixed(2)),
        Number(player.position.y.toFixed(2)),
        Number(player.position.z.toFixed(2)),
      ],
      y: Number(player.yaw.toFixed(3)),
      c: player.crouching,
      s: player.sprinting,
      a: player.alive,
    });
  }

  sendShot(origin, end) {
    this.send({
      t: "shot",
      o: [origin.x, origin.y, origin.z].map((value) => Number(value.toFixed(2))),
      e: [end.x, end.y, end.z].map((value) => Number(value.toFixed(2))),
    });
  }

  sendHit(id, damage, headshot) {
    this.send({ t: "hit", id, d: Number(damage.toFixed(1)), h: headshot });
  }

  sendDeath(by) {
    this.send({ t: "death", by });
  }

  sendRespawn(position) {
    this.send({ t: "respawn", p: [position.x, position.y, position.z] });
  }

  disconnect() {
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.id = null;
    this.setStatus("offline");
  }
}
