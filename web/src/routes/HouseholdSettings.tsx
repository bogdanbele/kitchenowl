import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";
import type { Household, User } from "../api/types";
import { useAuth } from "../auth";

interface Member extends User {
  owner?: boolean;
  admin?: boolean;
  expense_balance?: number;
}

type FullHousehold = Household & {
  member?: Member[];
  description?: string;
  planner_feature?: boolean;
  expenses_feature?: boolean;
};

export default function HouseholdSettings() {
  const { householdId = "1" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["household", householdId];

  const { data: household, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api<FullHousehold>(`/household/${householdId}`),
  });

  const [name, setName] = useState<string | null>(null);
  const members = household?.member ?? [];
  const me = members.find((member) => member.id === user?.id);
  // The API enforces this too; reflecting it here keeps a member from being
  // offered a control that will only come back as a 403.
  const canManage = !!(me?.owner || me?.admin);

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/household/${householdId}`, { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });

  const setAdmin = useMutation({
    mutationFn: ({ userId, admin }: { userId: number; admin: boolean }) =>
      api(`/household/${householdId}/member/${userId}`, { method: "PUT", body: { admin } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const removeMember = useMutation({
    mutationFn: (userId: number) =>
      api(`/household/${householdId}/member/${userId}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (isPending || !household) {
    return <div className="h-64 animate-pulse rounded-card bg-paper-deep" />;
  }

  const currentName = name ?? household.name;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">Settings</p>
      <h1 className="mt-1 mb-8 text-4xl font-semibold tracking-tight">Household</h1>

      <section className="mb-10">
        <label className="label mb-1 block" htmlFor="household-name">
          Name
        </label>
        <div className="flex gap-3">
          <input
            id="household-name"
            value={currentName}
            disabled={!canManage}
            onChange={(e) => setName(e.target.value)}
            className="field disabled:opacity-60"
          />
          {name !== null && name !== household.name && (
            <button
              onClick={() => update.mutate({ name: name.trim() })}
              disabled={!name.trim() || update.isPending}
              className="shrink-0 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-40"
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </section>

      <section className="mb-10">
        <p className="label mb-2">Features</p>
        <ul className="rule">
          {(
            [
              ["planner_feature", "Meal planner"],
              ["expenses_feature", "Expenses"],
            ] as const
          ).map(([flag, label]) => (
            <li
              key={flag}
              className="flex items-center justify-between border-b border-hairline py-3"
            >
              <span className="text-sm">{label}</span>
              <button
                disabled={!canManage}
                onClick={() => update.mutate({ [flag]: !household[flag] })}
                aria-pressed={!!household[flag]}
                className={`font-mono text-[10px] tracking-[0.14em] uppercase transition disabled:opacity-40 ${
                  household[flag] ? "text-accent" : "text-faint"
                }`}
              >
                {household[flag] ? "On" : "Off"}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Turning one off hides it in the apps; nothing recorded is deleted.
        </p>
      </section>

      <section>
        <p className="label mb-2">Members</p>
        <ul className="rule">
          {members.map((member) => {
            const isSelf = member.id === user?.id;
            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 border-b border-hairline py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {member.name}
                    {isSelf && <span className="label ml-2">you</span>}
                  </p>
                  <p className="label mt-0.5">
                    {member.owner ? "Owner" : member.admin ? "Admin" : "Member"}
                  </p>
                </div>

                {/* The owner is deliberately untouchable: the API refuses to
                    demote or remove them, and a button that always fails is
                    worse than no button. */}
                {canManage && !member.owner && (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => setAdmin.mutate({ userId: member.id, admin: !member.admin })}
                      className="label transition hover:text-accent"
                    >
                      {member.admin ? "Demote" : "Make admin"}
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Remove ${member.name} from this household? Their expenses stay on the ledger.`,
                            )
                          ) {
                            removeMember.mutate(member.id);
                          }
                        }}
                        className="label transition hover:text-accent"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!canManage && (
          <p className="mt-2 text-xs text-muted">Only an admin can change members.</p>
        )}
      </section>
    </div>
  );
}
