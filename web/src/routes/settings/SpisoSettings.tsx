import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Check, Unplug } from "lucide-react";
import { spisoApi, type SpisoHome } from "../../api/spiso";
import { Field, Select } from "../../components/Field";
import { ConfirmDialog } from "../../components/Modal";
import { SettingsPage } from "./SettingsPage";

/**
 * Connecting a Spiso (Foodminder) account.
 *
 * Deliberately not on the settings menu: this is one person's bridge to another
 * app, on a self-hosted instance, and it would read as a broken feature to
 * anyone else in the household. Reachable at /settings/spiso, and the Inventory
 * section appears in the nav once it works.
 */
export default function SpisoSettings() {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState("https://api.spiso.app");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [homes, setHomes] = useState<SpisoHome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const { data: status } = useQuery({ queryKey: ["spiso"], queryFn: spisoApi.status });

  const connect = useMutation({
    mutationFn: () => spisoApi.connect({ base_url: baseUrl.trim(), email: email.trim(), password }),
    onSuccess: (result) => {
      // The password is not kept here either — it existed for one request.
      setPassword("");
      setError(null);
      setHomes(result.homes ?? []);
      queryClient.setQueryData(["spiso"], result);
      void queryClient.invalidateQueries({ queryKey: ["spiso-inventory"] });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not connect."),
  });

  const chooseHome = useMutation({
    mutationFn: (homeId: string) => spisoApi.chooseHome(homeId),
    onSuccess: (result) => {
      queryClient.setQueryData(["spiso"], result);
      void queryClient.invalidateQueries({ queryKey: ["spiso-inventory"] });
    },
  });

  const disconnect = useMutation({
    mutationFn: spisoApi.disconnect,
    onSuccess: () => {
      queryClient.setQueryData(["spiso"], { connected: false });
      void queryClient.invalidateQueries({ queryKey: ["spiso-inventory"] });
      setHomes([]);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!baseUrl.trim() || !email.trim() || !password) {
      setError("Server, email and password are all needed.");
      return;
    }
    connect.mutate();
  }

  return (
    <SettingsPage
      title="Foodminder"
      intro={
        <>
          Shows what is actually in your kitchen, read from your Spiso home, so “Cook now” ranks
          recipes against real food with real dates instead of guessing from what you bought.
          Read-only: KitchenOwl never writes to your inventory.
        </>
      }
    >
      {status?.connected ? (
        <>
          <div className="mb-6 rounded-card border border-hairline p-4">
            <p className="flex items-center gap-2 text-sm">
              <Check size={15} className="text-done" />
              Connected to <span className="font-mono text-xs">{status.base_url}</span>
            </p>
            {status.home_name && (
              <p className="mt-1 text-sm text-muted">Reading “{status.home_name}”.</p>
            )}
            {status.needs_sign_in && (
              <p className="mt-2 text-sm text-accent">
                That Spiso session has expired — sign in again below.
              </p>
            )}
          </div>

          {homes.length > 1 && (
            <Select
              label="Home"
              value={status.home_id ?? ""}
              onChange={(event) => chooseHome.mutate(event.target.value)}
            >
              <option value="">Choose a home…</option>
              {homes.map((home) => (
                <option key={home.id} value={home.id}>
                  {home.name}
                </option>
              ))}
            </Select>
          )}

          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="inline-flex items-center gap-2 rounded-card border border-hairline px-5 py-2.5
                       text-muted transition hover:border-accent hover:text-accent"
          >
            <Unplug size={15} /> Disconnect
          </button>
        </>
      ) : null}

      <form onSubmit={onSubmit} className={status?.connected ? "mt-10" : ""}>
        {status?.connected && <p className="label mb-3">Sign in again</p>}
        <Field
          label="Spiso server"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.spiso.app"
          className="font-mono text-sm"
          hint="Must be https unless it is on this machine — this request carries your password."
        />
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="Used once to start a session. The password is never stored; the session token it returns is."
        />

        {error && (
          <p role="alert" className="mb-4 text-sm text-accent">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={connect.isPending}
          className="btn-gradient rounded-card px-5 py-2.5 font-medium disabled:opacity-60"
        >
          {connect.isPending ? "Connecting…" : "Connect"}
        </button>
      </form>

      <p className="mt-6 text-xs text-faint">
        Worth knowing: this KitchenOwl server holds the Spiso session token, because it makes the
        requests rather than your browser. Only a shared home can be read — a personal Spiso backup
        is end-to-end encrypted and only the Spiso app can open it.
      </p>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Foodminder"
        message="Forget the Spiso session and stop showing the inventory? Nothing in Spiso changes."
        confirmLabel="Disconnect"
        onConfirm={() => {
          disconnect.mutate();
          setConfirmDisconnect(false);
        }}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </SettingsPage>
  );
}
