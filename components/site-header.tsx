import { SiteNav, type NavMenu } from "@/components/site/site-nav";
import { auth } from "@/lib/auth";
import { NAV_GROUPS, pagesIn } from "@/lib/site/pages";

export async function SiteHeader() {
  const session = await auth();
  const menus: NavMenu[] = NAV_GROUPS.filter((group) => group.menu).map((group) => ({
    label: group.label,
    items: pagesIn(group.id).map((page) => ({ href: page.path, title: page.title, summary: page.summary })),
  }));
  return <SiteNav menus={menus} signedIn={Boolean(session?.user?.id)} />;
}
