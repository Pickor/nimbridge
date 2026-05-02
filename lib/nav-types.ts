/**
 * Nav-bar item types shared between the AppHeader component and the
 * buildNavLinks helper. Lives in a plain types file (not in the React
 * component) so non-component code can import the type without pulling
 * "use client" boundaries around with it.
 */

export interface NavLink {
  kind: "link";
  href: string;
  label: string;
  active: boolean;
}

export interface NavGroup {
  kind: "group";
  label: string;
  /** True when the current page is one of this group's children. */
  active: boolean;
  children: { href: string; label: string }[];
}

export type NavItem = NavLink | NavGroup;
