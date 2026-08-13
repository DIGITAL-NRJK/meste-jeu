"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { AdminRegieShell } from "@/components/admin/admin-regie-shell";
import type { AdminIdentity } from "@/server/services/admin-auth";
import type {
  AdminReward,
  RewardAward,
  RewardEvent,
} from "@/server/services/admin-rewards";

type RewardAwardView = Omit<RewardAward, "awardedAt" | "deliveredAt"> & {
  awardedAt: string;
  deliveredAt: string | null;
};

export type AdminRewardView = Omit<
  AdminReward,
  "createdAt" | "updatedAt" | "awards"
> & {
  createdAt: string;
  updatedAt: string;
  awards: RewardAwardView[];
};

type RewardPlayer = {
  id: string;
  publicCode: string;
  nickname: string;
  status: "ACTIVE" | "DISABLED";
  totalPoints: number;
};

type ApiErrorPayload = { error?: { message?: string } };

const emptyRewardForm = {
  name: "",
  description: "",
  ruleType: "POSITION" as "POSITION" | "CONDITION",
  awardPosition: "1",
  awardCondition: "",
  active: true,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminRewardsView({
  admin,
  initialEvents,
  initialEvent,
  initialRewards,
  initialPlayers,
}: {
  admin: AdminIdentity;
  initialEvents: RewardEvent[];
  initialEvent: RewardEvent | null;
  initialRewards: AdminRewardView[];
  initialPlayers: RewardPlayer[];
}) {
  const router = useRouter();
  const [eventSlug, setEventSlug] = useState(initialEvent?.slug ?? "");
  const [rewards, setRewards] = useState(initialRewards);
  const [players, setPlayers] = useState(initialPlayers);
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedRewardId, setSelectedRewardId] = useState(initialRewards[0]?.id ?? "");
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [rewardForm, setRewardForm] = useState(emptyRewardForm);
  const [awardForm, setAwardForm] = useState({ playerId: "", notes: "" });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedReward = rewards.find((reward) => reward.id === selectedRewardId) ?? null;
  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLocaleLowerCase("fr-FR");
    return players.filter(
      (player) =>
        player.status === "ACTIVE" &&
        (!query ||
          player.nickname.toLocaleLowerCase("fr-FR").includes(query) ||
          player.publicCode.toLocaleLowerCase("fr-FR").includes(query)),
    );
  }, [playerSearch, players]);

  async function apiFetch(input: string, init?: RequestInit) {
    const response = await fetch(input, { cache: "no-store", ...init });
    if (response.status === 401) {
      router.replace("/admin/login");
      router.refresh();
      throw new Error("La session administrateur n’est plus valide.");
    }
    return response;
  }

  async function responseError(response: Response) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    return payload.error?.message ?? "L’action n’a pas pu être effectuée.";
  }

  async function refreshRewards(nextEventSlug = eventSlug) {
    if (!nextEventSlug) return;
    const response = await apiFetch(
      `/api/admin/rewards?eventSlug=${encodeURIComponent(nextEventSlug)}`,
    );
    if (!response.ok) throw new Error(await responseError(response));
    const payload = (await response.json()) as { rewards: AdminRewardView[] };
    setRewards(payload.rewards);
    setSelectedRewardId((current) =>
      payload.rewards.some((reward) => reward.id === current)
        ? current
        : (payload.rewards[0]?.id ?? ""),
    );
  }

  async function changeEvent(nextEventSlug: string) {
    setEventSlug(nextEventSlug);
    setPending(true);
    setMessage(null);
    router.replace(`/admin/rewards?event=${encodeURIComponent(nextEventSlug)}`, {
      scroll: false,
    });
    try {
      const [rewardResponse, playerResponse] = await Promise.all([
        apiFetch(`/api/admin/rewards?eventSlug=${encodeURIComponent(nextEventSlug)}`),
        apiFetch(
          `/api/admin/players?eventSlug=${encodeURIComponent(nextEventSlug)}&limit=100`,
        ),
      ]);
      if (!rewardResponse.ok) throw new Error(await responseError(rewardResponse));
      if (!playerResponse.ok) throw new Error(await responseError(playerResponse));
      const rewardPayload = (await rewardResponse.json()) as {
        rewards: AdminRewardView[];
      };
      const playerPayload = (await playerResponse.json()) as {
        players: RewardPlayer[];
      };
      setRewards(rewardPayload.rewards);
      setPlayers(playerPayload.players);
      setSelectedRewardId(rewardPayload.rewards[0]?.id ?? "");
      setEditingRewardId(null);
      setRewardForm(emptyRewardForm);
      setAwardForm({ playerId: "", notes: "" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lots indisponibles.");
    } finally {
      setPending(false);
    }
  }

  function editReward(reward: AdminRewardView) {
    setEditingRewardId(reward.id);
    setSelectedRewardId(reward.id);
    setRewardForm({
      name: reward.name,
      description: reward.description ?? "",
      ruleType: reward.awardPosition === null ? "CONDITION" : "POSITION",
      awardPosition: reward.awardPosition?.toString() ?? "1",
      awardCondition: reward.awardCondition ?? "",
      active: reward.active,
    });
  }

  function resetRewardForm() {
    setEditingRewardId(null);
    setRewardForm(emptyRewardForm);
  }

  async function saveReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!initialEvent) return;
    setPending(true);
    setMessage(null);
    const body = {
      ...(editingRewardId ? {} : { eventId: initialEvents.find((item) => item.slug === eventSlug)?.id }),
      name: rewardForm.name,
      description: rewardForm.description || null,
      awardPosition:
        rewardForm.ruleType === "POSITION" ? Number(rewardForm.awardPosition) : null,
      awardCondition:
        rewardForm.ruleType === "CONDITION" ? rewardForm.awardCondition : null,
      ...(editingRewardId ? { active: rewardForm.active } : {}),
    };
    try {
      const response = await apiFetch(
        editingRewardId ? `/api/admin/rewards/${editingRewardId}` : "/api/admin/rewards",
        {
          method: editingRewardId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      await refreshRewards();
      setMessage(editingRewardId ? "Lot mis à jour." : "Lot créé et rattaché à l’événement.");
      resetRewardForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enregistrement refusé.");
    } finally {
      setPending(false);
    }
  }

  async function awardReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const player = players.find((candidate) => candidate.id === awardForm.playerId);
    if (!selectedReward || !player) {
      setMessage("Sélectionnez un lot et un joueur actif.");
      return;
    }
    if (!window.confirm(`Attribuer « ${selectedReward.name} » à ${player.nickname} ?`)) return;

    setPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/rewards/${selectedReward.id}/awards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id, notes: awardForm.notes || null }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await refreshRewards();
      setAwardForm({ playerId: "", notes: "" });
      setMessage(`Lot attribué à ${player.nickname} et inscrit au journal d’audit.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Attribution refusée.");
    } finally {
      setPending(false);
    }
  }

  async function markDelivered(award: RewardAwardView) {
    if (!window.confirm(`Confirmer la remise du lot à ${award.nickname} ?`)) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/reward-awards/${award.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_DELIVERED", notes: null }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await refreshRewards();
      setMessage(`Remise à ${award.nickname} confirmée et horodatée.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Remise non enregistrée.");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <AdminRegieShell
      activePage="rewards"
      admin={admin}
      eventName={initialEvent?.name}
      eventSlug={eventSlug}
      onLogout={logout}
      toolbar={initialEvents.length ? (
        <label className="regie-event-select">
          <span>Événement</span>
          <select value={eventSlug} onChange={(event) => void changeEvent(event.target.value)}>
            {initialEvents.map((event) => (
              <option key={event.id} value={event.slug}>{event.name}</option>
            ))}
          </select>
        </label>
      ) : undefined}
      toolbarLabel="Récompenses"
    >
      <div className="reward-management-shell admin-subpage-shell" aria-busy={pending}>
        <section className="reward-management-hero">
          <div>
            <p className="eyebrow">Récompenses</p>
            <h1>Gestion des lots</h1>
            <p>Préparez les lots, attribuez-les aux gagnants et suivez leur remise.</p>
          </div>
        </section>

        {message ? <p className="reward-management-message" role="status">{message}</p> : null}

        {!initialEvent ? (
          <section className="admin-empty-state">
            <p className="eyebrow">Aucun événement</p>
            <h2>Créez une programmation avant de préparer les lots.</h2>
            <Link href="/admin/sessions">Créer la première programmation →</Link>
          </section>
        ) : (
          <div className="reward-management-grid">
            <section className="reward-panel reward-catalog">
              <div className="reward-panel-heading">
                <div><p className="eyebrow">Catalogue</p><h2>{rewards.length} lot{rewards.length > 1 ? "s" : ""}</h2></div>
                {editingRewardId ? <button type="button" onClick={resetRewardForm}>Nouveau lot</button> : null}
              </div>

              <form className="reward-form" onSubmit={saveReward}>
                <label><span>Nom du lot</span><input required minLength={2} maxLength={120} value={rewardForm.name} onChange={(event) => setRewardForm({ ...rewardForm, name: event.target.value })} /></label>
                <label><span>Description</span><textarea maxLength={500} value={rewardForm.description} onChange={(event) => setRewardForm({ ...rewardForm, description: event.target.value })} /></label>
                <fieldset>
                  <legend>Règle d’attribution</legend>
                  <label><input type="radio" checked={rewardForm.ruleType === "POSITION"} onChange={() => setRewardForm({ ...rewardForm, ruleType: "POSITION" })} /> Position au classement</label>
                  <label><input type="radio" checked={rewardForm.ruleType === "CONDITION"} onChange={() => setRewardForm({ ...rewardForm, ruleType: "CONDITION" })} /> Autre condition</label>
                </fieldset>
                {rewardForm.ruleType === "POSITION" ? (
                  <label><span>Position gagnante</span><input type="number" required min={1} value={rewardForm.awardPosition} onChange={(event) => setRewardForm({ ...rewardForm, awardPosition: event.target.value })} /></label>
                ) : (
                  <label><span>Condition</span><textarea required maxLength={300} value={rewardForm.awardCondition} onChange={(event) => setRewardForm({ ...rewardForm, awardCondition: event.target.value })} placeholder="Ex. Meilleur score de la session Culture" /></label>
                )}
                {editingRewardId ? (
                  <label className="reward-active-toggle"><input type="checkbox" checked={rewardForm.active} onChange={(event) => setRewardForm({ ...rewardForm, active: event.target.checked })} /> Lot actif</label>
                ) : null}
                <button type="submit" disabled={pending}>{editingRewardId ? "Enregistrer les modifications" : "Créer le lot"}</button>
              </form>

              <div className="reward-list">
                {rewards.map((reward) => (
                  <article className={reward.id === selectedRewardId ? "is-selected" : ""} key={reward.id}>
                    <button type="button" onClick={() => setSelectedRewardId(reward.id)}>
                      <span><strong>{reward.name}</strong><small>{reward.awardPosition ? `${reward.awardPosition}e place` : reward.awardCondition}</small></span>
                      <b>{reward.active ? "Actif" : "Inactif"}</b>
                    </button>
                    <button type="button" onClick={() => editReward(reward)}>Modifier</button>
                  </article>
                ))}
                {!rewards.length ? <p className="reward-empty">Aucun lot préparé pour cet événement.</p> : null}
              </div>
            </section>

            <section className="reward-panel reward-awards">
              <div className="reward-panel-heading">
                <div><p className="eyebrow">Attributions</p><h2>{selectedReward?.name ?? "Sélectionnez un lot"}</h2></div>
              </div>
              {selectedReward ? (
                <>
                  <form className="reward-form" onSubmit={awardReward}>
                    <label><span>Rechercher un joueur</span><input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Pseudo ou code public" /></label>
                    <label>
                      <span>Joueur gagnant</span>
                      <select required value={awardForm.playerId} onChange={(event) => setAwardForm({ ...awardForm, playerId: event.target.value })}>
                        <option value="">Sélectionner…</option>
                        {filteredPlayers.map((player) => (
                          <option value={player.id} key={player.id}>{player.nickname} · {player.publicCode} · {player.totalPoints} pts</option>
                        ))}
                      </select>
                    </label>
                    <label><span>Note interne</span><textarea maxLength={500} value={awardForm.notes} onChange={(event) => setAwardForm({ ...awardForm, notes: event.target.value })} /></label>
                    <button type="submit" disabled={pending || !selectedReward.active}>Attribuer ce lot</button>
                    {!selectedReward.active ? <small>Réactivez ce lot avant de l’attribuer.</small> : null}
                  </form>

                  <div className="reward-award-list">
                    {selectedReward.awards.map((award) => (
                      <article key={award.id}>
                        <div><strong>{award.nickname}</strong><small>{award.publicCode} · attribué le {formatDate(award.awardedAt)}</small>{award.notes ? <p>{award.notes}</p> : null}</div>
                        {award.deliveredAt ? (
                          <span className="reward-delivered">Remis le {formatDate(award.deliveredAt)}{award.deliveredByAdminName ? ` par ${award.deliveredByAdminName}` : ""}</span>
                        ) : (
                          <button type="button" disabled={pending} onClick={() => void markDelivered(award)}>Marquer comme remis</button>
                        )}
                      </article>
                    ))}
                    {!selectedReward.awards.length ? <p className="reward-empty">Ce lot n’a encore été attribué à personne.</p> : null}
                  </div>
                </>
              ) : <p className="reward-empty">Créez ou sélectionnez un lot pour gérer ses gagnants.</p>}
            </section>
          </div>
        )}
      </div>
    </AdminRegieShell>
  );
}
