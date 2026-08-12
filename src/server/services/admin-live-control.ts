import { adminLiveControlSchema } from "@/lib/validation/admin-live-control";
import {
  cancelSessionQuestion,
  closeCurrentSessionQuestion,
  finishQuizSession,
  markSessionReady,
  openNextSessionQuestion,
  revealCurrentSessionQuestion,
  startQuizSession,
  type QuizSessionDetail,
  type SessionEngineRepository,
  SessionNotFoundError,
  SessionTransitionError,
} from "@/server/services/session-engine";

export class AdminLiveControlInputError extends Error {
  constructor() {
    super("Invalid admin live control input");
    this.name = "AdminLiveControlInputError";
  }
}

export async function executeAdminLiveControl(
  input: unknown,
  actorAdminId: string,
  repository: SessionEngineRepository,
): Promise<QuizSessionDetail> {
  const parsed = adminLiveControlSchema.safeParse(input);
  if (!parsed.success) throw new AdminLiveControlInputError();

  const dependencies = { repository };
  switch (parsed.data.action) {
    case "MARK_READY":
      return markSessionReady(parsed.data.sessionId, actorAdminId, dependencies);
    case "START_SESSION":
      return startQuizSession(parsed.data.sessionId, actorAdminId, dependencies);
    case "OPEN_NEXT_QUESTION":
      return openNextSessionQuestion(parsed.data.sessionId, actorAdminId, dependencies);
    case "CLOSE_CURRENT_QUESTION":
      return closeCurrentSessionQuestion(parsed.data.sessionId, actorAdminId, dependencies);
    case "REVEAL_CURRENT_QUESTION":
      return revealCurrentSessionQuestion(parsed.data.sessionId, actorAdminId, dependencies);
    case "CANCEL_CURRENT_QUESTION": {
      const session = await repository.getSession(parsed.data.sessionId);
      if (!session) throw new SessionNotFoundError();
      if (!session.questions.some(({ id }) => id === parsed.data.sessionQuestionId)) {
        throw new SessionTransitionError("session_question_not_found");
      }
      return cancelSessionQuestion(parsed.data.sessionQuestionId!, actorAdminId, dependencies);
    }
    case "FINISH_SESSION":
      return finishQuizSession(parsed.data.sessionId, actorAdminId, dependencies);
  }
}
