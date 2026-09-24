/**
 * T364 — Escola module dev seed
 *
 * Creates a realistic but small dataset for local development and manual testing:
 *   - 1 school (Academia Ryvano)
 *   - 2 school admins (owner + admin)
 *   - 3 coaches with active memberships
 *   - 5 active athletes
 *   - 2 athletes in the lobby (pending approval)
 *   - 2 invitation links (one athlete, one coach)
 *   - 3 workout templates + 6 workout assignments (2 per coach)
 *   - Fake activities + executions with compliance records for 2 athletes
 *
 * Run: npx tsx prisma/seed.ts
 *     (or `pnpm db:seed` after adding the script to package.json)
 *
 * Idempotent: wraps each top-level entity in upsert so it is safe to re-run.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}
function rawToken() {
  return randomBytes(32).toString("hex");
}
function ts(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function upsertUser(id: string, email: string, name: string) {
  return prisma.user.upsert({
    where: { id },
    create: { id, email, name, emailVerified: new Date() },
    update: { name },
  });
}

// ---------------------------------------------------------------------------
// IDs (fixed so seed is idempotent)
// ---------------------------------------------------------------------------

const IDS = {
  school: "seed-school-academia-ryvano",
  owner:  "seed-user-owner",
  admin:  "seed-user-admin",
  coaches: ["seed-user-coach-1", "seed-user-coach-2", "seed-user-coach-3"],
  coachProfiles: ["seed-coach-profile-1", "seed-coach-profile-2", "seed-coach-profile-3"],
  athletes: ["seed-user-athlete-1", "seed-user-athlete-2", "seed-user-athlete-3",
             "seed-user-athlete-4", "seed-user-athlete-5"],
  lobbyAthletes: ["seed-user-lobby-1", "seed-user-lobby-2"],
  // memberships
  ownerMbr:  "seed-mbr-owner",
  adminMbr:  "seed-mbr-admin",
  coachMbrs: ["seed-coach-mbr-1", "seed-coach-mbr-2", "seed-coach-mbr-3"],
  athleteMbrs: ["seed-athlete-mbr-1", "seed-athlete-mbr-2", "seed-athlete-mbr-3",
                "seed-athlete-mbr-4", "seed-athlete-mbr-5"],
  lobbyMbrs: ["seed-lobby-mbr-1", "seed-lobby-mbr-2"],
  // workouts
  templates: ["seed-tmpl-1", "seed-tmpl-2", "seed-tmpl-3"],
  workouts:  ["seed-wkt-1", "seed-wkt-2", "seed-wkt-3"],
  assignments: ["seed-assign-1", "seed-assign-2", "seed-assign-3",
                "seed-assign-4", "seed-assign-5", "seed-assign-6"],
  executions: ["seed-exec-1", "seed-exec-2"],
  // TM017 — marketplace: one free, published, multimodal product from an
  // independent coach (coachId owner, schoolId null — exercises the "coach
  // without a school" path, RF-105/marketplace.yaml invariant), one free
  // purchase + active license for athlete 2 (kept distinct from athlete 1,
  // which the compliance/execution seed above already uses).
  trainingProduct: "seed-tp-run-5k",
  trainingProductVersion: "seed-tpv-run-5k-v1",
  trainingPurchase: "seed-tpu-run-5k",
  trainingLicense: "seed-tl-run-5k",
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 Seeding Escola module dev data…");

  // --- Users ---
  await upsertUser(IDS.owner, "owner@ryvano.dev", "Owner Seed");
  await upsertUser(IDS.admin, "admin@ryvano.dev", "Admin Seed");
  for (let i = 0; i < 3; i++) {
    await upsertUser(IDS.coaches[i], `coach${i + 1}@ryvano.dev`, `Coach ${i + 1} Seed`);
  }
  for (let i = 0; i < 5; i++) {
    await upsertUser(IDS.athletes[i], `athlete${i + 1}@ryvano.dev`, `Athlete ${i + 1} Seed`);
  }
  for (let i = 0; i < 2; i++) {
    await upsertUser(IDS.lobbyAthletes[i], `lobby${i + 1}@ryvano.dev`, `Lobby ${i + 1} Seed`);
  }
  console.log("  ✓ users");

  // --- School ---
  await prisma.school.upsert({
    where: { id: IDS.school },
    create: {
      id: IDS.school,
      name: "Academia Ryvano (Dev)",
      ownerUserId: IDS.owner,
      status: "ACTIVE",
      slug: "academia-ryvano-dev",
    },
    update: { name: "Academia Ryvano (Dev)" },
  });
  console.log("  ✓ school");

  // --- School memberships (owner + admin) ---
  await prisma.schoolMembership.upsert({
    where: { id: IDS.ownerMbr },
    create: {
      id: IDS.ownerMbr, schoolId: IDS.school, userId: IDS.owner,
      status: "ACTIVE", startedAt: ts(-90), endedAt: null,
    },
    update: {},
  });
  await prisma.schoolMembershipRole.upsert({
    where: { membershipId_role: { membershipId: IDS.ownerMbr, role: "OWNER" } },
    create: { membershipId: IDS.ownerMbr, role: "OWNER" },
    update: {},
  });

  await prisma.schoolMembership.upsert({
    where: { id: IDS.adminMbr },
    create: {
      id: IDS.adminMbr, schoolId: IDS.school, userId: IDS.admin,
      status: "ACTIVE", startedAt: ts(-60), endedAt: null,
    },
    update: {},
  });
  await prisma.schoolMembershipRole.upsert({
    where: { membershipId_role: { membershipId: IDS.adminMbr, role: "ADMIN" } },
    create: { membershipId: IDS.adminMbr, role: "ADMIN" },
    update: {},
  });
  console.log("  ✓ school memberships (owner + admin)");

  // --- Coach profiles + school memberships ---
  for (let i = 0; i < 3; i++) {
    await prisma.coachProfile.upsert({
      where: { id: IDS.coachProfiles[i] },
      create: {
        id: IDS.coachProfiles[i], userId: IDS.coaches[i],
        status: "ACTIVE", displayName: `Coach ${i + 1} Seed`,
      },
      update: {},
    });
    await prisma.coachSchoolMembership.upsert({
      where: { id: IDS.coachMbrs[i] },
      create: {
        id: IDS.coachMbrs[i], schoolId: IDS.school, coachId: IDS.coachProfiles[i],
        status: "ACTIVE", startedAt: ts(-60), endedAt: null,
        decidedAt: ts(-60),
      },
      update: {},
    });
  }
  console.log("  ✓ coach profiles + memberships");

  // --- Active athlete memberships ---
  for (let i = 0; i < 5; i++) {
    await prisma.schoolAthleteMembership.upsert({
      where: { id: IDS.athleteMbrs[i] },
      create: {
        id: IDS.athleteMbrs[i], schoolId: IDS.school, athleteId: IDS.athletes[i],
        status: "ACTIVE", startedAt: ts(-30), endedAt: null,
        approvedBy: IDS.owner, approvedAt: ts(-30), joinSource: "MANUAL_SEARCH",
      },
      update: {},
    });
  }
  console.log("  ✓ active athlete memberships");

  // --- Lobby athlete memberships (PENDING) ---
  for (let i = 0; i < 2; i++) {
    await prisma.schoolAthleteMembership.upsert({
      where: { id: IDS.lobbyMbrs[i] },
      create: {
        id: IDS.lobbyMbrs[i], schoolId: IDS.school, athleteId: IDS.lobbyAthletes[i],
        status: "PENDING", startedAt: null, endedAt: null,
        approvedAt: null, joinSource: "MANUAL_SEARCH",
      },
      update: {},
    });
  }
  console.log("  ✓ lobby athlete memberships (PENDING)");

  // --- Invitation links ---
  const athleteToken = rawToken();
  const coachToken = rawToken();
  await prisma.invitationLink.upsert({
    where: { id: "seed-invite-athlete" },
    create: {
      id: "seed-invite-athlete", type: "SCHOOL", schoolId: IDS.school,
      coachId: null, createdBy: IDS.owner, tokenHash: hashToken(athleteToken),
      requiresApproval: true, status: "ACTIVE", usedCount: 0,
      expiresAt: ts(30), maxUses: 20,
    },
    update: { expiresAt: ts(30) },
  });
  await prisma.invitationLink.upsert({
    where: { id: "seed-invite-coach" },
    create: {
      id: "seed-invite-coach", type: "SCHOOL_COACH", schoolId: IDS.school,
      // InvitationLink_scope_check (migration 0017) requires coachId set for
      // SCHOOL_COACH — this invite is tied to a specific coach within the
      // school, unlike a plain SCHOOL invite. Was `null` here, violating the
      // constraint — pre-existing bug, unrelated to this session's work.
      coachId: IDS.coachProfiles[0], createdBy: IDS.owner, tokenHash: hashToken(coachToken),
      requiresApproval: true, status: "ACTIVE", usedCount: 0,
      expiresAt: ts(30), maxUses: 5,
    },
    update: { expiresAt: ts(30) },
  });
  console.log(`  ✓ invitation links`);
  console.log(`    athlete invite token: ${athleteToken}`);
  console.log(`    coach   invite token: ${coachToken}`);

  // --- Workout templates ---
  const sportTypes = ["RUN", "BIKE", "SWIM"];
  for (let i = 0; i < 3; i++) {
    await prisma.workoutTemplate.upsert({
      where: { id: IDS.templates[i] },
      create: {
        id: IDS.templates[i], title: `Template ${i + 1} (Dev)`,
        sportType: sportTypes[i], ownerType: "SCHOOL", ownerId: IDS.school,
        authorCoachId: IDS.coachProfiles[0], schoolId: IDS.school, status: "ACTIVE", version: 1,
      },
      update: {},
    });
  }

  // --- Workouts (snapshots) ---
  for (let i = 0; i < 3; i++) {
    const snapshotPayload: Prisma.InputJsonValue = {
      id: IDS.workouts[i], title: `Workout ${i + 1} (Dev)`, sportType: sportTypes[i],
      blocks: [{ id: `seed-block-${i + 1}`, position: 1, distanceM: 5000, durationS: 1800 }],
    };
    await prisma.workout.upsert({
      where: { id: IDS.workouts[i] },
      create: {
        id: IDS.workouts[i], title: `Workout ${i + 1} (Dev)`,
        sportType: sportTypes[i], originSchoolId: IDS.school,
        authorCoachId: IDS.coachProfiles[0], templateId: IDS.templates[i],
        templateVersion: 1, status: "ACTIVE", snapshotPayload,
        scheduledDate: ts(i - 1),
      },
      update: {},
    });
    // blocks
    await prisma.workoutBlock.upsert({
      where: { workoutId_position: { workoutId: IDS.workouts[i], position: 1 } },
      create: {
        id: `seed-block-${i + 1}`, workoutId: IDS.workouts[i], position: 1,
        blockType: "STEADY", distanceM: 5000, durationS: 1800,
      },
      update: {},
    });
  }
  console.log("  ✓ workout templates + snapshots");

  // --- Assignments (2 athletes × 3 workouts) ---
  const assignPairs = [
    [IDS.athletes[0], IDS.workouts[0], IDS.coachProfiles[0]],
    [IDS.athletes[0], IDS.workouts[1], IDS.coachProfiles[0]],
    [IDS.athletes[1], IDS.workouts[0], IDS.coachProfiles[1]],
    [IDS.athletes[1], IDS.workouts[2], IDS.coachProfiles[1]],
    [IDS.athletes[2], IDS.workouts[1], IDS.coachProfiles[2]],
    [IDS.athletes[2], IDS.workouts[2], IDS.coachProfiles[2]],
  ];
  for (let i = 0; i < assignPairs.length; i++) {
    const [athleteId, workoutId, coachId] = assignPairs[i];
    await prisma.workoutAssignment.upsert({
      where: { id: IDS.assignments[i] },
      create: {
        id: IDS.assignments[i], workoutId, athleteId, assignedBy: IDS.owner,
        schoolId: IDS.school, coachId, status: "SCHEDULED",
        scheduledAt: ts(i - 2),
      },
      update: {},
    });
  }
  console.log("  ✓ workout assignments");

  // --- Executions + compliance for first 2 assignments ---
  for (let i = 0; i < 2; i++) {
    await prisma.workoutExecution.upsert({
      where: { id: IDS.executions[i] },
      create: {
        id: IDS.executions[i], workoutAssignmentId: IDS.assignments[i],
        athleteId: IDS.athletes[0], source: "MANUAL", externalId: `seed-ext-${i + 1}`,
        sportType: "RUN", startedAt: ts(-i - 1), durationSeconds: 1750 + i * 100,
        movingSeconds: 1700 + i * 90, distanceMeters: 4900 + i * 200,
        averageHeartRate: 155, maxHeartRate: 175,
        matchScore: 82, matchStatus: "AUTO_MATCHED",
        activityPayload: {} as Prisma.InputJsonValue,
      },
      update: {},
    });
    await prisma.workoutCompliance.upsert({
      where: { workoutExecutionId: IDS.executions[i] },
      create: {
        id: `seed-comp-${i + 1}`, workoutExecutionId: IDS.executions[i],
        workoutAssignmentId: IDS.assignments[i], athleteId: IDS.athletes[0],
        overallScore: 80 + i * 5, breakdown: { distance: 85, duration: 78 } as Prisma.InputJsonValue,
        strategyKey: "run", algorithmVersion: 1,
        calculatedAt: ts(-i),
      },
      update: {},
    });
  }
  console.log("  ✓ executions + compliance records");

  // --- TM017: marketplace — free, published, multimodal product + active license ---
  await prisma.trainingProduct.upsert({
    where: { id: IDS.trainingProduct },
    create: {
      id: IDS.trainingProduct,
      schoolId: null,
      coachId: IDS.coachProfiles[0], // independent-coach product (RF-105: schoolId null is a legitimate path)
      title: "Corrida 5 km — iniciante — 2 semanas (Dev)",
      description: "Plano de exemplo do seed: 2 semanas, corrida + força no mesmo dia.",
      sportType: "run",
      durationWeeks: 2,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      priceCents: null, // free (Q7, TM003): null = free, never 0
      currency: null,
      slug: "corrida-5km-iniciante-dev-seed",
      objective: "Completar 5 km correndo sem parar.",
      difficulty: "beginner",
      sessionsPerWeek: 2,
      language: "pt-BR",
    },
    update: {},
  });
  const trainingProductVersionPayload = {
    weeks: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1,
            sessions: [
              { planSessionId: "seed-sess-w1d1-run", workoutTemplateId: IDS.templates[0], sportType: "run", order: 0 },
              { planSessionId: "seed-sess-w1d1-gym", workoutTemplateId: IDS.templates[1], sportType: "gym", order: 1 },
            ],
          },
          { dayOfWeek: 4, sessions: [{ planSessionId: "seed-sess-w1d4-run", workoutTemplateId: IDS.templates[0], sportType: "run", order: 0 }] },
        ],
      },
      {
        week: 2,
        days: [
          { dayOfWeek: 1, sessions: [{ planSessionId: "seed-sess-w2d1-run", workoutTemplateId: IDS.templates[0], sportType: "run", order: 0 }] },
          { dayOfWeek: 4, sessions: [{ planSessionId: "seed-sess-w2d4-run", workoutTemplateId: IDS.templates[0], sportType: "run", order: 0 }] },
        ],
      },
    ],
  } as Prisma.InputJsonValue;
  await prisma.trainingProductVersion.upsert({
    where: { id: IDS.trainingProductVersion },
    create: {
      id: IDS.trainingProductVersion,
      productId: IDS.trainingProduct,
      versionNumber: 1,
      schemaVersion: 2, // TM010: multimodal/multi-session format
      planPayload: trainingProductVersionPayload,
      publishedAt: ts(-5),
    },
    update: {},
  });
  await prisma.trainingProduct.update({
    where: { id: IDS.trainingProduct },
    data: { currentVersionId: IDS.trainingProductVersion },
  });
  await prisma.trainingPurchase.upsert({
    where: { id: IDS.trainingPurchase },
    create: {
      id: IDS.trainingPurchase,
      productId: IDS.trainingProduct,
      versionId: IDS.trainingProductVersion,
      athleteId: IDS.athletes[1],
      paymentRef: null,
      pricePaid: null,
      currency: null,
      status: "COMPLETED",
      purchasedAt: ts(-3),
    },
    update: {},
  });
  await prisma.trainingLicense.upsert({
    where: { id: IDS.trainingLicense },
    create: {
      id: IDS.trainingLicense,
      productId: IDS.trainingProduct,
      versionId: IDS.trainingProductVersion,
      purchaseId: IDS.trainingPurchase,
      athleteId: IDS.athletes[1],
      status: "ACTIVE",
      startedAt: ts(-3),
      calendarInstantiated: false, // deliberately not instantiated — exercises the "não iniciado" UI state
    },
    update: {},
  });
  console.log("  ✓ marketplace: free multimodal product + purchase + license");

  console.log("\n✅ Seed complete — school: 'Academia Ryvano (Dev)'");
  console.log(`   Owner:  owner@ryvano.dev`);
  console.log(`   Admin:  admin@ryvano.dev`);
  console.log(`   Coaches: coach1@ryvano.dev, coach2@ryvano.dev, coach3@ryvano.dev`);
  console.log(`   Athletes: athlete1@ryvano.dev … athlete5@ryvano.dev`);
  console.log(`   Lobby:  lobby1@ryvano.dev, lobby2@ryvano.dev`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
