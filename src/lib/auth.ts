import { createAuthClient } from "better-auth/react";

/**
 * better-auth browser client.
 *
 * baseURL is empty in development so requests go through the Vite proxy and
 * stay same-origin — see the comment in vite.config.ts for why that matters for
 * cookies.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? window.location.origin,
});

export const { signIn, signOut, useSession } = authClient;
