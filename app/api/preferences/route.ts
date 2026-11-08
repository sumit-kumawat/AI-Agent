import { cookies } from "next/headers";
import { apiUser, handler, parseBody } from "@/lib/api";
import { getPreferences, savePreferences } from "@/lib/preferences";
import { appearanceCookie, preferencesPatchSchema, THEME_COOKIE } from "@/lib/preferences-schema";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  return Response.json({ preferences: getPreferences(user.id) });
});

export const PATCH = handler(async (request) => {
  const user = await apiUser(request);
  const patch = await parseBody(request, preferencesPatchSchema);
  const preferences = savePreferences(user.id, patch);
  (await cookies()).set(THEME_COOKIE, appearanceCookie(preferences), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ preferences });
});
