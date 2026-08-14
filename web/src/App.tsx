import { Navigate, NavLink, Outlet, Route, Routes, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Household } from "./api/types";
import { useAuth } from "./auth";
import Login from "./routes/Login";
import Recipes from "./routes/Recipes";
import Recipe from "./routes/Recipe";
import ShoppingList from "./routes/ShoppingList";
import RecipeEdit from "./routes/RecipeEdit";
import Planner from "./routes/Planner";
import Expenses from "./routes/Expenses";
import { ThemeToggle } from "./components/ThemeToggle";

const SECTIONS = [
  { path: "shopping", label: "Shopping list" },
  { path: "recipes", label: "Recipes" },
  { path: "planner", label: "Meal planner" },
  { path: "expenses", label: "Expenses" },
];

function Shell() {
  const { householdId } = useParams();
  const { user, signOut } = useAuth();
  const { data: households } = useQuery({
    queryKey: ["households"],
    queryFn: () => api<Household[]>("/household"),
  });
  const household = households?.find((h) => String(h.id) === householdId);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-hairline md:min-h-dvh md:border-r">
        <div className="px-6 py-6">
          <p className="label">{household?.name ?? "Household"}</p>
          <p className="mt-2 font-display text-2xl leading-none font-semibold tracking-tight">
            Kitchen<span className="text-accent">Owl</span>
          </p>
        </div>

        <nav className="px-3 pb-6">
          {SECTIONS.map((section, index) => (
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

      <main className="px-6 py-8 md:px-10 md:py-12">
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
