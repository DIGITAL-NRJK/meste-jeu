import { expect, test } from "@playwright/test";

test("la fondation mobile et le health check répondent", async ({
  page,
  request,
}) => {
  const homepage = await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Héritage Congo" }),
  ).toBeVisible();
  expect(homepage?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(homepage?.headers()["x-frame-options"]).toBe("DENY");
  expect(homepage?.headers()["permissions-policy"]).toContain("camera=()");

  const health = await request.get("/api/health");

  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: "ok" });
});

test("l’accueil ouvre l’événement de production retourné par le serveur", async ({
  page,
}) => {
  await page.route("**/api/events/active", async (route) => {
    await route.fulfill({
      json: {
        event: {
          slug: "tombola-fete-independance-republique-congo-66e-anniversaire",
          name: "Tombola — 66e anniversaire",
          status: "READY",
        },
      },
    });
  });
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 401,
      json: { error: { code: "UNAUTHENTICATED" } },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Participer au quiz" }).click();

  await expect(page).toHaveURL(
    /\/play\/tombola-fete-independance-republique-congo-66e-anniversaire$/,
  );
  await expect(page.getByLabel("Votre nom de joueur")).toBeVisible();
});

test("le joueur s’inscrit et rejoint le lobby sur mobile", async ({ page }) => {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED" } } });
  });
  await page.route("**/api/register", async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        player: {
          publicCode: "HC-084200",
          nickname: "Makaya",
          currentStreak: 0,
          totalPoints: 0,
        },
        event: {
          slug: "heritage-congo-2026",
          name: "Héritage Congo 2026",
          timezone: "Africa/Accra",
          status: "READY",
        },
      },
    });
  });
  await page.route("**/api/events/heritage-congo-2026/state", async (route) => {
    await route.fulfill({
      json: {
        event: {
          slug: "heritage-congo-2026",
          name: "Héritage Congo 2026",
          status: "READY",
        },
        session: {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Grand Quiz de l’Indépendance",
          mode: "LIVE",
          status: "READY",
          startsAt: null,
          endsAt: null,
          currentQuestion: null,
        },
      },
    });
  });
  await page.route("**/api/sessions/*/current-question", async (route) => {
    await route.fulfill({
      json: {
        session: {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Grand Quiz de l’Indépendance",
          slug: "grand-quiz",
          mode: "LIVE",
          status: "READY",
          startsAt: null,
          endsAt: null,
        },
        currentQuestion: null,
      },
    });
  });

  await page.goto("/play/heritage-congo-2026");
  await page.getByLabel("Votre nom de joueur").fill("Makaya");
  await page.getByRole("button", { name: "Entrer dans le jeu" }).click();

  await expect(page.getByText("Bienvenue, Makaya")).toBeVisible();
  await expect(page.getByRole("heading", { name: "La table se prépare" })).toBeVisible();
  await expect(page.getByText("HC-084200")).toBeVisible();
});

