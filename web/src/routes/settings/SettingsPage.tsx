import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The frame every settings page shares.
 *
 * A settings section is somewhere you arrive on purpose and leave again, so the
 * way back is part of the page rather than something to find in the nav — on a
 * phone the nav is a bottom bar that says "Settings" whichever page you are on,
 * which is no help at all once you are two levels in.
 */
export function SettingsPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const { householdId = "1" } = useParams();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to={`/household/${householdId}/settings`}
        className="label inline-flex items-center gap-1 transition hover:text-accent"
      >
        <ChevronLeft size={13} /> Settings
      </Link>
      <h1 className="mt-2 mb-3 text-4xl font-semibold tracking-tight">{title}</h1>
      {intro && <div className="mb-8 text-sm leading-relaxed text-muted">{intro}</div>}
      {children}
    </div>
  );
}
