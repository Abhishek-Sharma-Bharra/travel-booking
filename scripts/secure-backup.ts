import "dotenv/config";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  rename,
  stat,
  writeFile,
  mkdtemp,
  rm,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import {
  encryptedBackup,
  decryptBackup,
} from "../src/lib/operator/backup-crypto";
const secret = process.env.BACKUP_ENCRYPTION_KEY || "";
function pgEnvironment(urlText: string) {
  const u = new URL(urlText),
    local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGSSLMODE: local ? "disable" : "verify-full",
    ...(!local ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT || "system" } : {}),
  };
}
function pgCommand(
  tool: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const docker = process.env.BACKUP_PG_MODE !== "native";
  const child = docker
    ? spawn(
        "docker",
        [
          "run",
          "--rm",
          "-i",
          ...(tool === "pg_dump" || args.includes("--dbname")
            ? [
                "--network",
                "host",
                "--env",
                "PGHOST",
                "--env",
                "PGPORT",
                "--env",
                "PGUSER",
                "--env",
                "PGPASSWORD",
                "--env",
                "PGDATABASE",
                "--env",
                "PGSSLMODE",
                "--env",
                "PGSSLROOTCERT",
              ]
            : ["--network", "none"]),
          "postgres:17",
          tool,
          ...args,
        ],
        { env, stdio: ["pipe", "pipe", "pipe"] },
      )
    : spawn(tool, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  child.stderr.resume();
  const completion = new Promise<void>((resolve, reject) => {
    child.once("error", () =>
      reject(
        new Error(
          `Could not start ${tool}. Install PostgreSQL 17 tools or enable Docker.`,
        ),
      ),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${tool} failed. Check database reachability, credentials and verified TLS configuration.`,
            ),
          ),
    );
  });
  // Attach immediately so a failed process cannot become an unhandled rejection while streams drain.
  void completion.catch(() => {});
  return { child, completion };
}
async function checksum(file: string) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
async function verify(file: string, plain: string) {
  await decryptBackup(file, plain, secret);
  const { child, completion } = pgCommand("pg_restore", ["--list"]);
  child.stdout.resume();
  await Promise.all([
    pipeline(createReadStream(plain), child.stdin).catch((e) => {
      if ((e as NodeJS.ErrnoException).code !== "EPIPE") throw e;
    }),
    completion,
  ]);
}
async function main() {
  if (secret === process.env.BETTER_AUTH_SECRET)
    throw new Error("Use a backup key separate from BETTER_AUTH_SECRET.");
  if (secret.length < 32)
    throw new Error(
      "Set a separate BACKUP_ENCRYPTION_KEY of at least 32 random characters in secure environment settings. Never commit or print it.",
    );
  const mode = process.argv[2] || "create";
  if (mode === "create") {
    const url = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
    if (!url)
      throw new Error(
        "Set BACKUP_DATABASE_URL to the external database URL for an operator backup.",
      );
    const folder = resolve(
      process.env.BACKUP_DIRECTORY || ".local/secure-backups",
    );
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const file = join(
        folder,
        `travelos-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}.dump.enc`,
      ),
      partial = file + ".partial";
    const { child, completion } = pgCommand(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl"],
      pgEnvironment(url),
    );
    child.stdin.end();
    try {
      await Promise.all([
        pipeline(
          encryptedBackup(child.stdout, secret),
          createWriteStream(partial, { flags: "wx", mode: 0o600 }),
        ),
        completion,
      ]);
      await rename(partial, file);
    } catch (e) {
      child.kill();
      await rm(partial, { force: true });
      throw e;
    }
    const temp = await mkdtemp(join(tmpdir(), "travelos-backup-"));
    try {
      await verify(file, join(temp, "verified.dump"));
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
    await writeFile(
      file + ".json",
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          encryption: "AES-256-GCM / scrypt",
          bytes: (await stat(file)).size,
          sha256: await checksum(file),
          format: "PostgreSQL custom dump",
          authenticatedAndListed: true,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    console.log(`Encrypted backup verified: ${file}`);
    console.log(
      "Copy the encrypted backup and manifest to private offsite storage. Store the key separately. This command does not schedule backups.",
    );
  } else {
    const file = resolve(process.argv[3] || "");
    if (!process.argv[3])
      throw new Error("Supply the encrypted backup file path.");
    const manifest = JSON.parse(await readFile(file + ".json", "utf8"));
    if ((await checksum(file)) !== manifest.sha256)
      throw new Error("Backup checksum mismatch. No restore was attempted.");
    const temp = await mkdtemp(join(tmpdir(), "travelos-restore-"));
    try {
      const plain = join(temp, "verified.dump");
      await verify(file, plain);
      if (mode === "verify") {
        console.log(
          "Backup authenticated, checksum matched and PostgreSQL archive parsed. A full restore still needs testing.",
        );
        return;
      }
      if (mode !== "restore-test")
        throw new Error("Choose create, verify or restore-test.");
      const url = new URL(process.env.DATABASE_URL || "");
      if (!["localhost", "127.0.0.1"].includes(url.hostname))
        throw new Error(
          "Restore-test only targets a separate database on a local development server. Configure that server in DATABASE_URL; production is never overwritten.",
        );
      const name = "travelos_restore_" + randomBytes(8).toString("hex"),
        admin = new pg.Client({ connectionString: url.href });
      await admin.connect();
      let created = false;
      try {
        await admin.query(`CREATE DATABASE "${name}"`);
        created = true;
        const target = new URL(url);
        target.pathname = "/" + name;
        const { child, completion } = pgCommand(
          "pg_restore",
          ["--dbname", name, "--no-owner", "--no-acl"],
          pgEnvironment(target.href),
        );
        child.stdout.resume();
        await Promise.all([
          pipeline(createReadStream(plain), child.stdin),
          completion,
        ]);
        const probe = new pg.Client({ connectionString: target.href });
        await probe.connect();
        try {
          const result = await probe.query(
            'SELECT (SELECT count(*) FROM "Agency") AS agencies,(SELECT count(*) FROM "Lead") AS enquiries,(SELECT count(*) FROM "Booking") AS bookings,(SELECT count(*) FROM "Transaction") AS ledger_entries',
          );
          console.log("Isolated restore verified:", result.rows[0]);
        } finally {
          await probe.end();
        }
      } finally {
        if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        await admin.end();
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Backup operation failed");
  process.exitCode = 1;
});