test("la correction reste masquée jusqu’à la révélation serveur", async ({ page }) => {
  const sessionId = "00000000-0000-4000-8000-000000000001";
  const questionId = "00000000-0000-4000-8000-000000000002";
  const optionA = "00000000-0000-4000-8000-000000000003";
  const optionB = "00000000-0000-4000-8000-000000000004";
  const opensAt = new Date(Date.now() - 5_000).toISOString();
  const closesAt = new Date(Date.now() + 60_000).toISOString();
  let status: "OPEN" | "REVEALED" = "OPEN";

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      json: {
        player: {
          publicCode: "HC-084200",
          nickname: "Makaya",
          currentStreak: status === "REVEALED" ? 1 : 0,
          totalPoints: status === "REVEALED" ? 175 : 0,
        },
        event: {
          slug: "heritage-congo-2026",
          name: "Héritage Congo 2026",
          timezone: "Africa/Accra",
          status: "LIVE",
        },
      },
    });
  });
  await page.route("**/api/events/heritage-congo-2026/state", async (route) => {
    await route.fulfill({
      json: {
        event: { slug: "heritage-congo-2026", name: "Héritage Congo 2026", status: "LIVE" },
        session: {
          id: sessionId,
          name: "Grand Quiz de l’Indépendance",
          mode: "LIVE",
          status: "LIVE",
          startsAt: opensAt,
          endsAt: null,
          currentQuestion: {
            id: questionId,
            status,
            opensAt,
            closesAt,
            revealedAt: status === "REVEALED" ? new Date().toISOString() : null,
            canceledAt: null,
          },
        },
      },
    });
  });
  await page.route("**/api/sessions/*/current-question", async (route) => {
    await route.fulfill({
      json: {
        session: {
          id: sessionId,
          name: "Grand Quiz de l’Indépendance",
          slug: "grand-quiz",
          mode: "LIVE",
          status: "LIVE",
          startsAt: opensAt,
          endsAt: null,
        },
        currentQuestion: {
          id: questionId,
          position: 1,
          totalQuestions: 10,
          durationSeconds: 65,
          status,
          opensAt,
          closesAt,
          revealedAt: status === "REVEALED" ? new Date().toISOString() : null,
          canceledAt: null,
          acceptingAnswers: status === "OPEN",
          category: { name: "Histoire", slug: "histoire" },
          questionText: "Quelle ville est la capitale de la République du Congo ?",
          difficulty: 3,
          mediaType: "TEXT",
          mediaUrl: null,
          options: [
            { id: optionA, label: "A", text: "Brazzaville" },
            { id: optionB, label: "B", text: "Pointe-Noire" },
          ],
          ...(status === "REVEALED"
            ? { reveal: { correctOptionId: optionA, explanation: "Brazzaville est la capitale politique de la République du Congo." } }
            : {}),
        },
      },
    });
  });
  await page.route("**/api/session-questions/*/answer", async (route) => {
    await route.fulfill({ status: 201, json: { answer: { id: "answer", responseTimeMs: 5000 } } });
  });
  await page.route("**/api/session-questions/*/result", async (route) => {
    await route.fulfill({
      json:
        status === "OPEN"
          ? { status: "OPEN", answerSubmitted: false }
          : {
              status: "REVEALED",
              answerSubmitted: true,
              selectedOptionId: optionA,
              correctOptionId: optionA,
              isCorrect: true,
              explanation: "Brazzaville est la capitale politique de la République du Congo.",
              score: {
                answerPoints: 100,
                difficultyBonus: 40,
                speedBonus: 15,
                streakBonus: 20,
              },
              totalPoints: 175,
            },
    });
  });

  await page.goto("/play/heritage-congo-2026");
  await expect(page.getByRole("heading", { name: /Quelle ville/ })).toBeVisible();
  await page.getByRole("button", { name: /A Brazzaville/ }).click();
  await expect(page.getByText("Réponse enregistrée ✓")).toBeVisible();
  await expect(page.getByText("Le saviez-vous ?")).not.toBeVisible();

  status = "REVEALED";
  await expect(page.getByText("Le saviez-vous ?")).toBeVisible({ timeout: 7_000 });
  await expect(page.getByText("+175 pts")).toBeVisible();
  await expect(page.getByText("Brazzaville est la capitale politique de la République du Congo.")).toBeVisible();
});

