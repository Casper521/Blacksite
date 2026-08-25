import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { findUser, getUser, saveUser } from "./store.js";

const scryptAsync = promisify(scrypt);
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SECRET = process.env.AUTH_SECRET ?? randomBytes(32).toString("hex");
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";

const base64url = (input) => Buffer.from(input).toString("base64url");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const httpError = (status, message) => new HttpError(status, message);
export { HttpError };

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const derived = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function createToken(userId) {
  const payload = base64url(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.exp > Date.now() ? decoded.sub : null;
  } catch {
    return null;
  }
}

const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  provider: user.provider,
});

function newUser({ email, name, provider, passwordHash = null, googleId = null }) {
  return {
    id: randomUUID(),
    email,
    name,
    provider,
    passwordHash,
    googleId,
    profile: null,
    createdAt: Date.now(),
  };
}

export async function register(email, password, callsign) {
  const address = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw httpError(400, "Enter a valid email address");
  if (String(password ?? "").length < 8) throw httpError(400, "Password must be at least 8 characters");
  if (await findUser((user) => user.email === address)) throw httpError(409, "That email is already registered");

  const user = newUser({
    email: address,
    name: (callsign || address.split("@")[0]).slice(0, 14).toUpperCase(),
    provider: "email",
    passwordHash: await hashPassword(password),
  });
  await saveUser(user);
  return { token: createToken(user.id), user: publicUser(user), profile: user.profile };
}

export async function login(email, password) {
  const address = normalizeEmail(email);
  const user = await findUser((candidate) => candidate.email === address);
  if (!user?.passwordHash || !(await verifyPassword(String(password ?? ""), user.passwordHash))) {
    throw httpError(401, "Incorrect email or password");
  }
  return { token: createToken(user.id), user: publicUser(user), profile: user.profile };
}

export async function loginWithGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) throw httpError(503, "Google sign-in is not configured on this server");
  if (!credential) throw httpError(400, "Missing Google credential");

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw httpError(401, "Google rejected that credential");
  const payload = await response.json();
  if (payload.aud !== GOOGLE_CLIENT_ID) throw httpError(401, "Google credential was issued for another app");
  if (payload.email_verified === "false") throw httpError(401, "That Google email is not verified");

  const address = normalizeEmail(payload.email);
  let user = await findUser((candidate) => candidate.googleId === payload.sub || candidate.email === address);
  if (!user) {
    user = newUser({
      email: address,
      name: (payload.given_name || address.split("@")[0]).slice(0, 14).toUpperCase(),
      provider: "google",
      googleId: payload.sub,
    });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
  }
  await saveUser(user);
  return { token: createToken(user.id), user: publicUser(user), profile: user.profile };
}

export async function currentSession(token) {
  const userId = verifyToken(token);
  if (!userId) throw httpError(401, "Session expired");
  const user = await getUser(userId);
  if (!user) throw httpError(401, "Account not found");
  return { user: publicUser(user), profile: user.profile };
}

export async function saveProfile(token, profile) {
  const userId = verifyToken(token);
  if (!userId) throw httpError(401, "Session expired");
  const user = await getUser(userId);
  if (!user) throw httpError(401, "Account not found");
  if (!profile || typeof profile !== "object") throw httpError(400, "Invalid profile payload");
  user.profile = { ...profile, updatedAt: Date.now() };
  await saveUser(user);
  return { profile: user.profile };
}
