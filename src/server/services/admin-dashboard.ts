import { z } from "zod";

export type AdminEventOption = {
  id: string;
  slug: string;
  name: string;
  environment: "TEST" | "PRODUCTION";
  status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
};

export type AdminDashboard = {
  serverNow: string;
  events: AdminEventOption[];
  event: AdminEventOption | null;
  participants: {
    registered: number;
    activeRecently: number;
  };
  session: {
    id: string;
    name: string;
    mode: "DISCOVERY" | "LIVE";
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
    questionCount: number;
  } | null;
  currentQuestion: {
    id: string;
    questionText: string;
    position: number;
    durationSeconds: number;
    status: "PENDING" | "OPEN" | "CLOSED" | "REVEALED" | "CANCELED";
    opensAt: string | null;
    closesAt: string | null;
    answersReceived: number;
    correctAnswers: number;
    successRate: number;
    averageResponseTimeMs: number | null;
  } | null;
  leaderboard: Array<{
    position: number;
    publicCode: string;
    nickname: string;
    points: number;
  }>;
  questionLibrary: {
    total: number;
    drafts: number;
    inReview: number;
    validated: number;
  };
};

export interface AdminDashboardRepository {
  listEvents(): Promise<AdminEventOption[]>;
  getDashboard(event: AdminEventOption, now: Date): Promise<Omit<AdminDashboard, "events">>;
}

export class AdminDashboardInputError extends Error {
  constructor() {
    super("Invalid admin dashboard input");
    this.name = "AdminDashboardInputError";
  }
}

export class AdminDashboardEventNotFoundError extends Error {
  constructor() {
    super("Admin dashboard event not found");
    this.name = "AdminDashboardEventNotFoundError";
  }
}

const eventSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .optional();

export async function getAdminDashboard(
  eventSlug: unknown,
  dependencies: {
    repository: AdminDashboardRepository;
    now?: () => Date;
  },
): Promise<AdminDashboard> {
  const parsedSlug = eventSlugSchema.safeParse(eventSlug || undefined);

  if (!parsedSlug.success) {
    throw new AdminDashboardInputError();
  }

  const events = await dependencies.repository.listEvents();
  const event = parsedSlug.data
    ? events.find((candidate) => candidate.slug === parsedSlug.data)
    : events[0];

  if (parsedSlug.data && !event) {
    throw new AdminDashboardEventNotFoundError();
  }

  if (!event) {
    return {
      serverNow: (dependencies.now?.() ?? new Date()).toISOString(),
      events,
      event: null,
      participants: { registered: 0, activeRecently: 0 },
      session: null,
      currentQuestion: null,
      leaderboard: [],
      questionLibrary: { total: 0, drafts: 0, inReview: 0, validated: 0 },
    };
  }

  return {
    events,
    ...(await dependencies.repository.getDashboard(
      event,
      dependencies.now?.() ?? new Date(),
    )),
  };
}