test("le classement affiche le Top 10, la position personnelle et la portée session", async ({
  page,
}) => {
  const sessionId = "00000000-0000-4000-8000-000000000001";
  const eventEntries = Array.from({ length: 10 }, (_, index) => ({
    position: index + 1,
    publicCode: `HC-${String(index + 1).padStart(6, "0")}`,
    nickname: `Joueur ${index + 1}`,
    points: 1_000 - index * 25,
  }));

  await page.route("**/api/events/heritage-congo-2026/state", async (route) => {
    await route.fulfill({
      json: {
        event: {
          slug: "heritage-congo-2026",
          name: "Héritage Congo 2026",
          status: "LIVE",
        },
        session: {
          id: sessionId,
          name: "Grand Quiz de l’Indépendance",
          status: "LIVE",
        },
      },
    });
  });
  await page.route("**/api/leaderboard?**", async (route) => {
    const sessionScope = new URL(route.request().url()).searchParams.has(
      "sessionId",
    );
    await route.fulfill({
      json: sessionScope
        ? {
            event: {
              slug: "heritage-congo-2026",
              name: "Héritage Congo 2026",
              status: "LIVE",
            },
            scope: {
              type: "SESSION",
              id: sessionId,
              name: "Grand Quiz de l’Indépendance",
              status: "LIVE",
            },
            entries: [
              {
                position: 1,
                publicCode: "HC-000001",
                nickname: "Makaya",
                points: 175,
              },
              {
                position: 1,
                publicCode: "HC-000002",
                nickname: "Nzambe",
                points: 175,
              },
            ],
            currentPlayer: {
              position: 1,
              publicCode: "HC-000001",
              nickname: "Makaya",
              points: 175,
            },
            participantCount: 2,
          }
        : {
            event: {
              slug: "heritage-congo-2026",
              name: "Héritage Congo 2026",
              status: "LIVE",
            },
            scope: { type: "EVENT" },
            entries: eventEntries,
            currentPlayer: {
              position: 12,
              publicCode: "HC-084200",
              nickname: "Makaya",
              points: 610,
            },
            participantCount: 24,
          },
    });
  });

  await page.goto("/leaderboard/heritage-congo-2026");

  await expect(page.getByRole("heading", { name: "Classement" })).toBeVisible();
  await expect(page.getByText("24 participants classés")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  await expect(page.getByLabel("Votre position")).toContainText("12");
  await expect(page.getByLabel("Votre position")).toContainText("610 pts");

  await page.getByRole("button", { name: "Session" }).click();
  await expect(page.getByText("Grand Quiz de l’Indépendance")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("listitem").nth(0)).toContainText("01");
  await expect(page.getByRole("listitem").nth(1)).toContainText("01");
});

test("la connexion régie masque le mot de passe et présente une erreur explicite", async ({
  page,
}) => {
  await page.route("**/api/admin/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Identifiants incorrects.",
        },
      }),
    });
  });

  await page.goto("/admin/login");

  await expect(page.getByRole("heading", { name: "Entrer en régie" })).toBeVisible();
  await expect(page.getByText("Accès réservé")).toBeVisible();
  await page.getByLabel("Adresse email").fill("regie@meste.example");
  const password = page.getByLabel("Mot de passe");
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("mot-de-passe-invalide");
  await page.getByRole("button", { name: "Ouvrir la régie" }).click();
  await expect(page.getByText("Identifiants incorrects.", { exact: true })).toBeVisible();
});

