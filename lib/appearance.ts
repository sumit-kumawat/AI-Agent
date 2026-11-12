import { THEME_COOKIE, appearanceCookie, type Preferences } from "@/lib/preferences-schema";

type Appearance = Pick<Preferences, "theme" | "accent" | "fontSize" | "density">;

/** Runs in <head> before first paint; keep it dependency-free. Light-only product. */
export const APPEARANCE_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var p=(m?decodeURIComponent(m[1]):"").split(".");var d=document.documentElement;d.classList.remove("dark");d.dataset.theme="light";if(p[1])d.dataset.accent=p[1];if(p[2])d.dataset.font=p[2];if(p[3])d.dataset.density=p[3];}catch(e){}})();`;

export function systemPrefersDark() {
  return false;
}

export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  // Product is light-only; ignore stored dark/system preferences.
  root.classList.remove("dark");
  root.dataset.theme = "light";
  root.dataset.accent = appearance.accent;
  root.dataset.font = appearance.fontSize;
  root.dataset.density = appearance.density;
  document.cookie = `${THEME_COOKIE}=${appearanceCookie({ ...appearance, theme: "light" })}; path=/; max-age=31536000; samesite=lax`;
}
