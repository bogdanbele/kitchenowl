import { Navigate, NavLink, Outlet, Route, Routes, useParams } from "react-router-dom";
import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Household } from "./api/types";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAuth } from "./auth";
import Login from "./routes/Login";

/**
 * Routes are split so the shopping list does not carry the recipe editor with
 * it. The editor pulls in the markdown renderer and its plugins, which is the
 * heaviest thing here and is needed by two screens out of seven — and the
 * shopping list is the one opened on a phone on a bad connection.
 *
 * Login stays eagerly imported: it is the first thing an unauthenticated
 * visitor sees, and a spinner before a login form is a worse trade.
 */
const ShoppingList = lazy(() => import("./routes/ShoppingList"));
const Recipes = lazy(() => import("./routes/Recipes"));
const Recipe = lazy(() => import("./routes/Recipe"));
const RecipeEdit = lazy(() => import("./routes/RecipeEdit"));
const Planner = lazy(() => import("./routes/Planner"));
const Expenses = lazy(() => import("./routes/Expenses"));
const HouseholdSettings = lazy(() => import("./routes/HouseholdSettings"));
const NotFound = lazy(() => import("./routes/NotFound"));
const Settings = lazy(() => import("./routes/Settings"));
import { ThemeToggle } from "./components/ThemeToggle";

interface Section {
  path: string;
  label: string;
  short: string;
}

const ALL_SECTIONS: Section[] = [
  { path: "shopping", label: "Shopping list", short: "Shopping" },
  { path: "recipes", label: "Recipes", short: "Recipes" },
  { path: "planner", label: "Meal planner", short: "Planner" },
  { path: "expenses", label: "Expenses", short: "Expenses" },
  { path: "household", label: "Household", short: "Home" },
  { path: "settings", label: "Settings", short: "More" },
];

/**
 * The nav follows the household's own settings.
 *
 * A household with expenses turned off should not show an Expenses tab that
 * loads an empty screen — the Flutter app hides them, and the toggles on the
 * household settings page are meaningless if nothing reads them. Both flags
 * default to on when the field is absent, matching the server.
 */
function sectionsFor(household?: { planner_feature?: boolean; expenses_feature?: boolean }): Section[] {
  return ALL_SECTIONS.filter((section) => {
    if (section.path === "planner") return household?.planner_feature !== false;
    if (section.path === "expenses") return household?.expenses_feature !== false;
    return true;
  });
}

function Shell() {
  const { householdId } = useParams();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { data: households } = useQuery({
    queryKey: ["households"],
    queryFn: () => api<Household[]>("/household"),
  });
  const household = households?.find((h) => String(h.id) === householdId);
  const sections = sectionsFor(household);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Phones get a title bar and a bottom bar; the sidebar is desktop only.
          Stacked, the sidebar pushed the shopping list a screen and a half down
          — every visit began with a scroll past navigation you had just used. */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-paper/90 px-5 py-3 backdrop-blur md:hidden">
        <div>
          <p className="label">{household?.name ?? "Household"}</p>
          <p className="gradient-ink font-display text-lg leading-tight font-semibold">KitchenOwl</p>
        </div>
        <ThemeToggle />
      </header>

      <aside className="hidden border-hairline md:block md:min-h-dvh md:border-r">
        <div className="px-6 py-6">
          <p className="label">{household?.name ?? "Household"}</p>
          <p className="gradient-ink mt-2 font-display text-2xl leading-none font-semibold tracking-tight">
            KitchenOwl
          </p>
        </div>

        <nav className="px-3 pb-6">
          {sections.map((section, index) => (
            <NavLink
              key={section.path}
              to={`/household/${householdId}/${section.path}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-card px-3 py-2 text-sm transition ${
                  isActive ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
                }`
              }
            >
              {/* The numbered index is lifted from the Archivist's sidebar: it
                  turns a list of links into a table of contents. */}
              <span className="font-mono text-[10px] tracking-widest opacity-70">
                {String(index + 1).padStart(2, "0")}
              </span>
              {section.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 pb-6">
          <div className="rule pt-4">
            <p className="label">Theme</p>
            <div className="mt-1 -ml-1.5">
              <ThemeToggle />
            </div>
          </div>
          <div className="rule mt-4 pt-4">
            <p className="label">Signed in</p>
            <p className="mt-1 text-sm">{user?.name}</p>
            <button
              onClick={signOut}
              className="mt-2 font-mono text-[10px] tracking-[0.14em] text-faint uppercase transition hover:text-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Fixed to the bottom, where a thumb is. env(safe-area-inset-bottom)
          keeps the labels clear of the home indicator on an iPhone. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-hairline bg-paper/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {sections.map((section) => (
          <NavLink
            key={section.path}
            to={`/household/${householdId}/${section.path}`}
            className={({ isActive }) =>
              `flex-1 py-3 text-center font-mono text-[10px] tracking-[0.1em] uppercase transition ${
                isActive ? "text-accent" : "text-faint"
              }`
            }
          >
            {section.short}
          </NavLink>
        ))}
      </nav>

      {/* One large gradient for the whole app rather than one per page: a bloom
          behind the heading, clipped by the main element and pointer-events
          none, so it can never sit under text or swallow a click. */}
      <main className="aurora relative overflow-hidden px-5 pt-6 pb-24 md:px-10 md:py-12 md:pb-12">
        <span aria-hidden className="aurora-glow" />
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-paper-deep" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

/** Sends you to your first household, since the app has no meaning without one. */
function HouseholdRedirect() {
  const { data, isPending, error } = useQuery({
    queryKey: ["households"],
    queryFn: () => api<Household[]>("/household"),
  });

  if (isPending) return null;
  if (error) return <p className="p-6 text-accent">{(error as Error).message}</p>;
  if (!data?.length) return <p className="p-6">You are not a member of any household yet.</p>;

  return <Navigate to={`/household/${data[0].id}/shopping`} replace />;
}

export default function App() {
  const { user, ready } = useAuth();

  // Nothing renders until the session answer is in, so an already signed-in
  // user never sees the login form flash past on a refresh.
  if (!ready) return null;
  if (!user) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<HouseholdRedirect />} />
      <Route path="/household/:householdId" element={<Shell />}>
        <Route path="shopping" element={<ShoppingList />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="recipes/new" element={<RecipeEdit />} />
        <Route path="recipes/:recipeId" element={<Recipe />} />
        <Route path="recipes/:recipeId/edit" element={<RecipeEdit />} />
        <Route path="planner" element={<Planner />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="household" element={<HouseholdSettings />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
