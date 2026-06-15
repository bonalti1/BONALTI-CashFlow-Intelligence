import type { DrawPhaseKey } from "@/lib/draws/draws-store";

type SchedulingTaskState = {
  done?: boolean;
  status?: string;
  sub?: string;
  note?: string;
};

type SchedulingProject = {
  id?: string;
  name?: string;
  code?: string;
  phase?: string;
  status?: string;
  completed?: boolean;
  isCompleted?: boolean;
  completedAt?: string;
  renderImage?: string;
  renderUpdatedAt?: string;
  phaseTaskState?: Record<string, Record<string, SchedulingTaskState>>;
};

type SchedulingBoard = {
  projects?: SchedulingProject[];
  completedProjects?: SchedulingProject[];
};

export type SchedulingLineStatus = {
  projectName: string;
  taskName: string;
  status: "done" | "today" | "scheduled" | "alert" | "open";
  label: string;
  subcontractor: string | null;
};

export type SchedulingProjectVisual = {
  projectId: string | null;
  projectName: string;
  projectCode: string | null;
  renderImage: string | null;
  renderUpdatedAt: string | null;
};

export type SchedulingProjectCompletion = {
  projectId: string | null;
  projectName: string;
  completed: boolean;
  completedAt: string | null;
};

type SchedulingHouseInput = Array<{
  house: string;
  phases?: Array<{
    key: DrawPhaseKey;
    lineItems: Array<{ lineItemName: string }>;
  }>;
}>;

const phaseNames: Record<DrawPhaseKey, string> = {
  pre: "Pre Phase",
  p1: "Phase 1",
  p2: "Phase 2",
  p3: "Phase 3",
  p4: "Phase 4",
  p5: "Phase 5",
  p6: "Phase 6",
};

function schedulingSupabaseUrl() {
  return process.env.SCHEDULING_SUPABASE_URL ?? "https://ttpkyepzzpxctajrhwvx.supabase.co";
}

function schedulingSupabaseKey() {
  return process.env.SCHEDULING_SUPABASE_KEY ?? "sb_publishable_bnhfaLTxNe2ApJ94myqtIg_uHjo3_B1";
}

function schedulingSupabaseTable() {
  return process.env.SCHEDULING_SUPABASE_TABLE ?? "stb_app_state";
}

