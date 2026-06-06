import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { prisma } from "../db/prisma.js";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled in production.");
  }

  const passwordHash = await argon2.hash("OpenTube-demo-password-2026!");
  const demo = await prisma.user.upsert({
    where: { username: "demo" },
    update: {},
    create: {
      username: "demo",
      email: "demo@example.test",
      passwordHash,
      channelDescription: "A demo OpenTube channel. Upload real video files to populate the archive.",
      channelCustomization: {
        backgroundColor: "#ffffff",
        textColor: "#333333",
        linkColor: "#0033cc"
      }
    }
  });

  await prisma.siteSetting.upsert({
    where: { key: "tagline" },
    update: { value: "Broadcast Yourself, Openly." },
    create: { key: "tagline", value: "Broadcast Yourself, Openly." }
  });

  console.log(`Demo user ready: ${demo.username} / OpenTube-demo-password-2026!`);
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
