"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";

import type { NavigationIconName, NavigationItem } from "@/types/navigation";
import { getDashboardTheme } from "@/components/dashboard/dashboard-themes";

type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

const navigationSections: NavigationSection[] = [
  {
    label: "Menu Utama",
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        description: "Ringkasan operasional",
        icon: "overview",
        available: true,
      },
      {
        href: "/dashboard/biomassa",
        label: "Biomassa",
        description: "Dashboard bahan bakar",
        icon: "biomassa",
        available: true,
      },
      {
        href: "/dashboard/batubara",
        label: "Batubara",
        description: "Dashboard bahan bakar",
        icon: "batubara",
        available: true,
      },
      {
        href: "/dashboard/solar",
        label: "Solar",
        description: "Dashboard energi solar",
        icon: "solar",
        available: true,
      },
      {
        href: "/dashboard/stok",
        label: "Stok Batubara",
        description: "Stok dan HOP unit",
        icon: "stock",
        available: true,
      },
      {
        href: "/dashboard/target",
        label: "Target & Kinerja",
        description: "Target dan pencapaian",
        icon: "target",
        available: true,
      },
    ],
  },
  {
    label: "Sistem",
    items: [
      {
        href: "/pengaturan",
        label: "Pengaturan",
        description: "Preferensi dan profil",
        icon: "settings",
        available: true,
      },
    ],
  },
];

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  switch (name) {
    case "overview":
      return (
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          {...commonProps}
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "biomassa":
      return (
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          {...commonProps}
        >
          <path d="M12 2a9 9 0 0 1 9 9c0 5-9 11-9 11S3 16 3 11a9 9 0 0 1 9-9Z" />
          <circle cx="12" cy="11" r="3" />
        </svg>
      );
    case "batubara":
      return (
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          {...commonProps}
        >
          <path d="m12 2 10 6.5v7L12 22 2 15.5v-7L12 2Z" />
          <path d="m2 8.5 10 6.2 10-6.2M12 14.7V22" />
        </svg>
      );
    case "solar":
      return (
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          {...commonProps}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    case "stock":
      return (
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          {...commonProps}
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z" />
          <path d="m3.3 7.4 8.7 5 8.7-5M12 22V12.4" />
        </svg>
      );
    case "target":
      return (
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          {...commonProps}
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
      );
    case "settings":
      return (
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 24 24"
          {...commonProps}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5v.1h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1L7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5v-.1h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a2 2 0 0 0-1.3 1Z" />
        </svg>
      );
  }
}

export function NavigationMenu() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const feedbackTheme = getDashboardTheme(pendingHref ?? pathname);

  return (
    <nav aria-label="Primary navigation">
      {navigationSections.map((section, sectionIndex) => (
        <div
          key={section.label}
          className={
            sectionIndex > 0 ? "mt-5 border-t border-slate-200 pt-4" : ""
          }
        >
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {section.label}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const isActive = Boolean(
                item.href &&
                (pendingHref === item.href ||
                  (item.href === "/dashboard"
                    ? pathname === item.href
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`))),
              );
              const className = `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                isActive
                  ? `${feedbackTheme.activeItem} font-semibold`
                  : item.available
                    ? `text-slate-600 ${feedbackTheme.hoverItem}`
                    : "cursor-not-allowed text-slate-400"
              }`;

              return (
                <li key={item.label}>
                  {item.available && item.href ? (
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={className}
                      href={item.href as Route}
                      onClick={() => setPendingHref(item.href)}
                    >
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 h-5 w-0.5 rounded-r ${feedbackTheme.solid}`}
                        />
                      ) : null}
                      <NavigationIcon name={item.icon} />
                      <span className="min-w-0">
                        <span className="block truncate">{item.label}</span>
                        <span className="block truncate text-xs font-normal text-slate-500">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className={className}
                      title="Belum dimigrasikan"
                    >
                      <NavigationIcon name={item.icon} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        <span className="block truncate text-xs font-normal text-slate-400">
                          {item.description}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                        Segera
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
