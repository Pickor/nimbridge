/**
 * Single source of truth for the top-nav structure.
 *
 * Each page passes its own pathname so the helper can compute the
 * `active` flag for both top-level entries and dropdown groups (a
 * dropdown is "active" when the current page is one of its children).
 */
import type { NavItem } from "@/lib/nav-types";

interface Args {
  /** The current request's pathname, e.g. "/dashboard/jewellery". */
  pathname: string;
  /** Whether the user has at least moderator role — controls the Admin link. */
  showAdmin?: boolean;
}

export function buildNavLinks({ pathname, showAdmin }: Args): NavItem[] {
  const inDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const inFavorites = pathname.startsWith("/favorites");
  const inHistory = pathname === "/history" || pathname.startsWith("/history/");
  const inAdmin = pathname.startsWith("/admin");

  const items: NavItem[] = [
    {
      kind: "group",
      label: "Deals",
      active: inDashboard,
      children: [
        { href: "/dashboard",           label: "Wine & Spirits" },
        { href: "/dashboard/jewellery", label: "Jewellery" },
        { href: "/dashboard/watches",   label: "Watches" },
        { href: "/dashboard/apple",     label: "Apple" },
      ],
    },
    { kind: "link", href: "/favorites", label: "Favorites", active: inFavorites },
    {
      kind: "group",
      label: "History",
      active: inHistory,
      children: [
        { href: "/history",           label: "Wine & Spirits" },
        { href: "/history/jewellery", label: "Jewellery" },
        { href: "/history/watches",   label: "Watches" },
        { href: "/history/apple",     label: "Apple" },
      ],
    },
  ];
  if (showAdmin) {
    items.push({ kind: "link", href: "/admin", label: "Admin", active: inAdmin });
  }
  return items;
}
