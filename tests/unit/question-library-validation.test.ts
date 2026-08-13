import { describe, expect, it } from "vitest";

import {
  categoryUpdateInputSchema,
  questionDraftInputSchema,
  questionListFiltersSchema,
} from "../../src/lib/validation/question-library";

const categoryId = "00000000-0000-4000-8000-000000000001";

function draftInput() {
  return {
    categoryId,
    questionText: "En quelle année le Congo a-t-il accédé à l’indépendance ?",
    explanation: "La République du Congo est indépendante depuis 1960.",
    difficulty: 1,
    options: [
      { text: "1958", isCorrect: false },
      { text: "1960", isCorrect: true },
    ],
    sources: [
      {
        publisher: "Présidence de la République du Congo",
        title: "Histoire de la République du Congo",
        url: "https://example.com/congo-independance",
        verifiedAt: "2026-08-12T10:00:00.000Z",
      },
    ],
  };
}

describe("questionDraftInputSchema", () => {
  it("normalise un brouillon texte valide", () => {
    const parsed = questionDraftInputSchema.parse(draftInput());

    expect(parsed.mediaType).toBe("TEXT");
    expect(parsed.mediaUrl).toBeNull();
    expect(parsed.sources[0]?.verifiedAt).toBeInstanceOf(Date);
  });

  it("autorise un brouillon incomplet avant sa mise en revue", () => {
    const parsed = questionDraftInputSchema.parse({
      ...draftInput(),
      options: [],
      sources: [],
    });

    expect(parsed.options).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it("refuse plusieurs bonnes réponses", () => {
    const result = questionDraftInputSchema.safeParse({
      ...draftInput(),
      options: [
        { text: "1958", isCorrect: true },
        { text: "1960", isCorrect: true },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("impose une URL aux questions image et l’interdit aux questions texte", () => {
    expect(
      questionDraftInputSchema.safeParse({
        ...draftInput(),
        mediaType: "IMAGE",
      }).success,
    ).toBe(false);

    expect(
      questionDraftInputSchema.safeParse({
        ...draftInput(),
        mediaType: "TEXT",
        mediaUrl: "https://example.com/image.jpg",
      }).success,
    ).toBe(false);
  });

  it("refuse une source ajoutée deux fois", () => {
    const source = draftInput().sources[0];
    const result = questionDraftInputSchema.safeParse({
      ...draftInput(),
      sources: [source, source],
    });

    expect(result.success).toBe(false);
  });
});

describe("questionListFiltersSchema", () => {
  it("borne la pagination interne de la bibliothèque", () => {
    expect(questionListFiltersSchema.parse({}).limit).toBe(50);
    expect(questionListFiltersSchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
  });

  it("accepte une limite issue des paramètres d’URL", () => {
    expect(questionListFiltersSchema.parse({ limit: "25" }).limit).toBe(25);
  });
});

describe("categoryUpdateInputSchema", () => {
  it("exige explicitement l’état actif de la catégorie", () => {
    expect(
      categoryUpdateInputSchema.parse({ name: "Histoire", active: false }),
    ).toMatchObject({ name: "Histoire", active: false });
    expect(
      categoryUpdateInputSchema.safeParse({ name: "Histoire" }).success,
    ).toBe(false);
  });
});
