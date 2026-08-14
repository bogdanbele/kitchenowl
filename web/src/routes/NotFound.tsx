import { Link, useParams } from "react-router-dom";

/**
 * A real 404.
 *
 * The router used to redirect every unknown path to `/`, which quietly hid
 * typos, dead links and — more usefully — routes that exist in the Flutter app
 * and not yet here.
 */
export default function NotFound() {
  const { householdId } = useParams();
  const home = householdId ? `/household/${householdId}/shopping` : "/";

  return (
    <div className="mx-auto max-w-lg py-16">
      <p className="label">404</p>
      <h1 className="mt-1 mb-4 text-3xl font-semibold tracking-tight">No such page</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        That address does not match anything here. If you followed it from the older app, the screen
        may not have been rebuilt yet.
      </p>
      <Link to={home} className="btn-gradient inline-block rounded-card px-5 py-2.5 font-medium">
        Back to the shopping list
      </Link>
    </div>
  );
}
