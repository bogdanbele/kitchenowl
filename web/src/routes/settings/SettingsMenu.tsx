import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Home, Palette, Sparkles, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import { api } from "../../api/client";
import type { Household } from "../../api/types";
import { openRouter } from "../../api/openrouter";
import { useAuth } from "../../auth";
import { useTheme } from "../../theme";

/**
 * The settings menu.
 *
 * Every row carries its current value, because most visits to settings are to
 * check something rather than change it — "is the key in?", "which model?" — and
 * a menu of bare labels makes you open all four to find out.
 */
export default function SettingsMenu() {
  const { householdId = "1" } = useParams();
  const { user } = useAuth();
  const [theme] = useTheme();

  const { data: households } = useQuery({
    queryKey: ["households"],
    queryFn: () => api<Household[]>("/household"),
  });
  const household = households?.find((entry) => String(entry.id) === householdId);

  const rows: {
    to: string;
    icon: ComponentType<{ size?: number; className?: string }>;
    label: string;
    value: string;
  }[] = [
    {
      to: "ai",
      icon: Sparkles,
      label: "AI",
      value: openRouter.configured
        ? `Key added · ${openRouter.model}`
        : "No key — paste-to-recipe and photo import are off",
    },
    {
      to: "appearance",
      icon: Palette,
      label: "Appearance",
      value: theme === "system" ? "Follows the system" : theme === "dark" ? "Dark" : "Light",
    },
    {
      to: "account",
      icon: UserRound,
      label: "Account",
      value: user ? `${user.name} (${user.username})` : "Not signed in",
    },
    {
      // The one row that leaves this browser: everything above is stored here,
      // everything below is stored for everyone in the household.
      to: `/household/${householdId}/household`,
      icon: Home,
      label: "Household",
      value: household?.name ?? "Members, features, categories",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">This browser</p>
      <h1 className="mt-1 mb-8 text-4xl font-semibold tracking-tight">Settings</h1>

      <ul className="rule">
        {rows.map((row) => (
          <li key={row.to} className="border-b border-hairline">
            <Link
              to={row.to}
              className="group flex items-center gap-4 py-4 transition hover:text-accent"
            >
              <row.icon size={18} className="shrink-0 text-faint transition group-hover:text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{row.label}</span>
                <span className="block truncate text-xs text-muted">{row.value}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
