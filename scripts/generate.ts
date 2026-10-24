// Engine-free generation uses the exact Prisma npm packages pinned in package-lock.json.
// These artifacts retain npm integrity verification; no native download or checksum bypass.
import { getGenerators } from "@prisma/internals";
import { PrismaClientJsGenerator } from "@prisma/client-generator-js";
async function main() {
  const generators = await getGenerators({
    schemaPath: "prisma/schema.prisma",
    registry: {
      "prisma-client-js": {
        type: "in-process",
        generator: new PrismaClientJsGenerator({
          cliCommand: "npm run db:generate",
        }),
      },
    },
    cliCommand: "npm run db:generate",
  });
  try {
    for (const g of generators) await g.generate();
  } finally {
    for (const g of generators) g.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
