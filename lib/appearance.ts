import { THEME_COOKIE, appearanceCookie, type Preferences } from "@/lib/preferences-schema";

type Appearance = Pick<Preferences, "theme" | "accent" | "fontSize" | "density">;

/** Runs in <head> before first paint; keep it dependency-free. */
export const APPEARANCE_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var p=(m?decodeURIComponent(m[1]):"").split(".");var t=p[0]||"system";var d=document.documentElement;var k=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);d.classList.toggle("dark",k);d.dataset.theme=t;if(p[1])d.dataset.accent=p[1];if(p[2])d.dataset.font=p[2];if(p[3])d.dataset.density=p[3];}catch(e){}})();`;

export function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  const dark = appearance.theme === "dark" || (appearance.theme === "system" && systemPrefersDark());
  root.classList.toggle("dark", dark);
  root.dataset.theme = appearance.theme;
  root.dataset.accent = appearance.accent;
  root.dataset.font = appearance.fontSize;
  root.dataset.density = appearance.density;
  document.cookie = `${THEME_COOKIE}=${appearanceCookie(appearance)}; path=/; max-age=31536000; samesite=lax`;
}
