import { pathToFileURL } from "node:url";
import { prisma } from "../db/prisma.js";
import { randomToken, sha256 } from "../utils/security.js";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const email = readArg("email")?.toLowerCase();
  if (!email) throw new Error("Usage: npm run create-reset-token -- --email user@example.com");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No user found for that email.");

  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });

  console.log(`Password reset token for ${user.email}: ${token}`);
  console.log("Token expires in 1 hour. Wire this into SMTP or a manual admin flow for production use.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
    .then(async () => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
