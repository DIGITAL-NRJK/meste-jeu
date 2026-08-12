import type { AdminLiveControlInput } from "@/lib/validation/admin-live-control";

type SessionStatus = "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
type QuestionStatus = "PENDING" | "OPEN" | "CLOSED" | "REVEALED" | "CANCELED";

export type LiveControlAction = {
  action: AdminLiveControlInput["action"];
  label: string;
  danger: boolean;
};

export function getLiveControlActions(
  sessionStatus: SessionStatus,
  questionStatus: QuestionStatus | null,
): LiveControlAction[] {
  if (sessionStatus === "DRAFT") {
    return [{ action: "MARK_READY", label: "Préparer la session", danger: false }];
  }
  if (sessionStatus === "READY") {
    return [{ action: "START_SESSION", label: "Lancer la session", danger: false }];
  }
  if (sessionStatus !== "LIVE") return [];

  const actions: LiveControlAction[] = [];
  if (questionStatus === "OPEN") {
    actions.push({ action: "CLOSE_CURRENT_QUESTION", label: "Fermer les réponses", danger: false });
  } else if (questionStatus === "CLOSED") {
    actions.push({ action: "REVEAL_CURRENT_QUESTION", label: "Révéler la réponse", danger: false });
  } else if (!questionStatus || questionStatus === "PENDING" || questionStatus === "REVEALED") {
    actions.push({ action: "OPEN_NEXT_QUESTION", label: "Lancer la question suivante", danger: false });
  }

  if (questionStatus && ["OPEN", "CLOSED", "REVEALED"].includes(questionStatus)) {
    actions.push({ action: "CANCEL_CURRENT_QUESTION", label: "Annuler cette question", danger: true });
  }
  actions.push({ action: "FINISH_SESSION", label: "Terminer la session", danger: true });
  return actions;
}
