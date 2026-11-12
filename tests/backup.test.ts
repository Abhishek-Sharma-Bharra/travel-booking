import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encryptedBackup,
  decryptBackup,
} from "../src/lib/operator/backup-crypto";
test("encrypted backups authenticate the key and bytes before exposing a restorable archive", async () => {
  const folder = await mkdtemp(join(tmpdir(), "travelos-crypto-test-"));
  try {
    const file = join(folder, "backup.enc"),
      plain = join(folder, "plain.dump"),
      key = "fictional-test-encryption-key-at-least-32-characters",
      data = Buffer.from("PGDMP fictional test archive\n".repeat(1000));
    await pipeline(
      encryptedBackup(Readable.from([data]), key),
      createWriteStream(file),
    );
    assert.ok(
      !(await readFile(file)).includes(Buffer.from("fictional test archive")),
    );
    await decryptBackup(file, plain, key);
    assert.deepEqual(await readFile(plain), data);
    await assert.rejects(
      decryptBackup(
        file,
        join(folder, "wrong.dump"),
        "a-different-fictional-secret-at-least-32-characters",
      ),
      /authentication failed/,
    );
    await assert.rejects(access(join(folder, "wrong.dump")));
    const bytes = await readFile(file);
    bytes[50] ^= 1;
    await writeFile(file, bytes);
    await assert.rejects(
      decryptBackup(file, join(folder, "tampered.dump"), key),
      /authentication failed/,
    );
    await assert.rejects(access(join(folder, "tampered.dump")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
