import { readFileSync } from "node:fs";

import {
  ClassificationSource,
  GenerationOutcome,
  GoldStatus,
  LearningKind,
  LearningStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { formatToneBundle } from "./bundle";
import { buildUserPrompt } from "./generate";
import { retrieveLearnings } from "./retrieve";
import {
  generationOutcomeSchema,
  goldSchema,
  learningSchema,
  type Profile,
} from "./types";

const learning = {
  id: "tl-1",
  profileId: "woolgrown",
  rule: "Use contractions.",
  status: "active" as const,
  before: "",
  after: "",
  why: "",
  surface: "blog",
  kind: "voice" as const,
  classificationSource: "heuristic" as const,
  classificationMismatch: false,
  sourceDraftId: null,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};

describe("schema enums", () => {
  it("accepts the learning values already in use", () => {
    expect(learningSchema.parse(learning).status).toBe("active");
    expect(learningSchema.parse({ ...learning, status: "dismissed" }).status).toBe("dismissed");
    expect(learningSchema.parse({ ...learning, kind: "fact" }).kind).toBe("fact");
    expect(learningSchema.parse({ ...learning, kind: "unknown" }).kind).toBe("unknown");
    expect(
      learningSchema.parse({ ...learning, classificationSource: "same_call" }).classificationSource,
    ).toBe("same_call");
    expect(
      learningSchema.parse({ ...learning, classificationSource: "separate_call" })
        .classificationSource,
    ).toBe("separate_call");
    expect(
      learningSchema.parse({ ...learning, classificationSource: "fallback" }).classificationSource,
    ).toBe("fallback");
  });

  it("rejects an invalid learning status", () => {
    expect(learningSchema.safeParse({ ...learning, status: "archived" }).success).toBe(false);
  });

  it("rejects an invalid learning kind", () => {
    expect(learningSchema.safeParse({ ...learning, kind: "accuracy" }).success).toBe(false);
  });

  it("rejects an invalid classification source", () => {
    expect(
      learningSchema.safeParse({ ...learning, classificationSource: "guess" }).success,
    ).toBe(false);
  });

  it("accepts generation outcomes already in use and rejects anything else", () => {
    for (const outcome of ["pending", "kept", "edited", "rejected"] as const) {
      expect(generationOutcomeSchema.parse(outcome)).toBe(outcome);
    }
    expect(generationOutcomeSchema.safeParse("archived").success).toBe(false);
  });

  it("accepts gold statuses already in use and rejects anything else", () => {
    const gold = {
      id: "g1",
      profileId: "woolgrown",
      title: "How to",
      body: "Lead with the answer.",
      source: "taught",
      surface: "blog",
      canonical: true,
      status: "active" as const,
      createdAt: "2026-10-05T00:00:00.000Z",
    };
    expect(goldSchema.parse(gold).status).toBe("active");
    expect(goldSchema.parse({ ...gold, status: "dismissed" }).status).toBe("dismissed");
    expect(goldSchema.safeParse({ ...gold, status: "archived" }).success).toBe(false);
  });

  it("keeps an active learning in retrieval and the draft prompt", () => {
    const picked = retrieveLearnings([learning], {
      profileId: "woolgrown",
      surface: "blog",
      query: "",
    });
    expect(picked.map((item) => item.rule)).toEqual(["Use contractions."]);

    const profile: Profile = {
      id: "woolgrown",
      name: "WoolGrown",
      description: "Maker",
      guide: "# WoolGrown\n\n## Who we sound like\n\nA practical Ontario maker.\n\n## Voice rules\n\n### Do / Don't (standing)\n\nLead with the answer.\n\n## Gold examples\n",
      systemPrompt: "Write like WoolGrown.",
      bannedForPrompt: ["delve"],
      surfaces: [{ id: "blog", label: "Blog", maxWords: null, hint: "A post." }],
      updatedAt: "2026-10-05T00:00:00.000Z",
    };
    const input = {
      profile,
      surfaceId: "blog",
      facts: "Wool pellets hold water in raised beds.",
      seed: "pellets",
      golds: [],
      learnings: [learning],
    };
    const before = buildUserPrompt(input);
    const after = buildUserPrompt(input);
    expect(after).toBe(before);
    expect(formatToneBundle({
      guide: profile.guide,
      bannedForPrompt: profile.bannedForPrompt,
      surface: profile.surfaces[0],
      surfaceId: "blog",
      seed: "pellets",
      facts: input.facts,
      profileId: "woolgrown",
      golds: [],
      learnings: [learning],
    })).toContain("Use contractions.");
    expect(after).toContain("Use contractions.");
  });
});

const enumMigration = readFileSync(
  new URL("../prisma/migrations/20261005141800_add_schema_enums/migration.sql", import.meta.url),
  "utf8",
);

describe("enum migration", () => {
  it("creates only the enums the app already uses", () => {
    expect(enumMigration).toContain(`CREATE TYPE "GoldStatus" AS ENUM ('active', 'dismissed');`);
    expect(enumMigration).toContain(
      `CREATE TYPE "LearningStatus" AS ENUM ('active', 'dismissed');`,
    );
    expect(enumMigration).toContain(
      `CREATE TYPE "LearningKind" AS ENUM ('voice', 'fact', 'unknown');`,
    );
    expect(enumMigration).toContain(
      `CREATE TYPE "ClassificationSource" AS ENUM ('same_call', 'separate_call', 'heuristic', 'fallback');`,
    );
    expect(enumMigration).toContain(
      `CREATE TYPE "GenerationOutcome" AS ENUM ('pending', 'kept', 'edited', 'rejected');`,
    );
  });

  it("casts existing text in place and keeps the current defaults", () => {
    expect(enumMigration).not.toMatch(/DROP COLUMN/i);
    expect(enumMigration).toContain(
      `ALTER TABLE "Gold" ALTER COLUMN "status" TYPE "GoldStatus" USING ("status"::"GoldStatus");`,
    );
    expect(enumMigration).toContain(`ALTER TABLE "Gold" ALTER COLUMN "status" SET DEFAULT 'active';`);
    expect(enumMigration).toContain(
      `ALTER TABLE "Learning" ALTER COLUMN "status" TYPE "LearningStatus" USING ("status"::"LearningStatus");`,
    );
    expect(enumMigration).toContain(
      `ALTER TABLE "Learning" ALTER COLUMN "status" SET DEFAULT 'active';`,
    );
    expect(enumMigration).toContain(
      `ALTER TABLE "Learning" ALTER COLUMN "kind" TYPE "LearningKind" USING ("kind"::"LearningKind");`,
    );
    expect(enumMigration).toContain(
      `ALTER TABLE "Learning" ALTER COLUMN "kind" SET DEFAULT 'unknown';`,
    );
    expect(enumMigration).toContain(
      `ALTER TABLE "Learning" ALTER COLUMN "classificationSource" TYPE "ClassificationSource" USING ("classificationSource"::"ClassificationSource");`,
    );
    expect(enumMigration).toContain(
      `ALTER TABLE "Learning" ALTER COLUMN "classificationSource" SET DEFAULT 'fallback';`,
    );
    expect(enumMigration).toContain(
      `ALTER TABLE "GenerationLog" ALTER COLUMN "outcome" TYPE "GenerationOutcome" USING ("outcome"::"GenerationOutcome");`,
    );
    expect(enumMigration).toContain(
      `ALTER TABLE "GenerationLog" ALTER COLUMN "outcome" SET DEFAULT 'pending';`,
    );
  });

  it("matches the Prisma client enums to those same values", () => {
    expect(Object.values(GoldStatus).sort()).toEqual(["active", "dismissed"]);
    expect(Object.values(LearningStatus).sort()).toEqual(["active", "dismissed"]);
    expect(Object.values(LearningKind).sort()).toEqual(["fact", "unknown", "voice"]);
    expect(Object.values(ClassificationSource).sort()).toEqual([
      "fallback",
      "heuristic",
      "same_call",
      "separate_call",
    ]);
    expect(Object.values(GenerationOutcome).sort()).toEqual([
      "edited",
      "kept",
      "pending",
      "rejected",
    ]);
  });
});
