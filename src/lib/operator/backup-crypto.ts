import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat, unlink } from "node:fs/promises";
const magic = Buffer.from("TVOS1"),
  headerSize = 33,
  tagSize = 16;
function key(secret: string, salt: Buffer) {
  if (secret.length < 32)
    throw new Error(
      "Use a separate BACKUP_ENCRYPTION_KEY with at least 32 random characters",
    );
  return scryptSync(secret, salt, 32);
}
export function encryptedBackup(source: Readable, secret: string): Readable {
  const salt = randomBytes(16),
    iv = randomBytes(12),
    header = Buffer.concat([magic, salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", key(secret, salt), iv);
  cipher.setAAD(header);
  return Readable.from(
    (async function* () {
      yield header;
      for await (const chunk of source) yield cipher.update(chunk);
      yield cipher.final();
      yield cipher.getAuthTag();
    })(),
  );
}
// Decryption is authenticated completely before the caller can pass the file to a database.
export async function decryptBackup(
  file: string,
  destination: string,
  secret: string,
) {
  const size = (await stat(file)).size;
  if (size < headerSize + tagSize + 1)
    throw new Error("Invalid encrypted backup");
  const handle = await open(file, "r");
  const header = Buffer.alloc(headerSize),
    tag = Buffer.alloc(tagSize);
  try {
    await handle.read(header, 0, headerSize, 0);
    await handle.read(tag, 0, tagSize, size - tagSize);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, 5).equals(magic))
    throw new Error("Unsupported backup format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret, header.subarray(5, 21)),
    header.subarray(21),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(file, { start: headerSize, end: size - tagSize - 1 }),
      decipher,
      createWriteStream(destination, { flags: "wx", mode: 0o600 }),
    );
  } catch {
    await unlink(destination).catch(() => {});
    throw new Error(
      "Backup authentication failed. No restore was attempted. Check the key and file integrity.",
    );
  }
}
