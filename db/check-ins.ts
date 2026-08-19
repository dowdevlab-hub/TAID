export type CheckInRow = {
  id: number;
  participant_key: string;
  work_order: string;
  period_key: string;
  product: string;
  process: string;
  equipment: string;
  duration_seconds: number;
  created_at: string;
  updated_at: string;
};

export function toCheckIn(row: CheckInRow) {
  return {
    id: row.id,
    participantKey: row.participant_key,
    participantCode: row.participant_key,
    workOrder: row.work_order,
    periodKey: row.period_key,
    product: row.product,
    process: row.process,
    equipment: row.equipment,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
