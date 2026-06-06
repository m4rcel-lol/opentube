import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { emailSchema, passwordSchema, usernameSchema } from "@opentube/shared";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { sanitizeText } from "../utils/sanitize.js";

interface AdminInput {
  username: string;
  email: string;
  password: string;
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

export async function createAdmin(input: AdminInput) {
  const username = usernameSchema.parse(input.username).toLowerCase();
  const email = emailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  const passwordHash = await argon2.hash(password);

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }]
    }
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN" }
    });
    return existing.username;
  }

  const user = await prisma.user.create({
    data: {
      username: sanitizeText(username),
      email,
      passwordHash,
      role: "ADMIN"
    }
  });
  return user.username;
}

export async function bootstrapAdminFromEnv() {
  const { OPENTUBE_ADMIN_USERNAME, OPENTUBE_ADMIN_EMAIL, OPENTUBE_ADMIN_PASSWORD } = env;
  if (!OPENTUBE_ADMIN_USERNAME && !OPENTUBE_ADMIN_EMAIL && !OPENTUBE_ADMIN_PASSWORD) return;
  if (!OPENTUBE_ADMIN_USERNAME || !OPENTUBE_ADMIN_EMAIL || !OPENTUBE_ADMIN_PASSWORD) {
    throw new Error("Set OPENTUBE_ADMIN_USERNAME, OPENTUBE_ADMIN_EMAIL, and OPENTUBE_ADMIN_PASSWORD together.");
  }

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount > 0) return;
  await createAdmin({
    username: OPENTUBE_ADMIN_USERNAME,
    email: OPENTUBE_ADMIN_EMAIL,
    password: OPENTUBE_ADMIN_PASSWORD
  });
}

async function main() {
  const username = readArg("username") ?? process.env.OPENTUBE_ADMIN_USERNAME;
  const email = readArg("email") ?? process.env.OPENTUBE_ADMIN_EMAIL;
  const password = readArg("password") ?? process.env.OPENTUBE_ADMIN_PASSWORD;

  if (!username || !email || !password) {
    throw new Error("Usage: npm run create-admin -- --username admin --email admin@example.com --password 'long-password'");
  }

  const createdUsername = await createAdmin({ username, email, password });
  console.log(`Admin ready: ${createdUsername}`);
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
