"use client";

import { useCallback, useEffect, useState } from "react";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

interface Batch {
  id: number;
  sentAt: string;
  recipientGroup: string;
  recipientCount: number;
  channel: "text" | "text+email" | "text→email" | "email" | "other";
  estimatedSmsCount: number;
}

interface CostData {
  seasonStartDate: string;
  monthsElapsed: number;
  smsOnlyCount: number;
  dualSendCount: number;
  fallbackCount: number;
  estimatedSmsSegments: number;
  batches: Batch[];
}

// Stored on the client so the user's last-entered rates persist across visits.
const LS_KEY = "twilio-cost-rates-v1";

interface Rates {
  // One-time setup
  brandRegistration: number;
  campaignRegistration: number;
  // Monthly recurring
  phoneNumberMonthly: number;
  campaignMonthly: number;
  // Per outbound message segment
  perSmsTwilio: number;
  perSmsCarrierFee: number;
  // Average segments per text (longer messages split into multiple)
  avgSegmentsPerText: number;
}

const DEFAULT_RATES: Rates = {
  brandRegistration: 4,       // A2P 10DLC Sole Proprietor brand
  campaignRegistration: 15,   // A2P 10DLC campaign registration
  phoneNumberMonthly: 1.15,   // local US 10DLC number
  campaignMonthly: 1.5,       // T-Mobile + AT&T pass-through (varies)
  perSmsTwilio: 0.0083,       // Twilio base outbound SMS US
  perSmsCarrierFee: 0.005,    // Average A2P 10DLC carrier surcharge (transactional)
  avgSegmentsPerText: 1.2,    // Most reminders are 1 segment; some longer
};

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TwilioCostPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [data, setData] = useState<CostData | null>(null);
  const [error, setError] = useState("");
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [showBatches, setShowBatches] = useState(false);

  // Load season + cost data
  const load = useCallback(async () => {
    try {
      const sres = await fetch("/api/seasons");
      const seasonsList = (await sres.json()) as Season[];
      if (seasonsList.length === 0) {
        setError("No season found. Create a season first.");
        return;
      }
      const latest = seasonsList[seasonsList.length - 1];
      setSeason(latest);
      const cres = await fetch(`/api/communications/twilio-cost?seasonId=${latest.id}`);
      if (!cres.ok) {
        setError("Failed to load Twilio cost data.");
        return;
      }
      setData((await cres.json()) as CostData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Restore saved rates from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Rates>;
        setRates((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rates));
    } catch {
      /* ignore */
    }
  }, [rates]);

  const updateRate = (key: keyof Rates, val: number) =>
    setRates((r) => ({ ...r, [key]: Number.isFinite(val) ? val : 0 }));

  // Calculations
  const oneTime = rates.brandRegistration + rates.campaignRegistration;
  const monthly = rates.phoneNumberMonthly + rates.campaignMonthly;
  const monthsElapsed = data?.monthsElapsed ?? 0;
  const accruedMonthly = monthly * monthsElapsed;
  const segments = (data?.estimatedSmsSegments ?? 0) * rates.avgSegmentsPerText;
  const perSmsAll = rates.perSmsTwilio + rates.perSmsCarrierFee;
  const accruedSms = segments * perSmsAll;
  const totalAccrued = oneTime + accruedMonthly + accruedSms;

  // Projection to end of season (12 months from start)
  const seasonStartIso = data?.seasonStartDate ?? "";
  const seasonStart = seasonStartIso ? new Date(seasonStartIso + "T00:00:00") : null;
  const projectedMonths = seasonStart
    ? 12 // assume 1-year cost projection
    : 0;
  const projectedMonthly = monthly * projectedMonths;
  const projectedSms = segments > 0 && monthsElapsed > 0
    ? (segments / monthsElapsed) * 12 * perSmsAll
    : 0;
  const projectedTotal = oneTime + projectedMonthly + projectedSms;

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Twilio SMS Cost Estimate</h1>
      <p className="text-sm text-muted mb-6">
        Estimate the accrued and projected cost of sending text messages
        via Twilio. Rates default to typical US A2P 10DLC pricing — adjust
        to match your actual Twilio billing. SMS counts are pulled live
        from the email log; per-segment counts assume an average of{" "}
        <strong>{rates.avgSegmentsPerText.toFixed(1)}</strong> segments per
        text (one segment ≈ 160 chars).
      </p>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Rates form */}
      <section className="border border-border rounded-lg p-4 mb-6">
        <h2 className="font-semibold mb-3">Rates (US$, editable)</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <RateRow label="One-time: A2P 10DLC brand registration" value={rates.brandRegistration} step="0.01" onChange={(v) => updateRate("brandRegistration", v)} />
          <RateRow label="One-time: A2P 10DLC campaign registration" value={rates.campaignRegistration} step="0.01" onChange={(v) => updateRate("campaignRegistration", v)} />
          <RateRow label="Monthly: Phone number rental" value={rates.phoneNumberMonthly} step="0.01" onChange={(v) => updateRate("phoneNumberMonthly", v)} />
          <RateRow label="Monthly: Campaign / carrier maintenance" value={rates.campaignMonthly} step="0.01" onChange={(v) => updateRate("campaignMonthly", v)} />
          <RateRow label="Per segment: Twilio base SMS rate" value={rates.perSmsTwilio} step="0.0001" onChange={(v) => updateRate("perSmsTwilio", v)} />
          <RateRow label="Per segment: Carrier (A2P 10DLC) pass-through" value={rates.perSmsCarrierFee} step="0.0001" onChange={(v) => updateRate("perSmsCarrierFee", v)} />
          <RateRow label="Avg segments per text" value={rates.avgSegmentsPerText} step="0.1" onChange={(v) => updateRate("avgSegmentsPerText", v)} />
        </div>
        <button
          onClick={() => setRates(DEFAULT_RATES)}
          className="mt-3 text-xs text-primary hover:underline"
        >
          Reset to defaults
        </button>
      </section>

      {/* Accrued cost breakdown */}
      <section className="border border-border rounded-lg p-4 mb-6">
        <h2 className="font-semibold mb-3">Accrued to date</h2>
        {data ? (
          <table className="w-full text-sm">
            <tbody>
              <Row label="Season start" value={data.seasonStartDate} />
              <Row label="Months elapsed" value={data.monthsElapsed.toFixed(1)} />
              <Row label="SMS-only batches recipients" value={String(data.smsOnlyCount)} />
              <Row label="Email+Text recipients" value={String(data.dualSendCount)} />
              <Row label="Text→Email fallback recipients" value={String(data.fallbackCount)} />
              <Row label="Estimated SMS recipients (sum)" value={String(data.estimatedSmsSegments)} bold />
              <Row label={`× avg segments/text (${rates.avgSegmentsPerText})`} value={segments.toFixed(1)} />
              <tr><td colSpan={2}><hr className="my-2 border-border" /></td></tr>
              <Row label="One-time setup fees" value={fmt$(oneTime)} />
              <Row label={`Monthly fees × ${data.monthsElapsed.toFixed(1)} months`} value={fmt$(accruedMonthly)} />
              <Row label={`SMS segments × ${fmt$(perSmsAll)}`} value={fmt$(accruedSms)} />
              <tr><td colSpan={2}><hr className="my-2 border-border" /></td></tr>
              <Row label="Total accrued" value={fmt$(totalAccrued)} bold large />
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </section>

      {/* Projected (12-month) cost */}
      <section className="border border-border rounded-lg p-4 mb-6">
        <h2 className="font-semibold mb-3">Projected (12 months from season start)</h2>
        {data ? (
          <table className="w-full text-sm">
            <tbody>
              <Row label="One-time setup fees" value={fmt$(oneTime)} />
              <Row label={`Monthly fees × ${projectedMonths} months`} value={fmt$(projectedMonthly)} />
              <Row label="Projected SMS cost (annualised from current usage)" value={fmt$(projectedSms)} />
              <tr><td colSpan={2}><hr className="my-2 border-border" /></td></tr>
              <Row label="Projected 12-month total" value={fmt$(projectedTotal)} bold large />
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </section>

      {/* Optional batch detail */}
      {data && data.batches.length > 0 && (
        <section className="border border-border rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Batch detail ({data.batches.length})</h2>
            <button
              onClick={() => setShowBatches((s) => !s)}
              className="text-sm text-primary hover:underline"
            >
              {showBatches ? "Hide" : "Show"}
            </button>
          </div>
          {showBatches && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1">Sent</th>
                    <th className="text-left px-2 py-1">Group / Channel</th>
                    <th className="text-right px-2 py-1">Recipients</th>
                    <th className="text-right px-2 py-1">Est. SMS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.batches.map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-2 py-1">{b.sentAt}</td>
                      <td className="px-2 py-1">{b.recipientGroup}</td>
                      <td className="px-2 py-1 text-right">{b.recipientCount}</td>
                      <td className="px-2 py-1 text-right">{b.estimatedSmsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <p className="text-xs text-muted">
        Notes: SMS counts are estimates derived from the email_log&apos;s
        recipientGroup labels (Twilio doesn&apos;t give us a per-message
        billing feed at runtime). Each batch recipient is counted once
        regardless of message length; the &ldquo;avg segments per text&rdquo;
        multiplier accounts for messages longer than 160 chars. The
        Email+Text recipient count assumes every recipient received an
        SMS, which over-counts when some recipients had email-only profiles.
        For exact billing, check the{" "}
        <a
          href="https://console.twilio.com/us1/billing/usage"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Twilio Console
        </a>.
      </p>
      {season && <p className="text-xs text-muted mt-2">Season: {season.startDate} – {season.endDate}</p>}
    </div>
  );
}

function RateRow({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="border border-border rounded px-2 py-1 text-sm w-28 text-right"
      />
    </label>
  );
}

function Row({
  label,
  value,
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <tr>
      <td className={`py-1 ${bold ? "font-semibold" : ""} ${large ? "text-base" : ""}`}>{label}</td>
      <td className={`py-1 text-right font-mono ${bold ? "font-semibold" : ""} ${large ? "text-base" : ""}`}>{value}</td>
    </tr>
  );
}
