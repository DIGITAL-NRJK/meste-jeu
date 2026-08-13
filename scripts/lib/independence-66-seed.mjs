import { createHash } from "node:crypto";

import { neon } from "@neondatabase/serverless";

const expectedEventName =
  "Tombola - Fête de l'indépendance de la République du Congo - 66e anniversaire";
const expectedConfirmation = {
  preview: "SEED-INDEPENDENCE-66-PREVIEW",
  production: "SEED-INDEPENDENCE-66-PRODUCTION",
};
const optionLabels = ["A", "B", "C", "D"];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function deterministicUuid(kind, key) {
  const bytes = createHash("sha256")
    .update(`meste:independence-66:${kind}:${key}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexadecimal = bytes.toString("hex");

  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

export function validateIndependence66Content(content) {
  invariant(content?.key === "independence-66", "Clé de seed inattendue.");
  invariant(
    content.event?.name === expectedEventName,
    "Le nom de l’événement ne correspond pas à la demande validée.",
  );
  invariant(
    content.event.timezone === "Africa/Accra",
    "Le fuseau de l’événement doit être Africa/Accra.",
  );
  invariant(
    content.event.status === "DRAFT",
    "Le seed ne doit pas ouvrir automatiquement l’événement.",
  );
  invariant(
    new Date(content.event.endsAt) > new Date(content.event.startsAt),
    "La fenêtre de l’événement est invalide.",
  );
  invariant(content.categories?.length === 5, "Le seed doit contenir 5 catégories.");
  invariant(content.questions?.length === 50, "Le seed doit contenir 50 questions.");
  invariant(content.sessions?.length === 6, "Le seed doit contenir 6 sessions.");

  const categoryKeys = new Set(content.categories.map(({ key }) => key));
  const categorySlugs = new Set(content.categories.map(({ slug }) => slug));
  invariant(categoryKeys.size === 5, "Les clés de catégorie doivent être uniques.");
  invariant(categorySlugs.size === 5, "Les slugs de catégorie doivent être uniques.");

  const questionKeys = new Set();
  const questionTexts = new Set();
  const questionsByCategory = new Map(
    content.categories.map(({ key }) => [key, 0]),
  );

  for (const question of content.questions) {
    invariant(categoryKeys.has(question.categoryKey), `Catégorie inconnue pour ${question.key}.`);
    invariant(!questionKeys.has(question.key), `Clé de question dupliquée : ${question.key}.`);
    invariant(
      !questionTexts.has(question.questionText),
      `Texte de question dupliqué : ${question.questionText}.`,
    );
    invariant(question.options?.length === 4, `${question.key} doit proposer 4 réponses.`);
    invariant(
      question.options.every((option) => option.trim().length > 0) &&
        new Set(question.options).size === 4,
      `Les réponses de ${question.key} doivent être remplies et uniques.`,
    );
    invariant(
      Number.isInteger(question.correctIndex) &&
        question.correctIndex >= 0 &&
        question.correctIndex < question.options.length,
      `Bonne réponse invalide pour ${question.key}.`,
    );
    invariant(
      Number.isInteger(question.difficulty) &&
        question.difficulty >= 1 &&
        question.difficulty <= 4,
      `Difficulté invalide pour ${question.key}.`,
    );
    invariant(
      question.sources?.length >= 1 &&
        question.sources.every(
          (source) =>
            source.publisher &&
            source.title &&
            source.url?.startsWith("https://") &&
            !Number.isNaN(Date.parse(source.verifiedAt)),
        ),
      `Source invalide pour ${question.key}.`,
    );
    invariant(question.explanation?.trim(), `Explication absente pour ${question.key}.`);

    questionKeys.add(question.key);
    questionTexts.add(question.questionText);
    questionsByCategory.set(
      question.categoryKey,
      questionsByCategory.get(question.categoryKey) + 1,
    );
  }

  for (const [categoryKey, count] of questionsByCategory) {
    invariant(count === 10, `La catégorie ${categoryKey} doit contenir 10 questions.`);
  }

  const sessionKeys = new Set();
  const sessionSlugs = new Set();
  for (const session of content.sessions) {
    invariant(!sessionKeys.has(session.key), `Clé de session dupliquée : ${session.key}.`);
    invariant(!sessionSlugs.has(session.slug), `Slug de session dupliqué : ${session.slug}.`);
    invariant(
      session.mode === "DISCOVERY" || session.mode === "LIVE",
      `Mode invalide pour ${session.key}.`,
    );
    invariant(session.status === "DRAFT", `${session.key} doit rester en brouillon.`);
    invariant(
      session.questionKeys?.length === 10,
      `${session.key} doit contenir 10 questions.`,
    );
    invariant(
      new Set(session.questionKeys).size === 10,
      `${session.key} contient une question en double.`,
    );
    invariant(
      session.questionKeys.every((questionKey) => questionKeys.has(questionKey)),
      `${session.key} référence une question inconnue.`,
    );
    sessionKeys.add(session.key);
    sessionSlugs.add(session.slug);
  }

  return {
    categories: content.categories.length,
    questions: content.questions.length,
    sessions: content.sessions.length,
    sessionQuestions: content.sessions.reduce(
      (total, session) => total + session.questionKeys.length,
      0,
    ),
  };
}

export function prepareIndependence66Seed(content, adminUserId, now = new Date()) {
  validateIndependence66Content(content);
  const timestamp = now.toISOString();
  const eventId = deterministicUuid("event", content.event.slug);
  const categoryIds = new Map(
    content.categories.map((category) => [
      category.key,
      deterministicUuid("category", category.slug),
    ]),
  );
  const questionIds = new Map(
    content.questions.map((question) => [
      question.key,
      deterministicUuid("question", question.key),
    ]),
  );
  const sessionIds = new Map(
    content.sessions.map((session) => [
      session.key,
      deterministicUuid("session", session.key),
    ]),
  );

  const event = {
    id: eventId,
    ...content.event,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const categories = content.categories.map((category) => ({
    id: categoryIds.get(category.key),
    ...category,
    active: true,
  }));
  const questions = content.questions.map((question) => ({
    id: questionIds.get(question.key),
    categoryId: categoryIds.get(question.categoryKey),
    questionText: question.questionText,
    explanation: question.explanation,
    difficulty: question.difficulty,
    status: "VALIDATED",
    mediaType: "TEXT",
    mediaUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    validatedAt: timestamp,
    validatedBy: adminUserId,
  }));
  const options = content.questions.flatMap((question) =>
    question.options.map((text, index) => ({
      id: deterministicUuid("option", `${question.key}:${index + 1}`),
      questionId: questionIds.get(question.key),
      label: optionLabels[index],
      text,
      isCorrect: index === question.correctIndex,
      position: index + 1,
    })),
  );
  const questionSources = content.questions.flatMap((question) =>
    question.sources.map((source, index) => ({
      id: deterministicUuid("source", `${question.key}:${index + 1}`),
      questionId: questionIds.get(question.key),
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      verifiedAt: source.verifiedAt,
      notes: `Vérifiée pour le seed ${content.key}.`,
    })),
  );
  const sessions = content.sessions.map((session) => ({
    id: sessionIds.get(session.key),
    eventId,
    name: session.name,
    slug: session.slug,
    mode: session.mode,
    status: session.status,
    startsAt: null,
    endsAt: null,
    resetScore: session.resetScore,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const sessionQuestions = content.sessions.flatMap((session) =>
    session.questionKeys.map((questionKey, index) => ({
      id: deterministicUuid(
        "session-question",
        `${session.key}:${questionKey}`,
      ),
      quizSessionId: sessionIds.get(session.key),
      questionId: questionIds.get(questionKey),
      position: index + 1,
      durationSeconds: 30,
      status: "PENDING",
    })),
  );
  const auditLogs = [
    ...content.questions.flatMap((question) => {
      const questionId = questionIds.get(question.key);
      return [
        {
          id: deterministicUuid("audit", `question-created:${question.key}`),
          adminUserId,
          action: "QUESTION_CREATED",
          entityType: "question",
          entityId: questionId,
          metadata: { seed: content.key },
          createdAt: timestamp,
        },
        {
          id: deterministicUuid("audit", `question-validated:${question.key}`),
          adminUserId,
          action: "QUESTION_VALIDATED",
          entityType: "question",
          entityId: questionId,
          metadata: { seed: content.key },
          createdAt: timestamp,
        },
      ];
    }),
    ...content.sessions.map((session) => ({
      id: deterministicUuid("audit", `session-created:${session.key}`),
      adminUserId,
      action: "SESSION_CREATED",
      entityType: "quiz_session",
      entityId: sessionIds.get(session.key),
      metadata: { eventId, seed: content.key },
      createdAt: timestamp,
    })),
  ];

  return {
    event,
    categories,
    questions,
    options,
    questionSources,
    sessions,
    sessionQuestions,
    auditLogs,
  };
}

export function inspectDatabaseUrl(databaseUrl) {
  invariant(databaseUrl, "DATABASE_URL_UNPOOLED est absente.");
  const parsed = new URL(databaseUrl);
  invariant(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "DATABASE_URL_UNPOOLED doit être une URL PostgreSQL.",
  );
  invariant(
    !parsed.hostname.includes("-pooler"),
    "Utilisez l’URL Neon directe, sans suffixe -pooler.",
  );

  return {
    hostname: parsed.hostname,
    database: parsed.pathname.slice(1),
  };
}

function json(value) {
  return JSON.stringify(value);
}

async function preflight(sql, prepared) {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${[
        "admin_users",
        "events",
        "categories",
        "questions",
        "question_options",
        "question_sources",
        "quiz_sessions",
        "session_questions",
        "audit_logs",
      ]})
  `;
  invariant(tables.length === 9, "Le schéma applicatif complet n’est pas présent sur cette base.");

  const eventConflicts = await sql`
    SELECT id, slug, name, timezone
    FROM events
    WHERE id = ${prepared.event.id} OR slug = ${prepared.event.slug}
  `;
  invariant(
    eventConflicts.every(
      (row) =>
        row.id === prepared.event.id &&
        row.slug === prepared.event.slug &&
        row.name === prepared.event.name &&
        row.timezone === prepared.event.timezone,
    ),
    "Un événement existant entre en conflit avec le seed.",
  );

  const categoryConflicts = await sql`
    SELECT id, slug, name
    FROM categories
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.categories.map(({ id }) => id),
      )}::jsonb)
    ) OR slug IN (
      SELECT value FROM jsonb_array_elements_text(${json(
        prepared.categories.map(({ slug }) => slug),
      )}::jsonb)
    )
  `;
  const expectedCategories = new Map(
    prepared.categories.map((category) => [category.id, category]),
  );
  invariant(
    categoryConflicts.every((row) => {
      const expected = expectedCategories.get(row.id);
      return expected?.slug === row.slug && expected.name === row.name;
    }),
    "Une catégorie existante entre en conflit avec le seed.",
  );

  const questionConflicts = await sql`
    SELECT id, category_id, question_text
    FROM questions
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.questions.map(({ id }) => id),
      )}::jsonb)
    )
  `;
  const expectedQuestions = new Map(
    prepared.questions.map((question) => [question.id, question]),
  );
  invariant(
    questionConflicts.every((row) => {
      const expected = expectedQuestions.get(row.id);
      return (
        expected?.categoryId === row.category_id &&
        expected.questionText === row.question_text
      );
    }),
    "Une question existante entre en conflit avec le seed.",
  );

  const sessionConflicts = await sql`
    SELECT id, event_id, slug, name
    FROM quiz_sessions
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.sessions.map(({ id }) => id),
      )}::jsonb)
    ) OR (event_id = ${prepared.event.id} AND slug IN (
      SELECT value FROM jsonb_array_elements_text(${json(
        prepared.sessions.map(({ slug }) => slug),
      )}::jsonb)
    ))
  `;
  const expectedSessions = new Map(
    prepared.sessions.map((session) => [session.id, session]),
  );
  invariant(
    sessionConflicts.every((row) => {
      const expected = expectedSessions.get(row.id);
      return (
        expected?.eventId === row.event_id &&
        expected.slug === row.slug &&
        expected.name === row.name
      );
    }),
    "Une session existante entre en conflit avec le seed.",
  );

  return {
    eventAlreadyPresent: eventConflicts.length === 1,
    existingQuestions: questionConflicts.length,
    existingSessions: sessionConflicts.length,
  };
}

function insertionQueries(tx, prepared) {
  const eventRows = [
    {
      ...prepared.event,
      starts_at: prepared.event.startsAt,
      ends_at: prepared.event.endsAt,
      created_at: prepared.event.createdAt,
      updated_at: prepared.event.updatedAt,
    },
  ];
  const questionRows = prepared.questions.map((question) => ({
    ...question,
    category_id: question.categoryId,
    question_text: question.questionText,
    media_type: question.mediaType,
    media_url: question.mediaUrl,
    created_at: question.createdAt,
    updated_at: question.updatedAt,
    validated_at: question.validatedAt,
    validated_by: question.validatedBy,
  }));
  const optionRows = prepared.options.map((option) => ({
    ...option,
    question_id: option.questionId,
    is_correct: option.isCorrect,
  }));
  const sourceRows = prepared.questionSources.map((source) => ({
    ...source,
    question_id: source.questionId,
    verified_at: source.verifiedAt,
  }));
  const sessionRows = prepared.sessions.map((session) => ({
    ...session,
    event_id: session.eventId,
    starts_at: session.startsAt,
    ends_at: session.endsAt,
    reset_score: session.resetScore,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  }));
  const sessionQuestionRows = prepared.sessionQuestions.map((entry) => ({
    ...entry,
    quiz_session_id: entry.quizSessionId,
    question_id: entry.questionId,
    duration_seconds: entry.durationSeconds,
  }));
  const auditRows = prepared.auditLogs.map((entry) => ({
    ...entry,
    admin_user_id: entry.adminUserId,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    created_at: entry.createdAt,
  }));

  return [
    tx`
      INSERT INTO events (
        id, slug, name, description, starts_at, ends_at, timezone, status,
        created_at, updated_at
      )
      SELECT
        x.id::uuid, x.slug, x.name, x.description, x.starts_at::timestamptz,
        x.ends_at::timestamptz, x.timezone, x.status::event_status,
        x.created_at::timestamptz, x.updated_at::timestamptz
      FROM jsonb_to_recordset(${json(eventRows)}::jsonb) AS x(
        id text, slug text, name text, description text, starts_at text,
        ends_at text, timezone text, status text, created_at text, updated_at text
      )
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO categories (id, name, slug, description, active)
      SELECT x.id::uuid, x.name, x.slug, x.description, x.active
      FROM jsonb_to_recordset(${json(prepared.categories)}::jsonb) AS x(
        id text, key text, name text, slug text, description text, active boolean
      )
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO questions (
        id, category_id, question_text, explanation, difficulty, status,
        media_type, media_url, created_at, updated_at, validated_at, validated_by
      )
      SELECT
        x.id::uuid, x.category_id::uuid, x.question_text, x.explanation,
        x.difficulty, x.status::question_status, x.media_type::question_media_type,
        x.media_url, x.created_at::timestamptz, x.updated_at::timestamptz,
        x.validated_at::timestamptz, x.validated_by::uuid
      FROM jsonb_to_recordset(${json(questionRows)}::jsonb) AS x(
        id text, category_id text, question_text text, explanation text,
        difficulty integer, status text, media_type text, media_url text,
        created_at text, updated_at text, validated_at text, validated_by text
      )
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO question_options (
        id, question_id, label, text, is_correct, position
      )
      SELECT
        x.id::uuid, x.question_id::uuid, x.label, x.text, x.is_correct, x.position
      FROM jsonb_to_recordset(${json(optionRows)}::jsonb) AS x(
        id text, question_id text, label text, text text,
        is_correct boolean, position integer
      )
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO question_sources (
        id, question_id, publisher, title, url, verified_at, notes
      )
      SELECT
        x.id::uuid, x.question_id::uuid, x.publisher, x.title, x.url,
        x.verified_at::timestamptz, x.notes
      FROM jsonb_to_recordset(${json(sourceRows)}::jsonb) AS x(
        id text, question_id text, publisher text, title text, url text,
        verified_at text, notes text
      )
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO quiz_sessions (
        id, event_id, name, slug, mode, status, starts_at, ends_at,
        reset_score, created_at, updated_at
      )
      SELECT
        x.id::uuid, x.event_id::uuid, x.name, x.slug, x.mode::quiz_mode,
        x.status::quiz_session_status, x.starts_at::timestamptz,
        x.ends_at::timestamptz, x.reset_score, x.created_at::timestamptz,
        x.updated_at::timestamptz
      FROM jsonb_to_recordset(${json(sessionRows)}::jsonb) AS x(
        id text, event_id text, name text, slug text, mode text, status text,
        starts_at text, ends_at text, reset_score boolean, created_at text,
        updated_at text
      )
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO session_questions (
        id, quiz_session_id, question_id, position, duration_seconds, status
      )
      SELECT
        x.id::uuid, x.quiz_session_id::uuid, x.question_id::uuid,
        x.position, x.duration_seconds, x.status::session_question_status
      FROM jsonb_to_recordset(${json(sessionQuestionRows)}::jsonb) AS x(
        id text, quiz_session_id text, question_id text, position integer,
        duration_seconds integer, status text
      )
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO audit_logs (
        id, admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        x.id::uuid, x.admin_user_id::uuid, x.action::audit_action,
        x.entity_type, x.entity_id::uuid, x.metadata, x.created_at::timestamptz
      FROM jsonb_to_recordset(${json(auditRows)}::jsonb) AS x(
        id text, admin_user_id text, action text, entity_type text,
        entity_id text, metadata jsonb, created_at text
      )
      ON CONFLICT DO NOTHING
    `,
  ];
}

async function verify(sql, prepared) {
  const [eventCount] = await sql`
    SELECT count(*)::integer AS count FROM events WHERE id = ${prepared.event.id}
  `;
  const [categoryCount] = await sql`
    SELECT count(*)::integer AS count
    FROM categories
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.categories.map(({ id }) => id),
      )}::jsonb)
    )
  `;
  const [questionCount] = await sql`
    SELECT count(*)::integer AS count
    FROM questions
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.questions.map(({ id }) => id),
      )}::jsonb)
    )
  `;
  const [validatedQuestionCount] = await sql`
    SELECT count(*)::integer AS count
    FROM questions
    WHERE status = 'VALIDATED' AND id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.questions.map(({ id }) => id),
      )}::jsonb)
    )
  `;
  const [optionCount] = await sql`
    SELECT count(*)::integer AS count
    FROM question_options
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.options.map(({ id }) => id),
      )}::jsonb)
    )
  `;
  const [sourceCount] = await sql`
    SELECT count(*)::integer AS count
    FROM question_sources
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.questionSources.map(({ id }) => id),
      )}::jsonb)
    )
  `;
  const [sessionCount] = await sql`
    SELECT count(*)::integer AS count
    FROM quiz_sessions
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.sessions.map(({ id }) => id),
      )}::jsonb)
    )
  `;
  const [lineupCount] = await sql`
    SELECT count(*)::integer AS count
    FROM session_questions
    WHERE id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(${json(
        prepared.sessionQuestions.map(({ id }) => id),
      )}::jsonb)
    )
  `;

  const result = {
    events: eventCount.count,
    categories: categoryCount.count,
    questions: questionCount.count,
    validatedQuestions: validatedQuestionCount.count,
    options: optionCount.count,
    sources: sourceCount.count,
    sessions: sessionCount.count,
    sessionQuestions: lineupCount.count,
  };
  invariant(result.events === 1, "L’événement n’a pas été créé.");
  invariant(result.categories === 5, "Les 5 catégories ne sont pas présentes.");
  invariant(result.questions === 50, "Les 50 questions ne sont pas présentes.");
  invariant(result.validatedQuestions === 50, "Les 50 questions ne sont pas validées.");
  invariant(result.options === 200, "Les 200 choix de réponse ne sont pas présents.");
  invariant(result.sources === 50, "Les 50 sources ne sont pas présentes.");
  invariant(result.sessions === 6, "Les 6 sessions ne sont pas présentes.");
  invariant(result.sessionQuestions === 60, "Les 60 entrées de conducteur ne sont pas présentes.");

  return result;
}

export async function applyIndependence66Seed({
  content,
  databaseUrl,
  adminEmail,
  target,
  confirmation,
  now,
}) {
  invariant(target === "preview" || target === "production", "Cible de seed invalide.");
  invariant(
    confirmation === expectedConfirmation[target],
    `Confirmation requise : ${expectedConfirmation[target]}`,
  );
  invariant(
    typeof adminEmail === "string" && /^\S+@\S+\.\S+$/.test(adminEmail),
    "Adresse administrateur invalide.",
  );
  const connection = inspectDatabaseUrl(databaseUrl);
  const sql = neon(databaseUrl);
  const admins = await sql`
    SELECT id, status
    FROM admin_users
    WHERE lower(email) = lower(${adminEmail})
    LIMIT 1
  `;
  invariant(admins.length === 1, "Administrateur introuvable sur la base ciblée.");
  invariant(admins[0].status === "ACTIVE", "L’administrateur ciblé est désactivé.");

  const prepared = prepareIndependence66Seed(content, admins[0].id, now);
  const before = await preflight(sql, prepared);
  await sql.transaction((tx) => insertionQueries(tx, prepared), {
    isolationLevel: "Serializable",
  });
  const counts = await verify(sql, prepared);

  return {
    target,
    connection,
    before,
    counts,
    eventId: prepared.event.id,
    eventSlug: prepared.event.slug,
  };
}
