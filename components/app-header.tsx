/**
 * Top navigation bar — brand on the left, role-aware nav links in the
 * middle, user avatar/menu on the right.
 *
 * Each nav entry is either a flat link or a dropdown "group" (Deals,
 * History) that fans out into Wine & Spirits / Jewellery / Watches.
 * On desktop the group is a click-to-open <details> dropdown; on
 * mobile it collapses into a single tab that links to its first child
 * (Wine & Spirits, the default), so the tab strip stays simple.
 *
 * Admin's layout passes its own simpler { kind: "link" } items, so it
 * doesn't see any dropdown behaviour.
 */
import UserMenu from "@/components/user-menu";
import type { NavItem } from "@/lib/nav-types";

interface Props {
  brand: React.ReactNode;
  links: NavItem[];
  email?: string;
  displayName?: string;
  role?: string;
}

export default function AppHeader({ brand, links, email, displayName, role }: Props) {
  return (
    <header className="border-b border-neutral-800">
      {/* ── Top row: Brand + desktop nav + UserMenu ── */}
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-4 px-4 sm:px-6 py-3 sm:py-4">
        <span className="text-xl font-bold text-white shrink-0">{brand}</span>

        {/* Desktop nav — hidden on mobile */}
        <nav className="hidden sm:flex items-center gap-6 text-sm">
          {links.map((item) =>
            item.kind === "link" ? (
              <a
                key={item.href}
                href={item.href}
                className={
                  item.active
                    ? "text-white font-medium"
                    : "text-neutral-400 hover:text-white transition-colors"
                }
              >
                {item.label}
              </a>
            ) : (
              <details key={item.label} name="nav-dropdown" className="relative">
                <summary
                  className={[
                    "list-none cursor-pointer flex items-center gap-1 select-none",
                    item.active
                      ? "text-white font-medium"
                      : "text-neutral-400 hover:text-white transition-colors",
                  ].join(" ")}
                >
                  {item.label}
                  <span aria-hidden className="text-[10px] mt-0.5">▾</span>
                </summary>
                <div className="absolute top-full left-0 mt-2 min-w-[200px] rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl z-50 py-1">
                  {item.children.map((child) => (
                    <a
                      key={child.href}
                      href={child.href}
                      className="block px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      {child.label}
                    </a>
                  ))}
                </div>
              </details>
            )
          )}
        </nav>

        {email && <UserMenu email={email} displayName={displayName} role={role} />}
      </div>

      {/* ── Mobile nav ──
          Flat links render as plain tabs. Group items render a <details>
          whose <summary> *is* the tab; tapping it opens a full-width
          dropdown panel with the children. The shared `name="nav-mobile"`
          makes the two groups mutually exclusive (Deals open closes
          History and vice versa). */}
      <nav className="sm:hidden flex border-t border-neutral-800 relative">
        {links.map((item) => {
          if (item.kind === "link") {
            return (
              <a
                key={item.href}
                href={item.href}
                className={[
                  "flex-1 text-center py-2.5 text-xs font-medium transition-colors",
                  item.active
                    ? "text-white border-b-2 border-white"
                    : "text-neutral-400 hover:text-white border-b-2 border-transparent",
                ].join(" ")}
              >
                {item.label}
              </a>
            );
          }
          // Group → tap opens a panel under the tab strip with the children.
          return (
            <details key={item.label} name="nav-mobile" className="flex-1 group">
              <summary
                className={[
                  "list-none cursor-pointer select-none py-2.5 text-center text-xs font-medium transition-colors flex items-center justify-center gap-1",
                  item.active
                    ? "text-white border-b-2 border-white"
                    : "text-neutral-400 hover:text-white border-b-2 border-transparent",
                ].join(" ")}
              >
                {item.label}
                <span aria-hidden className="text-[10px] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              {/* Panel below the whole tab strip; absolute so it overlays page content. */}
              <div className="absolute top-full left-0 right-0 z-50 bg-neutral-900 border-b border-neutral-800 shadow-xl">
                {item.children.map((child) => (
                  <a
                    key={child.href}
                    href={child.href}
                    className="block px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white border-b border-neutral-800 last:border-b-0 transition-colors"
                  >
                    {child.label}
                  </a>
                ))}
              </div>
            </details>
          );
        })}
      </nav>
    </header>
  );
}
