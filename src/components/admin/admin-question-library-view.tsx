"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AdminIdentity } from "@/server/services/admin-auth";

export type AdminCategoryView = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
};

export type AdminQuestionSummaryView = {
  id: string;
  category: AdminCategoryView;
  questionText: string;
  difficulty: number;
  status: "DRAFT" | "REVIEW" | "VALIDATED" | "ARCHIVED";
  mediaType: "TEXT" | "IMAGE";
  mediaUrl: string | null;
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
  optionCount: number;
  sourceCount: number;
};

type AdminQuestionDetailView = Omit<
  AdminQuestionSummaryView,
  "optionCount" | "sourceCount"
> & {
  explanation: string;
  validatedBy: string | null;
  options: Array<{
    id: string;
    label: string;
    text: string;
    isCorrect: boolean;
    position: number;
  }>;
  sources: Array<{
    id: string;
    publisher: string;
    title: string;
    url: string;
    verifiedAt: string;
    notes: string | null;
  }>;
};

type QuestionFormOption = {
  key: string;
  text: string;
  isCorrect: boolean;
};

type QuestionFormSource = {
  key: string;
  publisher: string;
  title: string;
  url: string;
  verifiedAt: string;
  notes: string;
};

type QuestionFormState = {
  categoryId: string;
  questionText: string;
  explanation: string;
  difficulty: number;
  mediaType: "TEXT" | "IMAGE";
  mediaUrl: string;
  options: QuestionFormOption[];
  sources: QuestionFormSource[];
};

type Filters = {
  search: string;
  status: string;
  categoryId: string;
};

type ApiErrorPayload = { error?: { message?: string } };

const statusLabels = {
  DRAFT: "Brouillon",
  REVIEW: "En revue",
  VALIDATED: "Validée",
  ARCHIVED: "Archivée",
} as const;

const difficultyLabels = {
  1: "Découverte",
  2: "Connaisseur",
  3: "Expert",
  4: "Maître du Congo",
} as const;

const actionLabels = {
  DUPLICATE: "Dupliquer",
  SUBMIT_FOR_REVIEW: "Soumettre en revue",
  VALIDATE: "Valider la question",
  ARCHIVE: "Archiver",
} as const;

function blankQuestion(categoryId: string): QuestionFormState {
  return {
    categoryId,
    questionText: "",
    explanation: "",
    difficulty: 1,
    mediaType: "TEXT",
    mediaUrl: "",
    options: [
      { key: "new-option-a", text: "", isCorrect: false },
      { key: "new-option-b", text: "", isCorrect: false },
    ],
    sources: [],
  };
}

function questionToForm(question: AdminQuestionDetailView): QuestionFormState {
  return {
    categoryId: question.category.id,
    questionText: question.questionText,
    explanation: question.explanation,
    difficulty: question.difficulty,
    mediaType: question.mediaType,
    mediaUrl: question.mediaUrl ?? "",
    options: question.options.map((option) => ({
      key: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
    })),
    sources: question.sources.map((source) => ({
      key: source.id,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      verifiedAt: source.verifiedAt.slice(0, 10),
      notes: source.notes ?? "",
    })),
  };
}

