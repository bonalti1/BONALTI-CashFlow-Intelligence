import type { QboAccount } from "@/lib/qbo/accounts-store";

const houseNameMatchers = [
  { canonicalName: "Charles", aliases: ["charles"] },
  { canonicalName: "Chavez", aliases: ["chavez"] },
  { canonicalName: "Delgadillo", aliases: ["delgadillo"] },
  { canonicalName: "Gomez", aliases: ["gomez", "gamez"] },
  { canonicalName: "Gonzalez", aliases: ["gonzalez"] },
  { canonicalName: "HUNN", aliases: ["hunn"] },
  { canonicalName: "Lot 6", aliases: ["lot 6"] },
  { canonicalName: "Ruvalcaba", aliases: ["ruvalcaba"] },
  { canonicalName: "Hernandez", aliases: ["hernandez"] },
  { canonicalName: "Pulido", aliases: ["pulido"] },
  { canonicalName: "Saavedra", aliases: ["saavedra"] },
  { canonicalName: "Valerio", aliases: ["valerio"] },
  { canonicalName: "Vazquez", aliases: ["vazquez"] },
  { canonicalName: "Cepeda", aliases: ["cepeda", "zepeda"] },
];

const internalBankMatchers = [
  "cash",
  "gas",
  "income clearing",
  "marketing",
  "operating",
  "payroll",
];

function normalizedAccountName(account: QboAccount) {
  return (account.FullyQualifiedName ?? account.Name).toLowerCase();
}

export function getConfirmedHouseName(account: QboAccount) {
  if (account.AccountType !== "Bank") {
    return null;
  }

  const name = normalizedAccountName(account);
  const match = houseNameMatchers.find((house) =>
    house.aliases.some((alias) => name.includes(alias)),
  );

  return match?.canonicalName ?? null;
}

export function isInternalBankAccount(account: QboAccount) {
  if (account.AccountType !== "Bank") {
    return false;
  }

  const name = normalizedAccountName(account);

  return internalBankMatchers.some((matcher) => name.includes(matcher));
}

