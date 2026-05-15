"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";

type BudgetLine = {
  item: string;
  percent: number;
  pending: boolean;
};

type BudgetPhase = {
  key: string;
  label: string;
  draw: string;
  pending: boolean;
  lines: BudgetLine[];
};

const budgetPhases: BudgetPhase[] = [
  {
    key: "pre",
    label: "Pre",
    draw: "Before construction",
    pending: true,
    lines: [
      { item: "Architect", percent: 0.01, pending: true },
      { item: "Risk / Liability Insurance", percent: 0.006, pending: true },
      { item: "Building Permits", percent: 0.012, pending: true },
      { item: "Change Order (Pre Phase)", percent: 0, pending: true },
    ],
  },
  {
    key: "p1",
    label: "P1",
    draw: "Draw 1",
    pending: false,
    lines: [
      { item: "Fill Dirt", percent: 0.0075, pending: false },
      { item: "Plumbing Rough-in", percent: 0.01278, pending: false },
      { item: "Pre-form Survey", percent: 0.0022, pending: false },
      { item: "Termite Treatment", percent: 0.0011, pending: false },
      { item: "Foundation Rebar Materials", percent: 0.018, pending: false },
      { item: "Foundation Concrete Materials", percent: 0.0444, pending: false },
      { item: "Foundation Labor", percent: 0.0218, pending: false },
    ],
  },
  {
    key: "p2",
    label: "P2",
    draw: "Draw 2",
    pending: true,
    lines: [
      { item: "Wall Framing Materials", percent: 0.035, pending: true },
      { item: "Wall Framing Labor", percent: 0.028, pending: true },
      { item: "Roof Framing Materials", percent: 0.018, pending: true },
      { item: "Roof Framing Labor", percent: 0.014, pending: true },
      { item: "Roof Shingles Materials", percent: 0.019, pending: true },
      { item: "Roof Shingles Labor", percent: 0.012, pending: true },
      { item: "Windows", percent: 0.024, pending: true },
    ],
  },
  {
    key: "p3",
    label: "P3",
    draw: "Draw 3",
    pending: true,
    lines: [
      { item: "Plumbing Top-out", percent: 0.021, pending: true },
      { item: "A/C Duct Work", percent: 0.028, pending: true },
      { item: "Electrical Rough-in", percent: 0.023, pending: true },
      { item: "Wall Insulation", percent: 0.012, pending: true },
      { item: "Exterior Painting", percent: 0.017, pending: true },
      { item: "Sheetrock", percent: 0.039, pending: true },
    ],
  },
  {
    key: "p4",
    label: "P4",
    draw: "Draw 4",
    pending: true,
    lines: [
      { item: "Tape & Float", percent: 0.022, pending: true },
      { item: "Texture", percent: 0.009, pending: true },
      { item: "Exterior Materials", percent: 0.027, pending: true },
      { item: "Exterior Material Labor", percent: 0.021, pending: true },
      { item: "Flooring", percent: 0.051, pending: true },
    ],
  },
  {
    key: "p5",
    label: "P5",
    draw: "Draw 5",
    pending: true,
    lines: [
      { item: "Cabinets and Vanities", percent: 0.034, pending: true },
      { item: "Trim, Doors, Shelving", percent: 0.025, pending: true },
      { item: "Interior Paint / Stain", percent: 0.02, pending: true },
      { item: "Counter Tops", percent: 0.024, pending: true },
      { item: "Front Doors", percent: 0.017, pending: true },
    ],
  },
  {
    key: "p6",
    label: "P6",
    draw: "Draw 6",
    pending: true,
    lines: [
      { item: "Electrical Final / Fixtures", percent: 0.025, pending: true },
      { item: "Plumbing Final / Fixtures", percent: 0.025, pending: true },
      { item: "Hardware / Mirrors", percent: 0.018, pending: true },
      { item: "Clean-up", percent: 0.012, pending: true },
    ],
  },
];

