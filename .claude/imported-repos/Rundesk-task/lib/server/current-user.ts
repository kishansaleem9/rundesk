import { db } from "./db";

export const DEFAULT_DEV_EMAIL = "munazza@aura.local";

export async function getCurrentUser() {
  const email = process.env.DEV_USER_EMAIL ?? DEFAULT_DEV_EMAIL;
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Development user ${email} was not found. Run the seed command.`);
  return user;
}
