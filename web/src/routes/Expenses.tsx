import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Household, User } from "../api/types";
import { money } from "../lib/format";

interface Member extends User {
  expense_balance: number;
}

interface Expense {
  id: number;
  name: string;
  amount: number;
  date: number;
  paid_by_id: number;
  description?: string;
}

export default function Expenses() {
  const { householdId = "1" } = useParams();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: household } = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => api<Household & { member?: Member[] }>(`/household/${householdId}`),
  });
  const members: Member[] = (household?.member as Member[]) ?? [];

  const expensesKey = ["expenses", householdId];
  const { data: expenses, isPending } = useQuery({
    queryKey: expensesKey,
    queryFn: () => api<Expense[]>(`/household/${householdId}/expense`),
  });

  const add = useMutation({
    mutationFn: (body: unknown) =>
      api(`/household/${householdId}/expense`, { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expensesKey });
      // Balances live on the household's members, so they go stale on every
      // expense: refetching only the list would show a new expense beside a
      // balance that does not account for it.
      queryClient.invalidateQueries({ queryKey: ["household", householdId] });
      setAdding(false);
    },
  });

  const nameOf = (userId: number) =>
    members.find((member) => member.id === userId)?.name ?? "Someone";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <p className="label">Who owes whom</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Expenses</h1>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="btn-gradient mb-1 rounded-card px-4 py-2 text-sm font-medium"
        >
          Add expense
        </button>
      </div>

      <section className="mt-8 mb-10">
        <p className="label mb-2">Balances</p>
        <ul className="rule">
          {members.map((member) => {
            const balance = member.expense_balance ?? 0;
            const settled = Math.abs(balance) < 0.005;
            return (
              <li
                key={member.id}
                className="flex items-baseline justify-between border-b border-hairline py-2.5"
              >
                <span>{member.name}</span>
                <span
                  className={`font-mono text-sm tabular-nums ${
                    settled ? "text-faint" : balance > 0 ? "text-done" : "text-accent"
                  }`}
                >
                  {settled ? "settled" : `${balance > 0 ? "+" : ""}${money(balance)}`}
                </span>
              </li>
            );
          })}
          {members.length === 0 && <li className="py-2.5 text-sm text-faint">No members.</li>}
        </ul>
        <p className="mt-2 text-xs text-muted">
          A positive balance is money the household owes that person.
        </p>
      </section>

      <section>
        <p className="label mb-2">Recent</p>
        {isPending ? (
          <div className="h-40 animate-pulse rounded-card bg-paper-deep" />
        ) : !expenses?.length ? (
          <p className="py-3 text-sm text-faint">Nothing recorded yet.</p>
        ) : (
          <ul className="rule">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-baseline gap-4 border-b border-hairline py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{expense.name}</p>
                  <p className="label mt-0.5">
                    {nameOf(expense.paid_by_id)} ·{" "}
                    {new Date(expense.date).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {money(expense.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && (
        <AddExpense
          members={members}
          pending={add.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(body) => add.mutate(body)}
        />
      )}
    </div>
  );
}

function AddExpense({
  members,
  pending,
  onCancel,
  onSubmit,
}: {
  members: Member[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: unknown) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<number | null>(members[0]?.id ?? null);
  // Everyone splits it by default, which is what a household expense usually
  // is; unticking is quicker than ticking four people every time.
  const [paidFor, setPaidFor] = useState<number[]>(members.map((member) => member.id));

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!name.trim() || !Number.isFinite(value) || value <= 0 || paidBy === null) return;
    if (paidFor.length === 0) return;

    onSubmit({
      name: name.trim(),
      amount: value,
      paid_by: { id: paidBy },
      // factor 1 each: the API divides by the sum of factors, so equal factors
      // are an equal split however many people are ticked.
      paid_for: paidFor.map((id) => ({ id, factor: 1 })),
      date: Date.now(),
    });
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-6" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-card border border-hairline bg-paper p-6"
      >
        <p className="label mb-4">New expense</p>

        <label className="label mb-1 block" htmlFor="expense-name">
          What for
        </label>
        <input
          id="expense-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="field mb-5"
        />

        <label className="label mb-1 block" htmlFor="expense-amount">
          Amount
        </label>
        <input
          id="expense-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="field mb-5 font-mono"
        />

        <label className="label mb-1 block" htmlFor="expense-payer">
          Paid by
        </label>
        <select
          id="expense-payer"
          value={paidBy ?? ""}
          onChange={(e) => setPaidBy(Number(e.target.value))}
          className="field mb-5"
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>

        <p className="label mb-2">Split between</p>
        <div className="mb-6 flex flex-wrap gap-2">
          {members.map((member) => {
            const included = paidFor.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() =>
                  setPaidFor(
                    included
                      ? paidFor.filter((id) => id !== member.id)
                      : [...paidFor, member.id],
                  )
                }
                aria-pressed={included}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  included ? "border-accent text-accent" : "border-hairline text-muted"
                }`}
              >
                {member.name}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending || !name.trim() || !amount.trim() || paidFor.length === 0}
            className="btn-gradient rounded-card px-5 py-2.5 font-medium"
          >
            {pending ? "Saving…" : "Add expense"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
