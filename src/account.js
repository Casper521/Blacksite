export class AccountPanel {
  constructor(auth, profile, callbacks = {}) {
    this.auth = auth;
    this.profile = profile;
    this.callbacks = callbacks;

    this.guest = document.querySelector("#account-guest");
    this.active = document.querySelector("#account-active");
    this.form = document.querySelector("#auth-form");
    this.email = document.querySelector("#auth-email");
    this.password = document.querySelector("#auth-password");
    this.registerButton = document.querySelector("#auth-register");
    this.signOutButton = document.querySelector("#auth-signout");
    this.statusLabel = document.querySelector("#auth-status");
    this.googleHost = document.querySelector("#google-button");
    this.googleNote = document.querySelector("#google-note");
    this.emailLabel = document.querySelector("#account-email");
    this.providerLabel = document.querySelector("#account-provider");
    this.syncLabel = document.querySelector("#account-sync");
    this.chip = document.querySelector("#account-chip");
    this.nameInput = document.querySelector("#account-name");
    this.callsignLabel = document.querySelector("#account-callsign");

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.run("Signing in…", () => auth.login(this.email.value, this.password.value));
    });
    this.registerButton.addEventListener("click", () => {
      this.run("Creating account…", () =>
        auth.register(this.email.value, this.password.value, this.nameInput.value || profile.data.callsign)
      );
    });
    this.signOutButton.addEventListener("click", () => {
      auth.logout();
      this.setStatus("Signed out. Progress stays on this device.");
    });
    this.nameInput.value = profile.data.callsign;
    const commitName = () => {
      profile.setCallsign(this.nameInput.value);
      this.nameInput.value = profile.data.callsign;
      this.render();
    };
    this.nameInput.addEventListener("change", () => {
      commitName();
      this.setStatus(`PvP name set to ${profile.data.callsign}`, "good");
    });
    this.nameInput.addEventListener("blur", commitName);
    profile.subscribe(() => {
      if (document.activeElement !== this.nameInput) this.nameInput.value = profile.data.callsign;
      this.render();
    });

    auth.googleCallback = (credential) => {
      this.run("Verifying Google account…", () => auth.loginWithGoogle(credential));
    };
    auth.subscribe(() => this.render());
    this.init();
  }

  async init() {
    await this.auth.loadConfig();
    if (this.auth.googleClientId) {
      try {
        await this.auth.mountGoogleButton(this.googleHost);
      } catch (error) {
        this.showGoogleNote(error.message);
      }
    } else {
      this.showGoogleNote(
        "Google sign-in is off until the server is started with a GOOGLE_CLIENT_ID. Email accounts work now."
      );
    }

    const profile = await this.auth.restore();
    if (profile) this.merge(profile);
  }

  showGoogleNote(message) {
    this.googleHost.classList.add("hidden");
    this.googleNote.textContent = message;
    this.googleNote.classList.remove("hidden");
  }

  setStatus(message, tone = "neutral") {
    this.statusLabel.textContent = message;
    this.statusLabel.dataset.tone = tone;
  }

  // The account with more progress wins so a fresh device never wipes a save.
  merge(remote) {
    const local = this.profile.data;
    const remoteScore = (remote.gems ?? 0) + (remote.kills ?? 0) * 25;
    const localScore = local.gems + local.kills * 25;
    if (remoteScore >= localScore) {
      this.profile.adopt({ ...remote, settings: local.settings });
      this.setStatus("Progress restored from your account.", "good");
    } else {
      this.profile.save();
      this.setStatus("Local progress uploaded to your account.", "good");
    }
  }

  async run(pending, action) {
    this.setStatus(pending);
    this.form.querySelectorAll("button, input").forEach((element) => (element.disabled = true));
    try {
      const profile = await action();
      if (profile) this.merge(profile);
      else {
        this.profile.save();
        this.setStatus("Account linked. Progress now syncs automatically.", "good");
      }
      this.password.value = "";
      this.callbacks.onSignedIn?.();
    } catch (error) {
      this.setStatus(error.message, "bad");
    } finally {
      this.form.querySelectorAll("button, input").forEach((element) => (element.disabled = false));
    }
  }

  render() {
    const signedIn = this.auth.signedIn;
    this.guest.classList.toggle("hidden", signedIn);
    this.active.classList.toggle("hidden", !signedIn);
    if (signedIn) {
      this.emailLabel.textContent = this.auth.user.email;
      this.providerLabel.textContent = this.auth.user.provider === "google" ? "GOOGLE" : "EMAIL";
      this.syncLabel.textContent = "Automatic";
      if (this.callsignLabel) this.callsignLabel.textContent = this.profile.data.callsign;
      this.chip.textContent = `${this.profile.data.callsign} · CLOUD SAVE`;
      this.chip.classList.remove("muted");
    } else {
      this.chip.textContent = `${this.profile.data.callsign} · SAVED ON THIS DEVICE`;
      this.chip.classList.add("muted");
    }
  }
}
