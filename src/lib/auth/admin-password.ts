import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
const keyLength = 64;
const defaultParameters = { N: 16_384, r: 8, p: 1 } as const;
const maxmem = 64 * 1_024 * 1_024;

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  parameters: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      length,
      { ...parameters, maxmem },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export const DUMMY_ADMIN_PASSWORD_HASH =
  "scrypt$16384$8$1$bWVzdGUtYWRtaW4tZHVtbXktc2FsdC0yMDI2$Ad-cmtyCS3aabLKUd0MhnmqxJ9Nk5u-gIikP404BgvpvTGkyT_VKHEduCTyHICMZdH-82Jrt_0gMlj94-Lju9w";

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(24);
  const derived = await deriveKey(
    password,
    salt,
    keyLength,
    defaultParameters,
  );

  return [
    "scrypt",
    defaultParameters.N,
    defaultParameters.r,
    defaultParameters.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyAdminPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash, ...extra] =
    encodedHash.split("$");
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (
    algorithm !== "scrypt" ||
    extra.length > 0 ||
    !rawSalt ||
    !rawHash ||
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N < 2 ||
    r < 1 ||
    p < 1
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(rawHash, "base64url");
    const actual = await deriveKey(
      password,
      Buffer.from(rawSalt, "base64url"),
      expected.length,
      { N, r, p },
    );

    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
