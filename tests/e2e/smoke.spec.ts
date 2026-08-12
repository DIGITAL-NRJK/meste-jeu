import { expect, test } from "@playwright/test";

test("la fondation mobile et le health check répondent", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Héritage Congo" }),
  ).toBeVisible();

  const health = await request.get("/api/health");

  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: "ok" });
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
