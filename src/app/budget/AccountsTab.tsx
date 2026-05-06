"use client";

import { useEffect, useState, useCallback } from "react";
import { generateAccountsSummaryPdf } from "@/lib/reports/accountsSummaryPdf";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
  totalWeeks: number;
}

interface BudgetParamsData {
  priceDons1: number;
  priceDons2: number;
  priceExtraHour: number;
  priceSubs: number;
}

interface PlayerLite {
  id: number;
  firstName: string;
  lastName: string;
  contractedFrequency: string;
  isActive: boolean;
}

interface Assignment {
  playerId: number;
}

interface Game {
  id: number;
  status: string;
  group: string;
  assignments: Assignment[];
}

interface Payment {
  id: number;
  playerId: number;
  paidDate: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

type ContractKind = "1" | "2" | "2+" | "0";

interface AccountRow {
  player: PlayerLite;
  scheduledGames: number;
  contract: ContractKind;
  base: number;
  extras: number;
  extraGames: number;
  fee: number;
  payments: Payment[];
  deposits: number;
  balance: number;
}

interface Props {
  season: Season | null;
  params: BudgetParamsData;
}

const fmt = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);

const todayIso = () => new Date().toISOString().split("T")[0];

function isBilledFrequency(
  p: PlayerLite
): p is PlayerLite & { contractedFrequency: ContractKind } {
  return ["0", "1", "2", "2+"].includes(p.contractedFrequency);
}

