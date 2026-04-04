import { z } from "zod";

import type { PublicEnv } from "@/types/env";

function normalizeUrl(value: string): string {
  return value.replace(/\/$/, "");
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Immigrant Guru"),
  NEXT_PUBLIC_APP_ENV: z
    .enum(["local", "development", "staging", "production"])
    .default("local"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8000")
});

const parsedEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
});

export const publicEnv: PublicEnv = Object.freeze({
  appName: parsedEnv.NEXT_PUBLIC_APP_NAME,
  appEnv: parsedEnv.NEXT_PUBLIC_APP_ENV,
  appUrl: normalizeUrl(parsedEnv.NEXT_PUBLIC_APP_URL),
  apiUrl: normalizeUrl(parsedEnv.NEXT_PUBLIC_API_URL)
});

export function getPublicEnv(): PublicEnv {
  return publicEnv;
}