function schedulingBoardKey() {
  return process.env.SCHEDULING_BOARD_KEY ?? "stb_board_v1";
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function statusLabel(state: SchedulingTaskState): SchedulingLineStatus["label"] {
  if (state.done || state.status === "done") {
    return "Done";
  }

  if (state.status === "today") {
    return "Working Today";
  }

  if (state.status === "scheduled") {
    return "Scheduled";
  }

  if (state.status === "alert") {
    return "Alert";
  }

  return "Open";
}

function statusKey(state: SchedulingTaskState): SchedulingLineStatus["status"] {
  if (state.done || state.status === "done") {
    return "done";
  }

  if (state.status === "today" || state.status === "scheduled" || state.status === "alert") {
    return state.status;
  }

  return "open";
}

function matchesHouse(projectName: string, houseName: string) {
  const normalizedProject = normalize(projectName);
  const normalizedHouse = normalize(houseName);

  return normalizedProject.includes(normalizedHouse) || normalizedHouse.includes(normalizedProject);
}

function codeFromName(value: string) {
  return value.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
}

const houseNameAliases: Record<string, string[]> = {
  cepeda: ["zepeda"],
  gomez: ["gamez"],
  saavedra: ["savedra"],
  vazquez: ["vasquez"],
};

function houseNameCandidates(houseName: string) {
  const normalizedHouse = normalize(houseName);
  return [normalizedHouse, ...(houseNameAliases[normalizedHouse] ?? [])];
}

function matchesProject(project: SchedulingProject, houseName: string) {
  const houseCode = codeFromName(houseName);

  if (houseCode && project.code && normalize(project.code) === normalize(houseCode)) {
    return true;
  }

  if (!project.name) {
    return false;
  }

  return houseNameCandidates(houseName).some((candidate) => matchesHouse(project.name ?? "", candidate));
}

function projectIsCompleted(project: SchedulingProject) {
  const status = normalize(`${project.status ?? ""} ${project.phase ?? ""}`);

  return Boolean(
    project.completed ||
      project.isCompleted ||
      status.includes("completed") ||
      status.includes("complete") ||
      status.includes("closed"),
  );
}

function matchesTask(taskName: string, lineItemName: string) {
  const task = normalize(taskName);
  const lineItem = normalize(lineItemName);

  if (!task || !lineItem) {
    return false;
  }

  if (task === lineItem || task.includes(lineItem) || lineItem.includes(task)) {
    return true;
  }

  const lineWords = lineItem.split(" ").filter((word) => word.length > 2);
  const matchedWords = lineWords.filter((word) => task.includes(word));

  return lineWords.length > 0 && matchedWords.length / lineWords.length >= 0.65;
}

async function readSchedulingBoard() {
  const url = schedulingSupabaseUrl();
  const key = schedulingSupabaseKey();
  const table = schedulingSupabaseTable();
  const boardKey = schedulingBoardKey();

  if (!url || !key || !table || !boardKey) {
    return null;
  }

  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set("id", `eq.${boardKey}`);
  endpoint.searchParams.set("select", "data");

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as Array<{ data?: { value?: string | SchedulingBoard } }>;
  const rawBoard = rows[0]?.data?.value;

  if (!rawBoard) {
    return null;
  }

  if (typeof rawBoard === "object") {
    return rawBoard as SchedulingBoard;
  }

  try {
    return JSON.parse(rawBoard) as SchedulingBoard;
  } catch {
    return null;
  }
}

export async function getSchedulingConnectionStatus() {
  const board = await readSchedulingBoard();
  const projects = board?.projects ?? [];
  const completedProjects = board?.completedProjects ?? [];
  const projectsWithRender = [...projects, ...completedProjects].filter((project) =>
    Boolean(project.renderImage),
  ).length;

  return {
    connected: Boolean(board),
    activeProjects: projects.length,
    completedProjects: completedProjects.length,
    projectsWithRender,
    boardKey: schedulingBoardKey(),
  };
}

function buildSchedulingLineItemStatusMap(
  board: SchedulingBoard | null,
  houses: Array<{
    house: string;
    phases: Array<{
      key: DrawPhaseKey;
      lineItems: Array<{ lineItemName: string }>;
    }>;
  }>,
) {
  const statuses = new Map<string, SchedulingLineStatus>();

  if (!board?.projects) {
    return statuses;
  }

  for (const house of houses) {
    const project = board.projects.find((candidate) => matchesProject(candidate, house.house));

    if (!project?.phaseTaskState) {
      continue;
    }

    for (const phase of house.phases) {
      const phaseState = project.phaseTaskState[phaseNames[phase.key]];

      if (!phaseState) {
        continue;
      }

      for (const lineItem of phase.lineItems) {
        const match = Object.entries(phaseState).find(([taskName]) =>
          matchesTask(taskName, lineItem.lineItemName),
        );

        if (!match) {
          continue;
        }

        const [taskName, state] = match;
        statuses.set(`${house.house}:${phase.key}:${lineItem.lineItemName}`, {
          projectName: project.name ?? house.house,
          taskName,
          status: statusKey(state),
          label: statusLabel(state),
          subcontractor: state.sub || null,
        });
      }
    }
  }

  return statuses;
}

export async function getSchedulingLineItemStatusMap(
  houses: Array<{
    house: string;
    phases: Array<{
      key: DrawPhaseKey;
      lineItems: Array<{ lineItemName: string }>;
    }>;
  }>,
) {
  return buildSchedulingLineItemStatusMap(await readSchedulingBoard(), houses);
}

function buildSchedulingProjectVisualMap(
  board: SchedulingBoard | null,
  houses: Array<{ house: string }>,
) {
  const visuals = new Map<string, SchedulingProjectVisual>();

  if (!board?.projects) {
    return visuals;
  }

  for (const house of houses) {
    const project = board.projects.find((candidate) => matchesProject(candidate, house.house));

    if (!project?.name) {
      continue;
    }

    visuals.set(house.house, {
      projectId: project.id ?? null,
      projectName: project.name,
      projectCode: project.code ?? null,
      renderImage: project.renderImage ?? null,
      renderUpdatedAt: project.renderUpdatedAt ?? null,
    });
  }

  return visuals;
}

export async function getSchedulingProjectVisualMap(houses: Array<{ house: string }>) {
  return buildSchedulingProjectVisualMap(await readSchedulingBoard(), houses);
}

export async function getSchedulingProjectVisualList() {
  const board = await readSchedulingBoard();
  const projects = board?.projects ?? [];

  return projects
    .filter((project) => project.name)
    .map((project): SchedulingProjectVisual => ({
      projectId: project.id ?? null,
      projectName: project.name ?? "Unnamed project",
      projectCode: project.code ?? null,
      renderImage: project.renderImage ?? null,
      renderUpdatedAt: project.renderUpdatedAt ?? null,
    }));
}

function buildSchedulingProjectCompletionMap(
  board: SchedulingBoard | null,
  houses: Array<{ house: string }>,
) {
  const completion = new Map<string, SchedulingProjectCompletion>();

  if (!board) {
    return completion;
  }

  const projects = [...(board.projects ?? []), ...(board.completedProjects ?? [])];

  for (const house of houses) {
    const project = projects.find((candidate) => matchesProject(candidate, house.house));

    if (!project?.name) {
      continue;
    }

    const completed =
      projectIsCompleted(project) ||
      Boolean(board.completedProjects?.some((candidate) => candidate.id && candidate.id === project.id));

    completion.set(house.house, {
      projectId: project.id ?? null,
      projectName: project.name,
      completed,
      completedAt: project.completedAt ?? null,
    });
  }

  return completion;
}

export async function getSchedulingProjectCompletionMap(houses: Array<{ house: string }>) {
  return buildSchedulingProjectCompletionMap(await readSchedulingBoard(), houses);
}

export async function getSchedulingDashboardMaps(houses: SchedulingHouseInput) {
  const board = await readSchedulingBoard();

  return {
    statuses: buildSchedulingLineItemStatusMap(
      board,
      houses.filter(
        (house): house is {
          house: string;
          phases: Array<{
            key: DrawPhaseKey;
            lineItems: Array<{ lineItemName: string }>;
          }>;
        } => Boolean(house.phases),
      ),
    ),
    visuals: buildSchedulingProjectVisualMap(board, houses),
    completion: buildSchedulingProjectCompletionMap(board, houses),
  };
}
