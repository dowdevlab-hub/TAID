import {
  apiError,
  databaseErrorResponse,
  jsonNoStore,
} from "@/db/api";
import { ensureSchema } from "@/db/d1";

type RecordOverviewRow = {
  total_records: number;
  pending_records: number;
  approved_records: number;
  rejected_records: number;
  ai_records: number;
  rules_records: number;
  average_confidence: number | null;
};

type CheckInOverviewRow = {
  completed_check_ins: number;
};

export async function GET(request: Request) {
  const periodKey = new URL(request.url).searchParams.get("periodKey")?.trim() || null;
  if (periodKey && periodKey.length > 120) {
    return apiError(400, "INVALID_REQUEST", "periodKey가 너무 깁니다.");
  }

  try {
    const database = await ensureSchema();
    const [recordOverview, checkInOverview] = await Promise.all([
      database
        .prepare(
          `SELECT
             COUNT(*) AS total_records,
             COALESCE(SUM(CASE WHEN status = '검토 대기' THEN 1 ELSE 0 END), 0) AS pending_records,
             COALESCE(SUM(CASE WHEN status = '승인' THEN 1 ELSE 0 END), 0) AS approved_records,
             COALESCE(SUM(CASE WHEN status = '반려' THEN 1 ELSE 0 END), 0) AS rejected_records,
             COALESCE(SUM(CASE WHEN structure_mode = 'ai' THEN 1 ELSE 0 END), 0) AS ai_records,
             COALESCE(SUM(CASE WHEN structure_mode = 'rules' THEN 1 ELSE 0 END), 0) AS rules_records,
             ROUND(AVG(CASE WHEN structure_mode = 'ai' THEN confidence END), 1) AS average_confidence
           FROM records
           WHERE exclude_from_metrics = 0`,
        )
        .first<RecordOverviewRow>(),
      database
        .prepare(
          `SELECT COUNT(*) AS completed_check_ins
           FROM check_ins
           WHERE (? IS NULL OR period_key = ?)`,
        )
        .bind(periodKey, periodKey)
        .first<CheckInOverviewRow>(),
    ]);

    const overview = {
      totalRecords: Number(recordOverview?.total_records ?? 0),
      pendingRecords: Number(recordOverview?.pending_records ?? 0),
      approvedRecords: Number(recordOverview?.approved_records ?? 0),
      rejectedRecords: Number(recordOverview?.rejected_records ?? 0),
      aiRecords: Number(recordOverview?.ai_records ?? 0),
      rulesRecords: Number(recordOverview?.rules_records ?? 0),
      averageConfidence:
        recordOverview?.average_confidence === null ||
        recordOverview?.average_confidence === undefined
          ? null
          : Number(recordOverview.average_confidence),
      completedCheckIns: Number(checkInOverview?.completed_check_ins ?? 0),
      samplesExcluded: true,
    };
    return jsonNoStore({ ok: true, overview, data: overview });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

