import {
  AlertTriangle,
  Banknote,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Home,
  LayoutDashboard,
  MessageSquareText,
  RefreshCcw,
  Settings,
  ShieldCheck,
} from "lucide-react";

export const navigation = [
  { label: "Portfolio", icon: LayoutDashboard },
  { label: "Houses", icon: Home },
  { label: "Sync", icon: RefreshCcw },
  { label: "Briefings", icon: MessageSquareText },
  { label: "Alerts", icon: Bell },
  { label: "Settings", icon: Settings },
];

export const portfolioHouses = [
  {
    house: "Lot 18 - Retama",
    bank: "STB Retama 18 Checking",
    status: "At Risk",
    progress: 72,
    budget: "$214,850 / $202,000",
    margin: "$38,400",
    idle: "2 days",
    concern: "Foundation spend is $7,840 over plan.",
  },
  {
    house: "Lot 22 - Mesquite",
    bank: "STB Mesquite 22 Checking",
    status: "Watch",
    progress: 58,
    budget: "$168,230 / $171,500",
    margin: "$51,900",
    idle: "6 days",
    concern: "Frame phase has no new activity this week.",
  },
  {
    house: "Lot 31 - Lantana",
    bank: "STB Lantana 31 Checking",
    status: "Healthy",
    progress: 84,
    budget: "$246,020 / $253,400",
    margin: "$67,250",
    idle: "1 day",
    concern: "No material variance found.",
  },
  {
    house: "Lot 07 - Sabal",
    bank: "STB Sabal 07 Checking",
    status: "Watch",
    progress: 43,
    budget: "$109,775 / $108,900",
    margin: "$44,100",
    idle: "9 days",
    concern: "Rough trades may be stalled.",
  },
];

export const statusStyles = {
  Healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Watch: "border-amber-200 bg-amber-50 text-amber-700",
  "At Risk": "border-red-200 bg-red-50 text-red-700",
};

export const metricCards = [
  {
    label: "Active houses",
    value: "4",
    detail: "1 at risk, 2 watch",
    icon: Building2,
  },
  {
    label: "Projected margin",
    value: "$201.7k",
    detail: "Across active builds",
    icon: CircleDollarSign,
  },
  {
    label: "Last QB sync",
    value: "7:02 AM",
    detail: "Sandbox not connected yet",
    icon: RefreshCcw,
  },
  {
    label: "Agent mode",
    value: "Read-only",
    detail: "No QB writes enabled",
    icon: ShieldCheck,
  },
];

export const phaseVariance = [
  { phase: "Pre", value: 8 },
  { phase: "Foundation", value: 74 },
  { phase: "Frame", value: 36 },
  { phase: "Rough", value: 52 },
  { phase: "Exterior", value: 28 },
  { phase: "Interior", value: 18 },
  { phase: "Final", value: 12 },
];

export const activity = [
  {
    icon: Banknote,
    title: "Check #1042 cleared",
    detail: "Concrete Materials - Lot 18 - $12,480",
  },
  {
    icon: AlertTriangle,
    title: "Possible change order",
    detail: "Memo mentions upgrade but no CO prefix was found.",
  },
  {
    icon: CheckCircle2,
    title: "Lot 31 healthy",
    detail: "All active line items with checks are cleared.",
  },
  {
    icon: Clock3,
    title: "Lot 07 idle",
    detail: "No Rough Trades activity for 9 days.",
  },
];

export const aiNote = {
  icon: Bot,
  title: "Embedded Health Note",
  body: "Lot 18 needs attention. It is tracking $7,840 over the foundation budget, with Concrete Materials as the main driver. I can trace that to check #1042 and check #1037. I do not see enough QuickBooks evidence yet to say whether this is scope growth or pricing variance.",
};
