import type { Activity, User, UserProfile } from "@prisma/client";

import {
  buildPostActivityReportTemplateFromActivity,
  renderPostActivityWhatsappText,
} from "@/lib/post-activity-report-template";

export function buildPostActivityReportTemplate(input: {
  activity: Pick<
    Activity,
    | "sportType"
    | "name"
    | "startedAt"
    | "durationSeconds"
    | "distanceMeters"
    | "calories"
    | "averageHeartRate"
    | "averagePace"
    | "averageSpeed"
    | "elevationGain"
    | "averageCadence"
    | "averagePower"
  >;
}) {
  return buildPostActivityReportTemplateFromActivity(input.activity);
}

export function buildPostActivityReport(input: {
  user: Pick<User, "name"> & { profile: Pick<UserProfile, "phoneE164"> | null };
  activity: Pick<
    Activity,
    | "sportType"
    | "name"
    | "startedAt"
    | "durationSeconds"
    | "distanceMeters"
    | "calories"
    | "averageHeartRate"
    | "averagePace"
    | "averageSpeed"
    | "elevationGain"
    | "averageCadence"
    | "averagePower"
  >;
}) {
  const report = buildPostActivityReportTemplate({ activity: input.activity });

  return renderPostActivityWhatsappText({
    athleteName: input.user.name,
    occurredAt: input.activity.startedAt,
    report,
  });
}
