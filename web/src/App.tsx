import { Navigate, Outlet, Route, Routes, NavLink, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Household } from "./api/types";
import { useAuth } from "./auth";
import Login from "./routes/Login";
import Recipes from "./routes/Recipes";
import Recipe from "./routes/Recipe";

function Shell() {
  const { householdId } = useParams();
  const { user, signOut } = useAuth();

  const nav = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      isActive ? "bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300" : "text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <span className="font-semibold tracking-tight">KitchenOwl</span>
          <nav className="flex gap-1">
            <NavLink to={`/household/${householdId}/recipes`} className={nav}>
              Recipes
            </NavLink>
          </nav>
          <button
            onClick={signOut}
            className="ml-auto text-sm text-ink-soft transition hover:text-ink"
            title={user?.name}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
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
  if (error) return <p className="p-6 text-red-600">{(error as Error).message}</p>;
  if (!data?.length) return <p className="p-6">You are not a member of any household yet.</p>;

  return <Navigate to={`/household/${data[0].id}/recipes`} replace />;
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
        <Route path="recipes" element={<Recipes />} />
        <Route path="recipes/:recipeId" element={<Recipe />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
