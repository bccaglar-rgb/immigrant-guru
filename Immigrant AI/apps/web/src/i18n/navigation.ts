import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

// Locale-aware Link, redirect, usePathname, useRouter. Use these instead of
// `next/link` / `next/navigation` so href="/pricing" on a Turkish page
// automatically resolves to `/tr/pricing`.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