function parseMoney(value: string) {
  return Number(value.replace(/[$,\s]/g, "")) || 0;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export function PhaseBudgetCalculator() {
  const [projectName, setProjectName] = useState("New Project");
  const [soldPriceInput, setSoldPriceInput] = useState("250000");
  const [squareFootageInput, setSquareFootageInput] = useState("2180");
  const soldPrice = parseMoney(soldPriceInput);
  const squareFootage = Number(squareFootageInput.replace(/[,\s]/g, "")) || 0;
  const pricePerSquareFoot = squareFootage > 0 ? soldPrice / squareFootage : 0;
  const totalPercent = useMemo(
    () =>
      budgetPhases.reduce(
        (phaseTotal, phase) =>
          phaseTotal + phase.lines.reduce((lineTotal, line) => lineTotal + line.percent, 0),
        0,
      ),
    [],
  );

  return (
    <section className="print-area rounded-lg border border-[#dfe5dc] bg-white">
      <div className="border-b border-[#e6ebe3] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Phase Budget Calculator</h2>
            <p className="mt-1 text-xs text-[#69746f]">
              Type the project name, sold price, and square footage. The calculator breaks down how
              much each line item should cost. Draft percentages are marked pending.
            </p>
          </div>
          <button
            className="no-print inline-flex items-center gap-2 rounded-md bg-[#20745f] px-3 py-2 text-sm font-medium text-white"
            onClick={() => window.print()}
            type="button"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <div className="rounded-lg border border-[#edf0eb] bg-[#fbfcfa] p-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
            <label className="text-xs font-medium uppercase text-[#69746f]">
              Project Name
              <input
                className="mt-1 h-10 w-full rounded-md border border-[#ccd6cf] bg-white px-3 text-sm normal-case text-[#18211f]"
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Cepeda"
                value={projectName}
              />
            </label>
            <label className="text-xs font-medium uppercase text-[#69746f]">
              Sold Price
              <input
                className="mt-1 h-10 w-full rounded-md border border-[#ccd6cf] bg-white px-3 text-sm normal-case text-[#18211f]"
                inputMode="decimal"
                onChange={(event) => setSoldPriceInput(event.target.value)}
                placeholder="250000"
                value={soldPriceInput}
              />
            </label>
            <label className="text-xs font-medium uppercase text-[#69746f]">
              Square Feet
              <input
                className="mt-1 h-10 w-full rounded-md border border-[#ccd6cf] bg-white px-3 text-sm normal-case text-[#18211f]"
                inputMode="numeric"
                onChange={(event) => setSquareFootageInput(event.target.value)}
                placeholder="2180"
                value={squareFootageInput}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <SummaryTile label="Project" value={projectName || "Unnamed"} />
            <SummaryTile label="Sold Price" value={currency(soldPrice)} />
            <SummaryTile label="Price / Sqft" value={currency(pricePerSquareFoot)} />
            <SummaryTile label="Budget Shown" value={percent(totalPercent)} />
          </div>
        </div>

        {budgetPhases.map((phase) => (
          <BudgetPhaseSection
            key={phase.key}
            phase={phase}
            soldPrice={soldPrice}
            squareFootage={squareFootage}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#dfe5dc] bg-white px-3 py-2">
      <div className="text-[11px] font-medium uppercase text-[#69746f]">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-[#18211f]">{value}</div>
    </div>
  );
}

function BudgetPhaseSection({
  phase,
  soldPrice,
  squareFootage,
}: {
  phase: BudgetPhase;
  soldPrice: number;
  squareFootage: number;
}) {
  const totalPercent = phase.lines.reduce((total, line) => total + line.percent, 0);
  const phaseBudget = soldPrice * totalPercent;
  const phasePerSquareFoot = squareFootage > 0 ? phaseBudget / squareFootage : 0;

  return (
    <div className="overflow-hidden rounded-lg border border-[#edf0eb]">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf0eb] bg-[#fbfcfa] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-[#e7f1ec] text-sm font-bold text-[#174f42]">
            {phase.label}
          </div>
          <div>
            <div className="text-sm font-semibold">{phase.draw}</div>
            <div className="text-xs text-[#69746f]">
              {phase.pending ? "Draft percentages pending final budget" : "Real Phase 1 percentages"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right text-xs">
          <div>
            <div className="text-[#69746f]">Percent</div>
            <div className="font-semibold">{percent(totalPercent)}</div>
          </div>
          <div>
            <div className="text-[#69746f]">Budget</div>
            <div className="font-semibold">{currency(phaseBudget)}</div>
          </div>
          <div>
            <div className="text-[#69746f]">Sqft</div>
            <div className="font-semibold">{currency(phasePerSquareFoot)}</div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-white text-left text-xs uppercase text-[#69746f]">
            <tr>
              <th className="px-4 py-3 font-medium">Line Item</th>
              <th className="px-4 py-3 font-medium">Budget %</th>
              <th className="px-4 py-3 font-medium">Budget $</th>
              <th className="px-4 py-3 font-medium">Sqft Check</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {phase.lines.map((line) => {
              const budgetAmount = soldPrice * line.percent;
              const sqftAmount = squareFootage > 0 ? budgetAmount / squareFootage : 0;

              return (
                <tr className="border-t border-[#edf0eb]" key={line.item}>
                  <td className="px-4 py-3 font-medium">{line.item}</td>
                  <td className="px-4 py-3 text-[#4f5b56]">{percent(line.percent)}</td>
                  <td className="px-4 py-3 font-semibold">{currency(budgetAmount)}</td>
                  <td className="px-4 py-3 text-[#4f5b56]">{currency(sqftAmount)} / sqft</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${
                        line.pending
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {line.pending ? "Pending %" : "Real %"}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-[#dfe5dc] bg-[#fbfcfa]">
              <td className="px-4 py-3 font-semibold">{phase.label} Total</td>
              <td className="px-4 py-3 font-semibold">{percent(totalPercent)}</td>
              <td className="px-4 py-3 font-semibold">{currency(phaseBudget)}</td>
              <td className="px-4 py-3 font-semibold">{currency(phasePerSquareFoot)} / sqft</td>
              <td className="px-4 py-3 font-semibold">
                {phase.pending ? "Pending final rules" : "Locked"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
