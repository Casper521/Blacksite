const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "blacksite-token";

export class Auth {
  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY) ?? null;
    this.user = null;
    this.googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
    this.listeners = new Set();
  }

  get signedIn() {
    return Boolean(this.token && this.user);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this);
  }

  async request(path, { method = "GET", body } = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
    return payload;
  }

  async loadConfig() {
    try {
      const config = await this.request("/config");
      if (config.googleClientId) this.googleClientId = config.googleClientId;
      return config;
    } catch {
      return null;
    }
  }

  accept({ token, user, profile }) {
    this.token = token;
    this.user = user;
    localStorage.setItem(TOKEN_KEY, token);
    this.emit();
    return profile ?? null;
  }

  async register(email, password, callsign) {
    return this.accept(await this.request("/auth/register", { method: "POST", body: { email, password, callsign } }));
  }

  async login(email, password) {
    return this.accept(await this.request("/auth/login", { method: "POST", body: { email, password } }));
  }

  async loginWithGoogle(credential) {
    return this.accept(await this.request("/auth/google", { method: "POST", body: { credential } }));
  }

  async restore() {
    if (!this.token) return null;
    try {
      const { user, profile } = await this.request("/auth/session");
      this.user = user;
      this.emit();
      return profile;
    } catch {
      this.logout();
      return null;
    }
  }

  async pushProfile(profile) {
    if (!this.signedIn) return;
    try {
      await this.request("/profile", { method: "PUT", body: { profile } });
    } catch (error) {
      console.warn("Could not sync progress:", error.message);
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem(TOKEN_KEY);
    this.emit();
  }

  // Google Identity Services is only fetched once a client id is known.
  async mountGoogleButton(container) {
    if (!this.googleClientId) return false;
    await new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Google sign-in"));
      document.head.appendChild(script);
    });
    window.google.accounts.id.initialize({
      client_id: this.googleClientId,
      callback: ({ credential }) => this.googleCallback?.(credential),
    });
    container.innerHTML = "";
    window.google.accounts.id.renderButton(container, {
      theme: "filled_black",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      width: 280,
    });
    return true;
  }
}
