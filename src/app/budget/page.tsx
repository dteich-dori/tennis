"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
  totalWeeks: number;
}

interface BudgetParamsData {
  weeksPerSeason: number;
  gameDurationHours: number;
  costPerCourtPerHour: number;
  priceDons1: number;
  priceDons2: number;
  priceDons2plus: number;
  priceSubs: number;
  priceSolo: number;
  priceExtraHour: number;
  priceSoloSeason: number;
}

interface BudgetItem {
  id: number;
  seasonId: number;
  category: string;
  name: string;
  amount: number;
  sortOrder: number;
}

interface ComputedData {
  normalDonsGames: number;
  normalSoloGames: number;
  normalGameCount: number;
  holidayGames: number;
  playerCounts: {
    dons0: number;
    dons1: number;
    dons2: number;
    dons2plus: number;
    solo: number;
  };
  extraGames2plus: number;
  subsGameCount: number;
  totalSoloGamesFromDB: number;
  soloPlayers: { name: string; soloGames: number }[];
  donsCourtsPerWeek: number;
  soloCourtsPerWeek: number;
}

const PARAM_DEFAULTS: BudgetParamsData = {
  weeksPerSeason: 36,
  gameDurationHours: 1.5,
  costPerCourtPerHour: 1740,
  priceDons1: 0,
  priceDons2: 0,
  priceDons2plus: 0,
  priceSubs: 0,
  priceSolo: 0,
  priceExtraHour: 0,
  priceSoloSeason: 0,
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

type BudgetTab = "dons" | "solo";

export default function BudgetPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [params, setParams] = useState<BudgetParamsData>(PARAM_DEFAULTS);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [computed, setComputed] = useState<ComputedData | null>(null);
  const [activeTab, setActiveTab] = useState<BudgetTab>("dons");

  // Track whether initial load is complete (skip auto-save on first render)
  const paramsLoaded = useRef(false);

  // Add/edit item state
  const [addingCategory, setAddingCategory] = useState<"income" | "expense" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemError, setItemError] = useState("");

  // Load season
  const loadSeason = useCallback(async () => {
    const res = await fetch("/api/seasons");
    const data = (await res.json()) as Season[];
    if (data.length > 0) {
      setSeason(data[data.length - 1]);
    }
  }, []);

  // Load budget params
  const loadParams = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/budget-params?seasonId=${seasonId}`);
    if (res.ok) {
      const data = (await res.json()) as BudgetParamsData;
      setParams({
        weeksPerSeason: data.weeksPerSeason ?? PARAM_DEFAULTS.weeksPerSeason,
        gameDurationHours: data.gameDurationHours ?? PARAM_DEFAULTS.gameDurationHours,
        costPerCourtPerHour: data.costPerCourtPerHour ?? PARAM_DEFAULTS.costPerCourtPerHour,
        priceDons1: data.priceDons1 ?? 0,
        priceDons2: data.priceDons2 ?? 0,
        priceDons2plus: data.priceDons2plus ?? 0,
        priceSubs: data.priceSubs ?? 0,
        priceSolo: data.priceSolo ?? 0,
        priceExtraHour: data.priceExtraHour ?? 0,
        priceSoloSeason: data.priceSoloSeason ?? 0,
      });
    }
  }, []);

  // Load budget items
  const loadItems = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/budget-items?seasonId=${seasonId}`);
    if (res.ok) {
      const data = (await res.json()) as BudgetItem[];
      setItems(data);
    }
  }, []);

  // Load computed data
  const loadComputed = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/budget-computed?seasonId=${seasonId}`);
    if (res.ok) {
      const data = (await res.json()) as ComputedData;
      setComputed(data);
    }
  }, []);

  useEffect(() => {
    loadSeason();
  }, [loadSeason]);

  useEffect(() => {
    if (season) {
      loadParams(season.id);
      loadItems(season.id);
      loadComputed(season.id);
    }
  }, [season, loadParams, loadItems, loadComputed]);

  // Auto-save parameters on change (debounced 600ms)
  useEffect(() => {
    if (!season) return;
    if (!paramsLoaded.current) {
      paramsLoaded.current = true;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        await fetch("/api/budget-params", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonId: season.id,
            weeksPerSeason: params.weeksPerSeason,
            gameDurationHours: params.gameDurationHours,
            costPerCourtPerHour: params.costPerCourtPerHour,
            priceDons1: params.priceDons1,
            priceDons2: params.priceDons2,
            priceDons2plus: params.priceDons2plus,
            priceSubs: params.priceSubs,
            priceSolo: params.priceSolo,
            priceExtraHour: params.priceExtraHour,
            priceSoloSeason: params.priceSoloSeason,
          }),
        });
      } catch {
        // silently fail — values remain in local state
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [season, params]);

  // Add or update a budget item
  const handleSaveItem = async () => {
    if (!season) return;
    const amount = parseFloat(itemAmount);
    if (!itemName.trim()) {
      setItemError("Name is required.");
      return;
    }
    if (isNaN(amount) || amount < 0) {
      setItemError("Amount must be a non-negative number.");
      return;
    }
    setItemError("");

    if (editingId) {
      // Update
      const res = await fetch("/api/budget-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: itemName.trim(), amount }),
      });
      if (res.ok) {
        await loadItems(season.id);
        cancelItemForm();
      }
    } else if (addingCategory) {
      // Create
      const res = await fetch("/api/budget-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          category: addingCategory,
          name: itemName.trim(),
          amount,
        }),
      });
      if (res.ok) {
        await loadItems(season.id);
        cancelItemForm();
      }
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!season) return;
    await fetch(`/api/budget-items?id=${id}`, { method: "DELETE" });
    await loadItems(season.id);
  };

  const startEdit = (item: BudgetItem) => {
    setEditingId(item.id);
    setAddingCategory(null);
    setItemName(item.name);
    setItemAmount(String(item.amount));
    setItemError("");
  };

  const startAdd = (category: "income" | "expense") => {
    setAddingCategory(category);
    setEditingId(null);
    setItemName("");
    setItemAmount("");
    setItemError("");
  };

  const cancelItemForm = () => {
    setAddingCategory(null);
    setEditingId(null);
    setItemName("");
    setItemAmount("");
    setItemError("");
  };

  // Computed budget values
  // costPerCourtPerHour is a seasonal rate (cost to book 1 court-hour/week for the whole season)
  // Expense = courtsPerWeek × gameDurationHours × seasonalRate
  const donsCourtsPerWeek = computed?.donsCourtsPerWeek ?? 0;
  const soloCourtsPerWeek = computed?.soloCourtsPerWeek ?? 0;
  const donsCourtCost = donsCourtsPerWeek * params.gameDurationHours * params.costPerCourtPerHour;
  const soloCourtCost = soloCourtsPerWeek * params.gameDurationHours * params.costPerCourtPerHour;
  const clinicCost = params.costPerCourtPerHour * 1; // 1 hour/week for the season
  const totalCourtCost = donsCourtCost + soloCourtCost + clinicCost;

  // Computed income from player categories
  // 1x/2x/2+ rows: price is per player per season → Revenue = players × $/season
  // Extra games & Subs: price is per game → Revenue = games × $/game
  const extraGames2plus = computed?.extraGames2plus ?? 0;

  const donsIncomeRows = computed ? [
    { label: "1x/week", qty: computed.playerCounts.dons1, unit: "players", price: params.priceDons1, priceUnit: "$/player", key: "priceDons1" as const },
    { label: "2x/week", qty: computed.playerCounts.dons2, unit: "players", price: params.priceDons2, priceUnit: "$/player", key: "priceDons2" as const },
    { label: "2+/week", qty: computed.playerCounts.dons2plus, unit: "players", price: params.priceDons2plus, priceUnit: "$/player", key: "priceDons2plus" as const },
    { label: "2+ Extra Games", qty: extraGames2plus, unit: "games", price: params.priceExtraHour, priceUnit: "$/game", key: "priceExtraHour" as const },
    { label: "Subs", qty: computed.subsGameCount, unit: "games", price: params.priceSubs, priceUnit: "$/game", key: "priceSubs" as const },
  ] : [];
  const donsIncome = donsIncomeRows.reduce((s, r) => s + r.qty * r.price, 0);

  // Solo income: per-game revenue
  const soloPlayerList = computed?.soloPlayers ?? [];
  const soloIncome = soloPlayerList.reduce((s, p) => s + p.soloGames * params.priceSolo, 0);

  const computedIncome = donsIncome + soloIncome;

  const incomeItems = items.filter((i) => i.category === "income");
  const expenseItems = items.filter((i) => i.category === "expense");
  const manualIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
  const manualExpense = expenseItems.reduce((s, i) => s + i.amount, 0);

  // Don's totals (includes manual items + clinic)
  const donsExpenseTotal = donsCourtCost + clinicCost + manualExpense;
  const donsIncomeTotal = donsIncome + manualIncome;
  const donsNet = donsIncomeTotal - donsExpenseTotal;

  // Solo totals
  const soloExpenseTotal = soloCourtCost;
  const soloIncomeTotal = soloIncome;
  const soloNet = soloIncomeTotal - soloExpenseTotal;

  // Combined totals
  const totalIncome = donsIncomeTotal + soloIncomeTotal;
  const totalExpenses = donsExpenseTotal + soloExpenseTotal;
  const net = totalIncome - totalExpenses;

  if (!season) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Budget</h1>
        <p className="text-muted text-sm">No season found. Create a season first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Budget</h1>

      {/* Parameters */}
      <div className="border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">Parameters</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-muted mb-1">Weeks per Season</label>
            <input type="number" min="1" max="52" step="1" value={params.weeksPerSeason}
              onChange={(e) => setParams({ ...params, weeksPerSeason: parseInt(e.target.value) || 36 })}
              className="border border-border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Game Duration (hours)</label>
            <input type="number" min="0.5" step="0.5" value={params.gameDurationHours}
              onChange={(e) => setParams({ ...params, gameDurationHours: parseFloat(e.target.value) || 1.5 })}
              className="border border-border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Seasonal Cost per Court/Hr ($)</label>
            <input type="number" min="0" step="1" value={params.costPerCourtPerHour}
              onChange={(e) => setParams({ ...params, costPerCourtPerHour: parseFloat(e.target.value) || 0 })}
              className="border border-border rounded px-3 py-2 text-sm w-full" />
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: "dons" as BudgetTab, label: "Don\u2019s" },
          { key: "solo" as BudgetTab, label: "Solo" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); cancelItemForm(); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Don's Tab ── */}
      {activeTab === "dons" && (
        <>
          {/* Don's Income */}
          <div className="border border-border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">Income</h2>
            <table className="w-full text-sm border border-border mb-3">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Qty</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Price</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Revenue</th>
                  <th className="text-right px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {donsIncomeRows.map((row) => (
                  <tr key={row.key} className="bg-gray-50 border-t border-border">
                    <td className="px-3 py-2 text-muted">{row.label}</td>
                    <td className="px-3 py-2 text-right text-muted">
                      {row.qty} <span className="text-xs">{row.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm text-muted">$</span>
                        <input type="number" min="0" step="1" value={row.price || ""} placeholder="0"
                          onChange={(e) => setParams({ ...params, [row.key]: parseFloat(e.target.value) || 0 })}
                          className="border border-border rounded px-2 py-1 text-sm w-24 text-right" />
                      </div>
                      <div className="text-xs text-muted mt-0.5">{row.priceUnit}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {row.price > 0 ? formatCurrency(row.qty * row.price) : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted">computed</td>
                  </tr>
                ))}
                {/* Manual income items */}
                {incomeItems.length > 0 && (
                  <tr className="border-t-2 border-border bg-gray-100">
                    <td colSpan={5} className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-gray-600">Other Income</td>
                  </tr>
                )}
                {incomeItems.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    {editingId === item.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)}
                            className="border border-border rounded px-2 py-1 text-sm w-full" />
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" step="1" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)}
                            className="border border-border rounded px-2 py-1 text-sm w-full text-right" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={handleSaveItem} className="text-primary text-xs hover:underline mr-2">Save</button>
                          <button onClick={cancelItemForm} className="text-muted text-xs hover:underline">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.amount)}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => startEdit(item)} className="text-primary text-xs hover:underline mr-2">Edit</button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-danger text-xs hover:underline">Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {addingCategory === "income" ? (
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name" className="border border-border rounded px-3 py-2 text-sm w-full" />
                </div>
                <div className="w-32">
                  <input type="number" min="0" step="1" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} placeholder="Amount" className="border border-border rounded px-3 py-2 text-sm w-full text-right" />
                </div>
                <button onClick={handleSaveItem} className="bg-primary text-white px-3 py-2 rounded text-sm hover:bg-primary-hover transition-colors">Add</button>
                <button onClick={cancelItemForm} className="text-muted px-3 py-2 text-sm hover:underline">Cancel</button>
              </div>
            ) : (
              <button onClick={() => startAdd("income")} className="text-primary text-sm hover:underline">+ Add Income Item</button>
            )}
            {itemError && addingCategory === "income" && <p className="text-danger text-xs mt-1">{itemError}</p>}
            <div className="border-t border-border mt-3 pt-3 flex justify-between font-medium text-sm">
              <span>Don&apos;s Income</span>
              <span>{formatCurrency(donsIncomeTotal)}</span>
            </div>
          </div>

          {/* Don's Expenses */}
          <div className="border border-border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">Expenses</h2>
            <table className="w-full text-sm border border-border mb-3">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-right px-3 py-2 font-medium w-32">Amount</th>
                  <th className="text-right px-3 py-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 border-t border-border">
                  <td className="px-3 py-2 text-muted">
                    Court Rental
                    <span className="text-xs ml-2">({donsCourtsPerWeek} courts/wk &times; {params.gameDurationHours}h &times; {formatCurrency(params.costPerCourtPerHour)})</span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(donsCourtCost)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted">computed</td>
                </tr>
                <tr className="bg-gray-50 border-t border-border">
                  <td className="px-3 py-2 text-muted">
                    Clinic on Mondays
                    <span className="text-xs ml-2">(1h &times; {formatCurrency(params.costPerCourtPerHour)}/hr)</span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(clinicCost)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted">computed</td>
                </tr>
                {expenseItems.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    {editingId === item.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)}
                            className="border border-border rounded px-2 py-1 text-sm w-full" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" step="1" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)}
                            className="border border-border rounded px-2 py-1 text-sm w-full text-right" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={handleSaveItem} className="text-primary text-xs hover:underline mr-2">Save</button>
                          <button onClick={cancelItemForm} className="text-muted text-xs hover:underline">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.amount)}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => startEdit(item)} className="text-primary text-xs hover:underline mr-2">Edit</button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-danger text-xs hover:underline">Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {addingCategory === "expense" ? (
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name" className="border border-border rounded px-3 py-2 text-sm w-full" />
                </div>
                <div className="w-32">
                  <input type="number" min="0" step="1" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} placeholder="Amount" className="border border-border rounded px-3 py-2 text-sm w-full text-right" />
                </div>
                <button onClick={handleSaveItem} className="bg-primary text-white px-3 py-2 rounded text-sm hover:bg-primary-hover transition-colors">Add</button>
                <button onClick={cancelItemForm} className="text-muted px-3 py-2 text-sm hover:underline">Cancel</button>
              </div>
            ) : (
              <button onClick={() => startAdd("expense")} className="text-primary text-sm hover:underline">+ Add Expense Item</button>
            )}
            {itemError && addingCategory === "expense" && <p className="text-danger text-xs mt-1">{itemError}</p>}
            <div className="border-t border-border mt-3 pt-3 flex justify-between font-medium text-sm">
              <span>Don&apos;s Expenses</span>
              <span>{formatCurrency(donsExpenseTotal)}</span>
            </div>
          </div>

          {/* Don's Summary */}
          <div className="border border-border rounded-lg p-6 mb-6 bg-gray-50">
            <h2 className="font-semibold mb-3">Don&apos;s Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Income</span>
                <span className="font-medium">{formatCurrency(donsIncomeTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Expenses</span>
                <span className="font-medium">{formatCurrency(donsExpenseTotal)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold">
                <span>Net</span>
                <span className={donsNet >= 0 ? "text-green-700" : "text-danger"}>{formatCurrency(donsNet)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Solo Tab ── */}
      {activeTab === "solo" && (
        <>
          {/* Solo Income */}
          <div className="border border-border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">Income</h2>
            {/* Price inputs */}
            <div className="mb-4">
              <div>
                <label className="block text-sm text-muted mb-1">Per Game</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted">$</span>
                  <input type="number" min="0" step="1" value={params.priceSolo || ""} placeholder="0"
                    onChange={(e) => setParams({ ...params, priceSolo: parseFloat(e.target.value) || 0 })}
                    className="border border-border rounded px-2 py-1 text-sm w-24 text-right" />
                </div>
              </div>
            </div>
            <table className="w-full text-sm border border-border mb-3">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">Player</th>
                  <th className="text-right px-3 py-2 font-medium w-20">Games</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {soloPlayerList.map((player) => {
                  const gameRev = player.soloGames * params.priceSolo;
                  return (
                    <tr key={player.name} className="bg-gray-50 border-t border-border">
                      <td className="px-3 py-2 text-muted">{player.name}</td>
                      <td className="px-3 py-2 text-right text-muted">{player.soloGames}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {gameRev > 0 ? formatCurrency(gameRev) : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
                {/* Summary row */}
                {soloPlayerList.length > 0 && (
                  <tr className="border-t-2 border-border font-bold">
                    <td className="px-3 py-2">Total ({soloPlayerList.length} players)</td>
                    <td className="px-3 py-2 text-right">{soloPlayerList.reduce((s, p) => s + p.soloGames, 0)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(soloIncome)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="border-t border-border mt-3 pt-3 flex justify-between font-medium text-sm">
              <span>Solo Income</span>
              <span>{formatCurrency(soloIncomeTotal)}</span>
            </div>
          </div>

          {/* Solo Expenses */}
          <div className="border border-border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">Expenses</h2>
            <table className="w-full text-sm border border-border mb-3">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-right px-3 py-2 font-medium w-32">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 border-t border-border">
                  <td className="px-3 py-2 text-muted">
                    Court Rental
                    <span className="text-xs ml-2">({soloCourtsPerWeek} courts/wk &times; {params.gameDurationHours}h &times; {formatCurrency(params.costPerCourtPerHour)})</span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(soloCourtCost)}</td>
                </tr>
              </tbody>
            </table>
            <div className="border-t border-border mt-3 pt-3 flex justify-between font-medium text-sm">
              <span>Solo Expenses</span>
              <span>{formatCurrency(soloExpenseTotal)}</span>
            </div>
          </div>

          {/* Solo Summary */}
          <div className="border border-border rounded-lg p-6 mb-6 bg-gray-50">
            <h2 className="font-semibold mb-3">Solo Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Income</span>
                <span className="font-medium">{formatCurrency(soloIncomeTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Expenses</span>
                <span className="font-medium">{formatCurrency(soloExpenseTotal)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold">
                <span>Net</span>
                <span className={soloNet >= 0 ? "text-green-700" : "text-danger"}>{formatCurrency(soloNet)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Combined Summary (always visible) */}
      <div className="border border-border rounded-lg p-6 mb-6 bg-gray-50">
        <h2 className="font-semibold mb-3">Combined Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Don&apos;s Net</span>
            <span className={donsNet >= 0 ? "font-medium text-green-700" : "font-medium text-danger"}>{formatCurrency(donsNet)}</span>
          </div>
          <div className="flex justify-between">
            <span>Solo Net</span>
            <span className={soloNet >= 0 ? "font-medium text-green-700" : "font-medium text-danger"}>{formatCurrency(soloNet)}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between font-bold">
            <span>Total Net</span>
            <span className={net >= 0 ? "text-green-700" : "text-danger"}>{formatCurrency(net)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
