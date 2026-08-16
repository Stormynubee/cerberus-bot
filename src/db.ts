import { PrismaClient } from "@prisma/client";

/** Neon cold-starts can exceed Prisma's default 5s connect timeout (P1001). */
function withConnectTimeout(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/[?&]connect_timeout=/.test(url)) return url;
  return url.includes("?") ? `${url}&connect_timeout=20` : `${url}?connect_timeout=20`;
}

const datasourceUrl = withConnectTimeout(process.env.DATABASE_URL);

export const prisma = new PrismaClient(
  datasourceUrl ? { datasourceUrl } : undefined,
);

export function isDbUnreachable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "P1001" || code === "P1017" || code === "P2024";
}

export function vaultOfflineMessage(): string {
  return "The HellCat vault is temporarily offline. Try again in a minute.";
}