function questionPayload(form: QuestionFormState) {
  return {
    categoryId: form.categoryId,
    questionText: form.questionText,
    explanation: form.explanation,
    difficulty: form.difficulty,
    mediaType: form.mediaType,
    mediaUrl: form.mediaType === "IMAGE" ? form.mediaUrl : null,
    options: form.options
      .filter((option) => option.text.trim())
      .map(({ text, isCorrect }) => ({ text, isCorrect })),
    sources: form.sources.map(({ publisher, title, url, verifiedAt, notes }) => ({
      publisher,
      title,
      url,
      verifiedAt,
      notes: notes || undefined,
    })),
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function nextClientKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AdminQuestionLibraryView({
  admin,
  initialCategories,
  initialQuestions,
}: {
  admin: AdminIdentity;
  initialCategories: AdminCategoryView[];
  initialQuestions: AdminQuestionSummaryView[];
}) {
  const router = useRouter();
  const firstActiveCategory = initialCategories.find((category) => category.active)?.id ?? "";
  const [questions, setQuestions] = useState(initialQuestions);
  const [categories, setCategories] = useState(initialCategories);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "",
    categoryId: "",
  });
  const [selectedQuestion, setSelectedQuestion] =
    useState<AdminQuestionDetailView | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(() =>
    blankQuestion(firstActiveCategory),
  );
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [questionPending, setQuestionPending] = useState(false);
  const [listPending, setListPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    id: "",
    name: "",
    description: "",
    active: true,
  });
  const [categoryPending, setCategoryPending] = useState(false);

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

  async function refreshQuestions(nextFilters = filters) {
    setListPending(true);
    const params = new URLSearchParams({ limit: "100" });
    if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim());
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.categoryId) params.set("categoryId", nextFilters.categoryId);

    try {
      const response = await apiFetch(`/api/admin/questions?${params}`);
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as {
        questions: AdminQuestionSummaryView[];
      };
      setQuestions(payload.questions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bibliothèque indisponible.");
    } finally {
      setListPending(false);
    }
  }

  async function refreshCategories() {
    const response = await apiFetch("/api/admin/categories");
    if (!response.ok) throw new Error(await responseError(response));
    const payload = (await response.json()) as { categories: AdminCategoryView[] };
    setCategories(payload.categories);
    return payload.categories;
  }

  async function selectQuestion(questionId: string) {
    setQuestionPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/questions/${questionId}`);
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { question: AdminQuestionDetailView };
      setSelectedQuestion(payload.question);
      setQuestionForm(questionToForm(payload.question));
      setCreatingQuestion(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Question indisponible.");
    } finally {
      setQuestionPending(false);
    }
  }

  function startNewQuestion() {
    setSelectedQuestion(null);
    setQuestionForm(blankQuestion(categories.find((category) => category.active)?.id ?? ""));
    setCreatingQuestion(true);
    setMessage(null);
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuestionPending(true);
    setMessage(null);
    try {
      const endpoint = selectedQuestion
        ? `/api/admin/questions/${selectedQuestion.id}`
        : "/api/admin/questions";
      const response = await apiFetch(endpoint, {
        method: selectedQuestion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questionPayload(questionForm)),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { question: AdminQuestionDetailView };
      setSelectedQuestion(payload.question);
      setQuestionForm(questionToForm(payload.question));
      setCreatingQuestion(false);
      await refreshQuestions();
      setMessage(selectedQuestion ? "Brouillon mis à jour." : "Brouillon créé.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setQuestionPending(false);
    }
  }

  async function runQuestionAction(
    action: keyof typeof actionLabels,
  ) {
    if (!selectedQuestion) return;
    if (
      action === "ARCHIVE" &&
      !window.confirm("Archiver cette question ? Elle restera consultable et duplicable.")
    ) {
      return;
    }

    setQuestionPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/admin/questions/${selectedQuestion.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { question: AdminQuestionDetailView };
      setSelectedQuestion(payload.question);
      setQuestionForm(questionToForm(payload.question));
      await refreshQuestions();
      setMessage(`${actionLabels[action]} : terminé.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action impossible.");
    } finally {
      setQuestionPending(false);
    }
  }

  function updateOption(key: string, patch: Partial<QuestionFormOption>) {
    setQuestionForm((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.key === key ? { ...option, ...patch } : option,
      ),
    }));
  }

  function markCorrectOption(key: string) {
    setQuestionForm((current) => ({
      ...current,
      options: current.options.map((option) => ({
        ...option,
        isCorrect: option.key === key,
      })),
    }));
  }

  function updateSource(key: string, patch: Partial<QuestionFormSource>) {
    setQuestionForm((current) => ({
      ...current,
      sources: current.sources.map((source) =>
        source.key === key ? { ...source, ...patch } : source,
      ),
    }));
  }

  function editCategory(category: AdminCategoryView) {
    setCategoryForm({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      active: category.active,
    });
  }

  function newCategory() {
    setCategoryForm({ id: "", name: "", description: "", active: true });
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategoryPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        categoryForm.id
          ? `/api/admin/categories/${categoryForm.id}`
          : "/api/admin/categories",
        {
          method: categoryForm.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: categoryForm.name,
            description: categoryForm.description,
            ...(categoryForm.id ? { active: categoryForm.active } : {}),
          }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const nextCategories = await refreshCategories();
      const payload = (await response.json()) as { category: AdminCategoryView };
      const updated = nextCategories.find(({ id }) => id === payload.category.id);
      if (updated) editCategory(updated);
      await refreshQuestions();
      setMessage(categoryForm.id ? "Catégorie mise à jour." : "Catégorie créée.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Catégorie non enregistrée.");
    } finally {
      setCategoryPending(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  const editable =
    creatingQuestion ||
    selectedQuestion?.status === "DRAFT" ||
    selectedQuestion?.status === "REVIEW";
  const hasEditor = creatingQuestion || selectedQuestion !== null;

  return (
    <main className="admin-page admin-library-page">
      <header className="admin-topbar">
        <Link href="/admin" className="admin-wordmark admin-wordmark-link">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span><strong>RÉGIE MESTE</strong><small>Bibliothèque culturelle</small></span>
        </Link>
        <div className="admin-account">
          <span>{admin.displayName}</span>
          <button type="button" onClick={logout}>Se déconnecter</button>
        </div>
      </header>

      <div className="question-library-shell">
        <section className="question-library-hero">
          <div>
            <Link href="/admin" className="question-library-back">← Retour à la régie</Link>
            <p className="eyebrow">Table éditoriale</p>
            <h1>Questions &amp; catégories</h1>
            <p>
              Préparez chaque question comme une fiche vérifiée avant son passage en direct.
            </p>
          </div>
          <div className="question-library-flow" aria-label="Cycle éditorial">
            <span>Brouillon</span><i aria-hidden="true" /><span>Revue</span><i aria-hidden="true" /><span>Validée</span>
          </div>
        </section>

        {message ? <p className="question-library-message" role="status">{message}</p> : null}

        <div className="question-library-workspace">
          <aside className="question-library-index" aria-label="Bibliothèque de questions">
            <div className="question-library-index-heading">
              <div><p className="eyebrow">Bibliothèque</p><h2>{questions.length} fiches</h2></div>
              <button type="button" onClick={startNewQuestion}>Nouvelle question</button>
            </div>

            <form
              className="question-library-filters"
              onSubmit={(event) => { event.preventDefault(); void refreshQuestions(); }}
            >
              <label className="question-library-search">
                <span>Rechercher</span>
                <input
                  type="search"
                  value={filters.search}
                  placeholder="Mot de la question…"
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                />
              </label>
              <div>
                <label><span>Statut</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                  <option value="">Tous</option>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
                <label><span>Catégorie</span><select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
                  <option value="">Toutes</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select></label>
              </div>
              <button type="submit" disabled={listPending}>{listPending ? "Actualisation…" : "Appliquer les filtres"}</button>
            </form>

            <div className="question-library-list" aria-busy={listPending}>
              {questions.length ? questions.map((question) => (
                <button
                  type="button"
                  key={question.id}
                  className={selectedQuestion?.id === question.id ? "is-selected" : undefined}
                  onClick={() => void selectQuestion(question.id)}
                >
                  <span className={`question-status-chip question-status-chip--${question.status.toLowerCase()}`}>{statusLabels[question.status]}</span>
                  <strong>{question.questionText}</strong>
                  <small>{question.category.name} · {difficultyLabels[question.difficulty as keyof typeof difficultyLabels]}</small>
                  <span className="question-library-card-meta">{question.optionCount} réponses · {question.sourceCount} source{question.sourceCount > 1 ? "s" : ""}</span>
                </button>
              )) : <div className="question-library-empty"><strong>Aucune question trouvée.</strong><span>Modifiez les filtres ou créez une première fiche.</span></div>}
            </div>
          </aside>

          <section className="question-editor" aria-busy={questionPending}>
            {!hasEditor ? (
              <div className="question-editor-empty">
                <span aria-hidden="true">Q</span>
                <h2>Choisissez une fiche</h2>
                <p>Consultez une question existante ou ouvrez un nouveau brouillon.</p>
                <button type="button" onClick={startNewQuestion}>Créer une question</button>
              </div>
            ) : (
              <form onSubmit={saveQuestion} className="question-editor-form">
                <header className="question-editor-heading">
                  <div>
                    <p className="eyebrow">{creatingQuestion ? "Nouveau brouillon" : "Fiche question"}</p>
                    <h2>{creatingQuestion ? "Composer une question" : statusLabels[selectedQuestion!.status]}</h2>
                    {selectedQuestion ? <small>Dernière modification : {formatDate(selectedQuestion.updatedAt)}</small> : null}
                  </div>
                  {selectedQuestion ? <span className={`question-status-chip question-status-chip--${selectedQuestion.status.toLowerCase()}`}>{statusLabels[selectedQuestion.status]}</span> : null}
                </header>

                {!editable ? <p className="question-editor-readonly">Cette fiche est en lecture seule. Dupliquez-la pour créer une nouvelle version modifiable.</p> : selectedQuestion?.status === "REVIEW" ? <p className="question-editor-readonly">Toute modification replacera cette question au statut Brouillon.</p> : null}

                <fieldset disabled={!editable || questionPending}>
                  <legend>Contenu</legend>
                  <label className="question-editor-wide"><span>Question</span><textarea rows={3} required minLength={5} maxLength={500} value={questionForm.questionText} onChange={(event) => setQuestionForm({ ...questionForm, questionText: event.target.value })} /></label>
                  <label><span>Catégorie</span><select required value={questionForm.categoryId} onChange={(event) => setQuestionForm({ ...questionForm, categoryId: event.target.value })}>
                    <option value="">Choisir</option>
                    {categories.map((category) => <option key={category.id} value={category.id} disabled={!category.active}>{category.name}{category.active ? "" : " — inactive"}</option>)}
                  </select></label>
                  <label><span>Difficulté</span><select value={questionForm.difficulty} onChange={(event) => setQuestionForm({ ...questionForm, difficulty: Number(event.target.value) })}>
                    {Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  <label><span>Type</span><select value={questionForm.mediaType} onChange={(event) => setQuestionForm({ ...questionForm, mediaType: event.target.value as "TEXT" | "IMAGE", mediaUrl: event.target.value === "TEXT" ? "" : questionForm.mediaUrl })}>
                    <option value="TEXT">QCM texte</option><option value="IMAGE">QCM avec image</option>
                  </select></label>
                  {questionForm.mediaType === "IMAGE" ? <label><span>URL de l’image</span><input type="url" required maxLength={2000} value={questionForm.mediaUrl} onChange={(event) => setQuestionForm({ ...questionForm, mediaUrl: event.target.value })} /></label> : null}
                  <label className="question-editor-wide"><span>Explication culturelle</span><textarea rows={4} required maxLength={2000} value={questionForm.explanation} onChange={(event) => setQuestionForm({ ...questionForm, explanation: event.target.value })} /></label>
                </fieldset>

                <fieldset disabled={!editable || questionPending}>
                  <legend>Réponses</legend>
                  <p className="question-editor-guidance">Deux à quatre propositions. La bonne réponse reste strictement réservée à la régie avant révélation.</p>
                  <div className="question-option-list">
                    {questionForm.options.map((option, index) => (
                      <div key={option.key} className="question-option-row">
                        <label className="question-correct-choice" title="Marquer comme bonne réponse"><input type="radio" name="correct-option" checked={option.isCorrect} onChange={() => markCorrectOption(option.key)} /><span>{String.fromCharCode(65 + index)}</span></label>
                        <input aria-label={`Proposition ${String.fromCharCode(65 + index)}`} maxLength={500} value={option.text} onChange={(event) => updateOption(option.key, { text: event.target.value })} />
                        <button type="button" aria-label={`Retirer la proposition ${String.fromCharCode(65 + index)}`} disabled={questionForm.options.length <= 2} onClick={() => setQuestionForm({ ...questionForm, options: questionForm.options.filter(({ key }) => key !== option.key) })}>×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="question-editor-add" disabled={questionForm.options.length >= 4} onClick={() => setQuestionForm({ ...questionForm, options: [...questionForm.options, { key: nextClientKey("option"), text: "", isCorrect: false }] })}>+ Ajouter une proposition</button>
                </fieldset>

                <fieldset disabled={!editable || questionPending}>
                  <legend>Sources</legend>
                  <p className="question-editor-guidance">Une source vérifiable est obligatoire avant la mise en revue.</p>
                  <div className="question-source-list">
                    {questionForm.sources.map((source, index) => (
                      <article key={source.key} className="question-source-card">
                        <header><strong>Source {index + 1}</strong><button type="button" onClick={() => setQuestionForm({ ...questionForm, sources: questionForm.sources.filter(({ key }) => key !== source.key) })}>Retirer</button></header>
                        <label><span>Organisme ou auteur</span><input required maxLength={200} value={source.publisher} onChange={(event) => updateSource(source.key, { publisher: event.target.value })} /></label>
                        <label><span>Titre</span><input required maxLength={500} value={source.title} onChange={(event) => updateSource(source.key, { title: event.target.value })} /></label>
                        <label><span>URL</span><input type="url" required maxLength={2000} value={source.url} onChange={(event) => updateSource(source.key, { url: event.target.value })} /></label>
                        <label><span>Date de vérification</span><input type="date" required value={source.verifiedAt} onChange={(event) => updateSource(source.key, { verifiedAt: event.target.value })} /></label>
                        <label className="question-editor-wide"><span>Commentaire</span><textarea rows={2} maxLength={2000} value={source.notes} onChange={(event) => updateSource(source.key, { notes: event.target.value })} /></label>
                      </article>
                    ))}
                  </div>
                  <button type="button" className="question-editor-add" disabled={questionForm.sources.length >= 10} onClick={() => setQuestionForm({ ...questionForm, sources: [...questionForm.sources, { key: nextClientKey("source"), publisher: "", title: "", url: "", verifiedAt: new Date().toISOString().slice(0, 10), notes: "" }] })}>+ Ajouter une source</button>
                </fieldset>

                <footer className="question-editor-actions">
                  {editable ? <button className="question-editor-save" type="submit" disabled={questionPending}>{questionPending ? "Enregistrement…" : selectedQuestion ? "Enregistrer le brouillon" : "Créer le brouillon"}</button> : null}
                  {selectedQuestion ? <div>
                    <button type="button" onClick={() => void runQuestionAction("DUPLICATE")} disabled={questionPending}>Dupliquer</button>
                    {selectedQuestion.status === "DRAFT" ? <button type="button" onClick={() => void runQuestionAction("SUBMIT_FOR_REVIEW")} disabled={questionPending}>Soumettre en revue</button> : null}
                    {selectedQuestion.status === "REVIEW" ? <button type="button" className="question-editor-validate" onClick={() => void runQuestionAction("VALIDATE")} disabled={questionPending}>Valider</button> : null}
                    {selectedQuestion.status !== "ARCHIVED" ? <button type="button" className="question-editor-archive" onClick={() => void runQuestionAction("ARCHIVE")} disabled={questionPending}>Archiver</button> : null}
                  </div> : null}
                </footer>
              </form>
            )}
          </section>
        </div>

        <section className="category-manager" id="categories">
          <div className="category-manager-intro"><p className="eyebrow">Classement du contenu</p><h2>Catégories</h2><p>Une catégorie inactive reste dans l’historique mais ne permet plus de valider de nouvelles questions.</p><button type="button" onClick={newCategory}>Nouvelle catégorie</button></div>
          <div className="category-manager-list">
            {categories.map((category) => <button type="button" key={category.id} className={categoryForm.id === category.id ? "is-selected" : undefined} onClick={() => editCategory(category)}><span>{category.name}</span><small>{category.active ? "Active" : "Inactive"} · {category.slug}</small></button>)}
          </div>
          <form className="category-manager-form" onSubmit={saveCategory}>
            <p className="eyebrow">{categoryForm.id ? "Modifier" : "Créer"}</p>
            <h3>{categoryForm.id ? categoryForm.name : "Nouvelle catégorie"}</h3>
            <label><span>Nom</span><input required minLength={2} maxLength={100} value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></label>
            <label><span>Description</span><textarea rows={3} maxLength={2000} value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></label>
            {categoryForm.id ? <label className="category-active-toggle"><input type="checkbox" checked={categoryForm.active} onChange={(event) => setCategoryForm({ ...categoryForm, active: event.target.checked })} /><span>Catégorie active</span></label> : null}
            <button type="submit" disabled={categoryPending}>{categoryPending ? "Enregistrement…" : categoryForm.id ? "Enregistrer la catégorie" : "Créer la catégorie"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