export default function AccountsTab({ season, params }: Props) {
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Inline payment form state, keyed by player id
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);
  const [formDate, setFormDate] = useState(todayIso());
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!season) return;
    setLoading(true);
    setError("");
    try {
      const [pRes, gRes, payRes] = await Promise.all([
        fetch(`/api/players?seasonId=${season.id}`),
        fetch(`/api/games?seasonId=${season.id}`),
        fetch(`/api/player-payments?seasonId=${season.id}`),
      ]);
      if (!pRes.ok) throw new Error("Failed to load players");
      if (!gRes.ok) throw new Error("Failed to load games");
      if (!payRes.ok) throw new Error("Failed to load payments");
      setPlayers((await pRes.json()) as PlayerLite[]);
      setGames((await gRes.json()) as Game[]);
      setPayments((await payRes.json()) as Payment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Compute per-player rows (Don's contract players only) ---
  const rows: AccountRow[] = (() => {
    if (!season) return [];
    const totalWeeks = season.totalWeeks ?? 36;

    // Count games per player (Don's, normal status only)
    const gamesByPlayer = new Map<number, number>();
    for (const g of games) {
      if (g.status !== "normal") continue;
      if (g.group !== "dons") continue;
      for (const a of g.assignments ?? []) {
        gamesByPlayer.set(a.playerId, (gamesByPlayer.get(a.playerId) ?? 0) + 1);
      }
    }

    // Group payments by player
    const paymentsByPlayer = new Map<number, Payment[]>();
    for (const p of payments) {
      const arr = paymentsByPlayer.get(p.playerId) ?? [];
      arr.push(p);
      paymentsByPlayer.set(p.playerId, arr);
    }

    const out: AccountRow[] = [];
    for (const p of players) {
      if (!p.isActive) continue;
      if (!isBilledFrequency(p)) continue;

      const scheduledGames = gamesByPlayer.get(p.id) ?? 0;
      const contract = p.contractedFrequency as ContractKind;

      // Subs with zero scheduled games have nothing to bill — skip them so
      // the table doesn't get cluttered with $0 rows for inactive subs.
      if (contract === "0" && scheduledGames === 0) continue;

      let base = 0;
      let extras = 0;
      let extraGames = 0;
      if (contract === "1") {
        base = params.priceDons1;
      } else if (contract === "2") {
        base = params.priceDons2;
      } else if (contract === "2+") {
        base = params.priceDons2;
        extraGames = Math.max(0, scheduledGames - 2 * totalWeeks);
        extras = extraGames * params.priceExtraHour;
      } else if (contract === "0") {
        // Subs: no base fee — charged per game played
        base = 0;
        extraGames = scheduledGames;
        extras = scheduledGames * params.priceSubs;
      }
      const fee = base + extras;
      const myPayments = (paymentsByPlayer.get(p.id) ?? []).sort(
        (a, b) => a.paidDate.localeCompare(b.paidDate)
      );
      const deposits = myPayments.reduce((s, x) => s + x.amount, 0);
      const balance = fee - deposits;

      out.push({
        player: p,
        scheduledGames,
        contract,
        base,
        extras,
        extraGames,
        fee,
        payments: myPayments,
        deposits,
        balance,
      });
    }

    out.sort((a, b) => a.player.lastName.localeCompare(b.player.lastName));
    return out;
  })();

  const totals = rows.reduce(
    (acc, r) => ({
      fee: acc.fee + r.fee,
      deposits: acc.deposits + r.deposits,
      balance: acc.balance + r.balance,
    }),
    { fee: 0, deposits: 0, balance: 0 }
  );

  const openPaymentForm = (playerId: number) => {
    setOpenPlayerId((prev) => (prev === playerId ? null : playerId));
    setFormDate(todayIso());
    setFormAmount("");
    setFormNote("");
    setFormError("");
  };

  const submitPayment = async (playerId: number) => {
    setFormError("");
    const amount = parseFloat(formAmount);
    if (!Number.isFinite(amount)) {
      setFormError("Amount must be a number.");
      return;
    }
    if (!formDate) {
      setFormError("Date is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/player-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          paidDate: formDate,
          amount,
          note: formNote || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormError(data.error ?? "Failed to add payment.");
      } else {
        setFormAmount("");
        setFormNote("");
        await loadData();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removePayment = async (paymentId: number) => {
    if (!window.confirm("Remove this payment?")) return;
    try {
      const res = await fetch(`/api/player-payments?id=${paymentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(`Failed: ${data.error ?? "unknown"}`);
        return;
      }
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownloadPdf = () => {
    if (!season) return;
    generateAccountsSummaryPdf(
      rows.map((r) => ({
        lastName: r.player.lastName,
        firstName: r.player.firstName,
        contractedFrequency: r.contract,
        scheduledGames: r.scheduledGames,
        extraGames: r.extraGames,
        fee: r.fee,
        deposits: r.deposits,
        balance: r.balance,
      })),
      { startDate: season.startDate, endDate: season.endDate },
      {
        priceDons1: params.priceDons1,
        priceDons2: params.priceDons2,
        priceExtraHour: params.priceExtraHour,
        priceSubs: params.priceSubs,
      }
    );
  };

  if (!season) {
    return <p className="text-sm text-muted">Loading season…</p>;
  }
  if (loading) {
    return <p className="text-sm text-muted">Loading accounts…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">Error: {error}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-muted">
          <strong>Rates:</strong> 1x {fmt(params.priceDons1)} · 2x {fmt(params.priceDons2)} · Per extra game {fmt(params.priceExtraHour)} · Sub per game {fmt(params.priceSubs)}{" "}
          <span className="text-xs">(edit on the Don&apos;s tab)</span>
        </div>
        <button
          onClick={handleDownloadPdf}
          className="border-2 border-primary text-primary px-4 py-2 rounded text-sm hover:bg-blue-50 transition-colors"
        >
          Download PDF
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Last, First</th>
              <th className="text-center px-3 py-2 font-medium">Contract</th>
              <th className="text-right px-3 py-2 font-medium">Games</th>
              <th className="text-right px-3 py-2 font-medium">Extras</th>
              <th className="text-right px-3 py-2 font-medium">Fee</th>
              <th className="text-right px-3 py-2 font-medium">Deposits</th>
              <th className="text-right px-3 py-2 font-medium">Balance</th>
              <th className="w-12 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-muted"
                >
                  No contract players found for this season.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isOpen = openPlayerId === r.player.id;
              const balanceClass =
                r.balance > 0
                  ? "text-red-700 font-semibold"
                  : r.balance < 0
                    ? "text-green-700"
                    : "";
              return (
                <>
                  <tr
                    key={r.player.id}
                    className={`border-t border-border ${
                      isOpen ? "bg-blue-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      {r.player.lastName}, {r.player.firstName}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.contract === "0"
                        ? "Sub"
                        : r.contract === "2+"
                          ? "2+/wk"
                          : `${r.contract}/wk`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.scheduledGames}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.contract === "2+" || r.contract === "0"
                        ? r.extraGames
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(r.fee)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(r.deposits)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${balanceClass}`}>
                      {r.balance < 0 ? `(${fmt(-r.balance)})` : fmt(r.balance)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => openPaymentForm(r.player.id)}
                        className="text-primary hover:underline text-xs"
                        title={isOpen ? "Close payments" : "View / add payments"}
                      >
                        {isOpen ? "▼" : "▶"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-blue-50/50">
                      <td colSpan={8} className="px-3 py-3 border-t border-border">
                        <div className="text-xs text-muted mb-2 font-medium">
                          Payments — {r.player.lastName}, {r.player.firstName}
                        </div>
                        {r.payments.length === 0 ? (
                          <p className="text-xs text-muted italic mb-3">
                            No payments recorded yet.
                          </p>
                        ) : (
                          <table className="w-full text-xs mb-3 border border-border">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="text-left px-2 py-1">Date</th>
                                <th className="text-right px-2 py-1 w-32">Amount</th>
                                <th className="text-left px-2 py-1">Note</th>
                                <th className="w-12 px-2 py-1"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.payments.map((pay) => (
                                <tr key={pay.id} className="border-t border-border">
                                  <td className="px-2 py-1">{pay.paidDate}</td>
                                  <td className="px-2 py-1 text-right font-mono">
                                    {fmt(pay.amount)}
                                  </td>
                                  <td className="px-2 py-1 text-muted">
                                    {pay.note || "—"}
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    <button
                                      onClick={() => removePayment(pay.id)}
                                      className="text-red-600 hover:underline text-xs"
                                      title="Remove this payment"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {/* Add payment form */}
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="block text-xs text-muted">Date</label>
                            <input
                              type="date"
                              value={formDate}
                              onChange={(e) => setFormDate(e.target.value)}
                              className="border border-border rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-muted">Amount</label>
                            <input
                              type="number"
                              step="0.01"
                              value={formAmount}
                              onChange={(e) => setFormAmount(e.target.value)}
                              placeholder="0.00"
                              className="border border-border rounded px-2 py-1 text-sm w-28"
                            />
                          </div>
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs text-muted">Note (optional)</label>
                            <input
                              type="text"
                              value={formNote}
                              onChange={(e) => setFormNote(e.target.value)}
                              placeholder="e.g. Check #123"
                              className="border border-border rounded px-2 py-1 text-sm w-full"
                            />
                          </div>
                          <button
                            onClick={() => submitPayment(r.player.id)}
                            disabled={submitting || !formAmount}
                            className="bg-primary text-white px-3 py-1.5 rounded text-sm hover:opacity-90 disabled:opacity-50"
                          >
                            {submitting ? "Adding..." : "Add Payment"}
                          </button>
                        </div>
                        {formError && (
                          <p className="text-xs text-red-600 mt-1">{formError}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-100 font-semibold">
              <tr className="border-t-2 border-border">
                <td colSpan={4} className="px-3 py-2">
                  Totals ({rows.length} player{rows.length !== 1 ? "s" : ""})
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmt(totals.fee)}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {fmt(totals.deposits)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    totals.balance > 0
                      ? "text-red-700"
                      : totals.balance < 0
                        ? "text-green-700"
                        : ""
                  }`}
                >
                  {totals.balance < 0 ? `(${fmt(-totals.balance)})` : fmt(totals.balance)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
