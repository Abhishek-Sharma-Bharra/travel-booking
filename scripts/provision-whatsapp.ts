import "dotenv/config";
import { provisionChannel } from "../src/lib/messaging/service";
import { db } from "../src/lib/db";
async function main() {
  const [agencyId, wabaId, phoneId] = process.argv.slice(2);
  if (!agencyId || !wabaId || !phoneId || !process.env.WHATSAPP_ACCESS_TOKEN)
    throw Error(
      "Provide agency, authorized WABA and phone IDs; provision token privately in the environment.",
    );
  await provisionChannel(
    agencyId,
    wabaId,
    phoneId,
    process.env.WHATSAPP_ACCESS_TOKEN,
  );
  console.log("Channel provisioned disabled. No message sent.");
}
main()
  .catch(() => {
    console.error(
      "WhatsApp provisioning failed. Check approval, provider permissions and private configuration. No credentials printed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
