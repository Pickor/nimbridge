/** Bottom-of-page footer — links to GDPR/privacy & terms pages. */
"use client";

import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-800 bg-neutral-950 mt-16">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <p className="text-white font-semibold text-base mb-1">🔭 Nimbridge</p>
            <p className="text-neutral-500 text-sm leading-relaxed">
              Privat verktyg för pris-spårning.
            </p>
          </div>

          {/* Information */}
          <div>
            <p className="text-neutral-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Information
            </p>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/integritetspolicy"
                  className="text-neutral-400 hover:text-white text-sm transition-colors"
                >
                  Integritetspolicy
                </Link>
              </li>
              <li>
                <Link
                  href="/villkor"
                  className="text-neutral-400 hover:text-white text-sm transition-colors"
                >
                  Användarvillkor
                </Link>
              </li>
            </ul>
          </div>

          {/* Spel */}
          <div>
            <p className="text-neutral-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Spel
            </p>
            <ul className="space-y-2.5">
              {[
                { href: "https://gissalaten.com",    label: "Gissa låten",           icon: "/icons/gissalaten.png"    },
                { href: "https://bostadsspelet.se",  label: "Gissa Bostads priset",  icon: "/icons/bostadsspelet.png" },
                { href: "https://gissabilpriset.se", label: "Gissa bil priset",       icon: "/icons/gissabilpriset.png"},
              ].map(({ href, label, icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={icon}
                      alt=""
                      width={16}
                      height={16}
                      className="rounded-sm opacity-80"
                    />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-6">
          <p className="text-neutral-600 text-xs text-center">
            © {year} Nimbridge. Alla rättigheter förbehållna.
          </p>
        </div>
      </div>
    </footer>
  );
}
