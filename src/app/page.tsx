import Link from "next/link";

import {
  aiNote,
  activity,
  metricCards,
  navigation,
  phaseVariance,
  portfolioHouses,
  statusStyles,
} from "@/lib/project/mock-data";

export default function Home() {
  const NoteIcon = aiNote.icon;

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#18211f]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#dfe5dc] bg-white px-5 py-5">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[#20745f] text-sm font-bold text-white">
              STB
            </div>
            <div>
              <div className="text-sm font-semibold">South Texas Builders</div>
              <div className="text-xs text-[#69746f]">Project Health Agent</div>
            </div>
          </div>

          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Portfolio";

              return (
                <button
                  className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm ${
                    active
                      ? "bg-[#e7f1ec] font-medium text-[#174f42]"
                      : "text-[#5f6b66] hover:bg-[#f1f4ef]"
                  }`}
                  key={item.label}
                  type="button"
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-[#dfe5dc] bg-white px-6">
            <div>
              <h1 className="text-lg font-semibold">Portfolio Health</h1>
              <p className="text-xs text-[#69746f]">
                QuickBooks substrate first. Agent explanations stay traceable.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">
                QB not connected
              </span>
              <span className="rounded-md border border-[#dfe5dc] bg-[#fbfcfa] px-3 py-1.5 text-[#4f5b56]">
                Last local check: ready
              </span>
              <Link
                className="rounded-md bg-[#20745f] px-3 py-1.5 text-white"
                href="/setup"
              >
                Setup
              </Link>
              <Link
                className="rounded-md border border-[#ccd6cf] px-3 py-1.5 text-[#33504a]"
                href="/house-accounts"
              >
                Houses
              </Link>
              <Link
                className="rounded-md border border-[#ccd6cf] px-3 py-1.5 text-[#33504a]"
                href="/chart-of-accounts"
              >
                CoA
              </Link>
              <Link
                className="rounded-md border border-[#ccd6cf] px-3 py-1.5 text-[#33504a]"
                href="/mapping"
              >
                Mapping
              </Link>
              <div className="flex size-9 items-center justify-center rounded-full bg-[#23312d] text-xs font-semibold text-white">
                JP
              </div>
            </div>
          </header>

          <div className="grid flex-1 grid-cols-[minmax(0,1fr)_360px] gap-0">
            <div className="min-w-0 px-6 py-5">
              <section className="mb-5 grid grid-cols-4 gap-3">
                {metricCards.map((card) => {
                  const Icon = card.icon;

                  return (
                    <div
                      className="rounded-lg border border-[#dfe5dc] bg-white p-4"
                      key={card.label}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-xs font-medium uppercase text-[#69746f]">
                          {card.label}
                        </span>
                        <Icon className="text-[#20745f]" size={18} />
                      </div>
                      <div className="text-2xl font-semibold">{card.value}</div>
                      <div className="mt-1 text-xs text-[#69746f]">{card.detail}</div>
                    </div>
                  );
                })}
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white">
                <div className="flex items-center justify-between border-b border-[#e6ebe3] px-4 py-3">
                  <h2 className="text-sm font-semibold">Active Houses</h2>
                  <button
                    className="rounded-md border border-[#ccd6cf] px-3 py-1.5 text-xs font-medium text-[#33504a]"
                    type="button"
                  >
                    Inspect numbers
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                      <tr>
                        <th className="px-4 py-3 font-medium">House / Bank</th>
                        <th className="px-4 py-3 font-medium">Health</th>
                        <th className="px-4 py-3 font-medium">Progress</th>
                        <th className="px-4 py-3 font-medium">Actual / Budget</th>
                        <th className="px-4 py-3 font-medium">Projected Margin</th>
                        <th className="px-4 py-3 font-medium">Idle</th>
                        <th className="px-4 py-3 font-medium">Top AI Concern</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioHouses.map((house) => (
                        <tr className="border-t border-[#edf0eb]" key={house.house}>
                          <td className="px-4 py-4">
                            <div className="font-medium">{house.house}</div>
                            <div className="text-xs text-[#69746f]">{house.bank}</div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                                statusStyles[house.status as keyof typeof statusStyles]
                              }`}
                            >
                              {house.status}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-[#e7ece6]">
                                <div
                                  className="h-full rounded-full bg-[#20745f]"
                                  style={{ width: `${house.progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium">{house.progress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-medium">{house.budget}</td>
                          <td className="px-4 py-4 font-medium text-[#20745f]">
                            {house.margin}
                          </td>
                          <td className="px-4 py-4 text-[#4f5b56]">{house.idle}</td>
                          <td className="max-w-[240px] px-4 py-4 text-[#4f5b56]">
                            {house.concern}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-5 grid grid-cols-[1fr_1fr] gap-4">
                <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                  <h2 className="mb-4 text-sm font-semibold">Phase Variance</h2>
                  <div className="space-y-3">
                    {phaseVariance.map((phase) => (
                      <div className="grid grid-cols-[90px_1fr_42px] items-center gap-3" key={phase.phase}>
                        <span className="text-xs text-[#69746f]">{phase.phase}</span>
                        <div className="h-2 overflow-hidden rounded-full bg-[#e7ece6]">
                          <div
                            className="h-full rounded-full bg-[#c8872e]"
                            style={{ width: `${phase.value}%` }}
                          />
                        </div>
                        <span className="text-right text-xs font-medium">{phase.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                  <h2 className="mb-4 text-sm font-semibold">Recent Signals</h2>
                  <div className="space-y-3">
                    {activity.map((item) => {
                      const Icon = item.icon;

                      return (
                        <div className="flex gap-3" key={item.title}>
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[#edf3ee] text-[#20745f]">
                            <Icon size={16} />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{item.title}</div>
                            <div className="text-xs text-[#69746f]">{item.detail}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            <aside className="border-l border-[#dfe5dc] bg-white p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[#e7f1ec] text-[#20745f]">
                  <NoteIcon size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{aiNote.title}</h2>
                  <p className="text-xs text-[#69746f]">Regenerated after each QB sync</p>
                </div>
              </div>

              <p className="rounded-lg border border-[#dfe5dc] bg-[#fbfcfa] p-4 text-sm leading-6 text-[#384641]">
                {aiNote.body}
              </p>

              <div className="mt-5 rounded-lg border border-[#dfe5dc] p-4">
                <h3 className="text-sm font-semibold">Trace References</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#69746f]">Check #1042</span>
                    <span className="font-medium">$12,480</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#69746f]">Check #1037</span>
                    <span className="font-medium">$8,160</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#69746f]">Phase</span>
                    <span className="font-medium">Foundation</span>
                  </div>
                </div>
              </div>

              <button
                className="mt-5 h-10 w-full rounded-md bg-[#20745f] text-sm font-semibold text-white"
                type="button"
              >
                Ask about this house
              </button>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
