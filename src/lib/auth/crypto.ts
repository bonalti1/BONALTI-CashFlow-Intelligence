import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scryptKeyLength = 64;
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, scryptKeyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, scryptOptions);

  return [
    "scrypt",
    scryptOptions.N,
    scryptOptions.r,
    scryptOptions.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) {
    return false;
  }

  const [scheme, n, r, p, saltText, keyText] = storedHash.split("$");

  if (scheme !== "scrypt" || !saltText || !keyText) {
    return false;
  }

  const expectedKey = Buffer.from(keyText, "base64url");
  const derivedKey = await scryptAsync(password, Buffer.from(saltText, "base64url"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: scryptOptions.maxmem,
  });

  return expectedKey.length === derivedKey.length && timingSafeEqual(expectedKey, derivedKey);
}

// Spend the same work on unknown emails so response time does not reveal which accounts exist.
export async function burnPasswordCheck(password: string) {
  await scryptAsync(password, randomBytes(16), scryptOptions);
}

export function createSecretToken(prefix = "") {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqualText(a: string, b: string) {
  const left = Buffer.from(hashToken(a));
  const right = Buffer.from(hashToken(b));

  return timingSafeEqual(left, right);
}