test("le parcours mobile complet va de l’inscription au classement", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });

  const sessionId = "00000000-0000-4000-8000-000000000011";
  const questionId = "00000000-0000-4000-8000-000000000012";
  const optionId = "00000000-0000-4000-8000-000000000013";
  const otherOptionId = "00000000-0000-4000-8000-000000000014";
  const opensAt = new Date(Date.now() - 2_000).toISOString();
  const closesAt = new Date(Date.now() + 60_000).toISOString();
  let registered = false;
  let answered = false;
  let questionStatus: "OPEN" | "REVEALED" = "OPEN";

  const currentPlayer = () => ({
    player: {
      publicCode: "HC-360001",
      nickname: "Makaya",
      currentStreak: questionStatus === "REVEALED" ? 1 : 0,
      totalPoints: questionStatus === "REVEALED" ? 150 : 0,
    },
    event: {
      slug: "heritage-congo-2026",
      name: "Héritage Congo 2026",
      timezone: "Africa/Accra",
      status: "LIVE",
    },
  });

  await page.route("**/api/me", async (route) => {
    if (!registered) {
      await route.fulfill({
        status: 401,
        json: { error: { code: "UNAUTHENTICATED" } },
      });
      return;
    }
    await route.fulfill({ json: currentPlayer() });
  });
  await page.route("**/api/register", async (route) => {
    registered = true;
    await route.fulfill({ status: 201, json: currentPlayer() });
  });
  await page.route("**/api/events/heritage-congo-2026/state", async (route) => {
    await route.fulfill({
      json: {
        event: {
          slug: "heritage-congo-2026",
          name: "Héritage Congo 2026",
          status: "LIVE",
        },
        session: {
          id: sessionId,
          name: "Grand Quiz de l’Indépendance",
          mode: "LIVE",
          status: "LIVE",
          startsAt: opensAt,
          endsAt: null,
          currentQuestion: {
            id: questionId,
            status: questionStatus,
            opensAt,
            closesAt,
            revealedAt:
              questionStatus === "REVEALED" ? new Date().toISOString() : null,
            canceledAt: null,
          },
        },
      },
    });
  });
  await page.route("**/api/sessions/*/current-question", async (route) => {
    await route.fulfill({
      json: {
        session: {
          id: sessionId,
          name: "Grand Quiz de l’Indépendance",
          slug: "grand-quiz",
          mode: "LIVE",
          status: "LIVE",
          startsAt: opensAt,
          endsAt: null,
        },
        currentQuestion: {
          id: questionId,
          position: 1,
          totalQuestions: 1,
          durationSeconds: 62,
          status: questionStatus,
          opensAt,
          closesAt,
          revealedAt:
            questionStatus === "REVEALED" ? new Date().toISOString() : null,
          canceledAt: null,
          acceptingAnswers: questionStatus === "OPEN",
          category: { name: "Histoire", slug: "histoire" },
          questionText: "En quelle année le Congo a-t-il obtenu son indépendance ?",
          difficulty: 2,
          mediaType: "TEXT",
          mediaUrl: null,
          options: [
            { id: optionId, label: "A", text: "1960" },
            { id: otherOptionId, label: "B", text: "1975" },
          ],
          ...(questionStatus === "REVEALED"
            ? {
                reveal: {
                  correctOptionId: optionId,
                  explanation:
                    "La République du Congo a proclamé son indépendance le 15 août 1960.",
                },
              }
            : {}),
        },
      },
    });
  });
  await page.route("**/api/session-questions/*/answer", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ optionId });
    answered = true;
    await route.fulfill({
      status: 201,
      json: { answer: { id: "answer", responseTimeMs: 4_000 } },
    });
  });
  await page.route("**/api/session-questions/*/result", async (route) => {
    await route.fulfill({
      json:
        questionStatus === "OPEN"
          ? { status: "OPEN", answerSubmitted: answered }
          : {
              status: "REVEALED",
              answerSubmitted: true,
              selectedOptionId: optionId,
              correctOptionId: optionId,
              isCorrect: true,
              explanation:
                "La République du Congo a proclamé son indépendance le 15 août 1960.",
              score: {
                answerPoints: 100,
                difficultyBonus: 20,
                speedBonus: 30,
                streakBonus: 0,
              },
              totalPoints: 150,
            },
    });
  });
  await page.route("**/api/leaderboard?**", async (route) => {
    await route.fulfill({
      json: {
        event: {
          slug: "heritage-congo-2026",
          name: "Héritage Congo 2026",
          status: "LIVE",
        },
        scope: {
          type: "SESSION",
          id: sessionId,
          name: "Grand Quiz de l’Indépendance",
          status: "LIVE",
        },
        entries: [
          {
            position: 1,
            publicCode: "HC-360001",
            nickname: "Makaya",
            points: 150,
          },
        ],
        currentPlayer: {
          position: 1,
          publicCode: "HC-360001",
          nickname: "Makaya",
          points: 150,
        },
        participantCount: 1,
      },
    });
  });

  await page.goto("/play/heritage-congo-2026");
  await page.getByLabel("Votre nom de joueur").fill("Makaya");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: /En quelle année/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "A 1960" }).click();
  await expect(page.getByText("Réponse enregistrée ✓")).toBeVisible();
  await expect(page.getByText("La République du Congo a proclamé")).not.toBeVisible();

  questionStatus = "REVEALED";
  await expect(page.getByText("+150 pts")).toBeVisible({ timeout: 7_500 });
  await expect(page.getByLabel("Votre progression")).toContainText("150 pts");
  await page.getByRole("link", { name: /Classement en direct/ }).click();

  await expect(page.getByRole("heading", { name: "Classement" })).toBeVisible();
  const currentRank = page.getByRole("listitem").filter({ hasText: "Vous" });
  await expect(currentRank).toContainText("01");
  await expect(currentRank).toContainText("150");
});
