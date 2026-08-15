import { useAuth } from "../../auth";
import { SettingsPage } from "./SettingsPage";

export default function AccountSettings() {
  const { user, signOut } = useAuth();

  return (
    <SettingsPage title="Account">
      <dl className="mb-8 rule">
        {[
          ["Name", user?.name],
          ["Username", user?.username],
          ["Email", user?.email],
        ]
          // Email is absent on instances that never collected one; an empty row
          // reads as a missing field rather than a field that does not apply.
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-hairline py-3">
              <dt className="label">{label}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
      </dl>

      <button
        onClick={signOut}
        className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:border-accent hover:text-accent"
      >
        Sign out
      </button>
      <p className="mt-2 text-xs text-faint">
        Signs out this browser only. Your OpenRouter key and theme stay where they are.
      </p>
    </SettingsPage>
  );
}
