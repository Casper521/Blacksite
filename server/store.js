import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE ?? join(here, "data", "accounts.json");

let cache = null;
let writeQueue = Promise.resolve();

async function read() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch {
    cache = { users: {} };
  }
  return cache;
}

function persist() {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    const temporary = `${DATA_FILE}.tmp`;
    await writeFile(temporary, JSON.stringify(cache, null, 2));
    await rename(temporary, DATA_FILE);
  }).catch((error) => console.error("Failed to persist accounts:", error.message));
  return writeQueue;
}

export async function findUser(predicate) {
  const data = await read();
  return Object.values(data.users).find(predicate) ?? null;
}

export async function getUser(id) {
  const data = await read();
  return data.users[id] ?? null;
}

export async function saveUser(user) {
  const data = await read();
  data.users[user.id] = user;
  await persist();
  return user;
}
