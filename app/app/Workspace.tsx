"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type View = "dashboard" | "capture" | "review" | "knowledge";
type CardStatus = "승인" | "검토 대기" | "반려";
type LiveStructureMode = "ai" | "rules";
type StructureMode = LiveStructureMode | "sample";
type ContextEntryMode = "preset" | "manual";

const REVIEW_FIELDS = [
  "kind",
  "process",
  "equipment",
  "quantity",
  "defect",
  "symptom",
  "cause",
  "action",
  "result",
] as const;

type ReviewField = (typeof REVIEW_FIELDS)[number];

const REVIEW_FIELD_LABELS: Record<ReviewField, string> = {
  kind: "기록 유형",
  process: "공정",
  equipment: "설비·라인",
  quantity: "작업 수량",
  defect: "불량 수량",
  symptom: "증상",
  cause: "원인 가설",
  action: "조치",
  result: "결과",
};

type KnowledgeCard = {
  id: number;
  title: string;
  kind: "문제" | "개선" | "노하우";
  workOrder: string;
  product: string;
  process: string;
  equipment: string;
  quantity: string;
  defect: string;
  symptom: string;
  cause: string;
  action: string;
  result: string;
  sourceAnswers: string[];
  participantCode: string;
  author: string;
  createdAt: string;
  status: CardStatus;
  confidence: number;
  structureMode: StructureMode;
  views: number;
};

type NoIssueCheckIn = {
  id: number;
  periodKey: string;
  participantCode: string;
  workOrder: string;
  product: string;
  process: string;
  equipment: string;
  durationSeconds: number;
  createdAt: string;
  mode: "live" | "sample";
};

type CompletionMode = "knowledge" | "no-issues" | null;

type LiveOverview = {
  totalRecords: number;
  pendingRecords: number;
  approvedRecords: number;
  rejectedRecords: number;
  aiRecords: number;
  rulesRecords: number;
  completedCheckIns: number;
};

type DraftRecord = {
  kind: KnowledgeCard["kind"];
  workOrder: string;
  product: string;
  process: string;
  equipment: string;
  quantity: string;
  defect: string;
  symptom: string;
  cause: string;
  action: string;
  result: string;
};

type DraftField = keyof DraftRecord;

const DRAFT_FIELD_LABELS: Record<DraftField, string> = {
  kind: "기록 유형",
  workOrder: "작업지시",
  product: "품목",
  process: "공정",
  equipment: "설비·라인",
  quantity: "작업 수량",
  defect: "불량 수량",
  symptom: "증상",
  cause: "원인 가설",
  action: "조치",
  result: "결과",
};

const REQUIRED_DRAFT_FIELDS: Record<KnowledgeCard["kind"], readonly DraftField[]> = {
  문제: ["workOrder", "product", "process", "equipment", "symptom"],
  개선: ["workOrder", "product", "process", "equipment"],
  노하우: ["workOrder", "product", "process", "equipment", "action"],
};

const CONTEXT_OPTIONS = [
  { workOrder: "WO-260818-042", product: "A모델 밸브 Assy", process: "A모델 최종 조립", equipment: "조립 2라인 · AS-02" },
  { workOrder: "WO-260818-037", product: "B모델 밸브 Assy", process: "B모델 조립", equipment: "조립 1라인 · AS-01" },
  { workOrder: "WO-260818-031", product: "Ø28 샤프트", process: "정밀 가공", equipment: "가공 1라인 · CNC-03" },
  { workOrder: "WO-260818-026", product: "C모델 출하 세트", process: "출하 포장", equipment: "포장 1라인 · PR-01" },
] as const;

const DEMO_CONTEXT = CONTEXT_OPTIONS[0];

const MAX_TRANSCRIPT_CHARACTERS = 6_000;
const DEMO_PARTICIPANT_CODE = "PILOT-01";

const REFLECTION_QUESTIONS = [
  "오늘 가장 어려웠던 점",
  "오늘 새롭게 알게 된 점",
  "다음 사람에게 주고 싶은 한마디",
] as const;

const demoReflectionAnswers = [
  "A모델 조립 50개를 완료했고 3개에서 누설 불량이 났습니다.",
  "확인해 보니 실링 고무가 홈 안쪽으로 밀려 있었습니다.",
  "실링 고무를 홈에 맞춰 다시 끼우고 둘레를 눌러 확인하니 재작업 3개 모두 재검사를 통과했습니다. 다음 작업자도 실링 위치를 먼저 확인해주세요.",
];

const demoReflectionTranscript = demoReflectionAnswers.join(" ");

interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
  length: number;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

type StructureSuccessResponse = {
  ok: true;
  mode: "ai" | "rules" | "live";
  data: {
    kind: KnowledgeCard["kind"];
    process: string;
    equipment: string;
    quantity: string;
    defect: string;
    symptom: string;
    cause: string;
    action: string;
    result: string;
    confidence: number;
    needsReview: ReviewField[];
  };
};

type StructureErrorResponse = {
  ok?: false;
  code?: string;
  error?: string | {
    code?: string;
    message?: string;
    details?: string[];
  };
};

type StructureMeta = {
  mode: StructureMode;
  confidence: number;
  needsReview: ReviewField[];
};

const initialCards: KnowledgeCard[] = [
  {
    id: -1042,
    title: "A모델 누설 불량 — 실링 고무 위치 점검",
    kind: "문제",
    workOrder: "WO-260818-042",
    product: "A모델 밸브 Assy",
    process: "A모델 최종 조립",
    equipment: "조립 2라인 · AS-02",
    quantity: "50개",
    defect: "누설 불량 3개",
    symptom: "50개 중 3개 누설 검사 불합격",
    cause: "실링 고무가 홈 안쪽으로 약 2mm 밀림",
    action: "실링 삽입 후 손가락으로 둘레 1회 확인, 지그 기준선 추가",
    result: "재작업 3개 정상, 이후 120개 동일 불량 없음",
    sourceAnswers: [
      "오늘 A모델 밸브 Assy 50개 중 3개가 누설 검사에서 불합격했습니다. 확인해 보니 실링 고무가 홈 안쪽으로 약 2mm 밀려 있었습니다. 실링을 홈에 맞춰 다시 끼운 뒤 손가락으로 둘레를 한 번 확인하고 지그 기준선도 추가했습니다. 재작업 3개는 모두 정상 판정을 받았고 이후 생산한 120개에서는 같은 불량이 없었습니다. 다음 작업자도 실링 위치와 기준선을 먼저 확인해주세요.",
    ],
    participantCode: "SAMPLE-01",
    author: "김민수",
    createdAt: "오늘 14:32",
    status: "검토 대기",
    confidence: 91,
    structureMode: "sample",
    views: 0,
  },
  {
    id: -1038,
    title: "CNC-03 진동 증가 시 척 체결 순서",
    kind: "노하우",
    workOrder: "WO-260818-031",
    product: "Ø28 샤프트",
    process: "정밀 가공",
    equipment: "가공 1라인 · CNC-03",
    quantity: "",
    defect: "",
    symptom: "Ø28 가공 중 진동음과 표면 거칠기 증가",
    cause: "척 2번 조가 먼저 밀착되어 소재 편심 발생",
    action: "1→3→2 순서로 1차 체결 후 토크렌치로 균등 체결",
    result: "진동 해소, 표면조도 Ra 1.4 복귀",
    sourceAnswers: [
      "Ø28 샤프트 가공 중 진동음이 커지고 표면이 거칠어졌습니다. 확인해 보니 척 2번 조가 먼저 밀착되어 소재 편심이 생겼습니다. 1, 3, 2 순서로 1차 체결한 뒤 토크렌치로 균등하게 조이자 진동이 사라지고 표면조도도 Ra 1.4로 돌아왔습니다. 다음 작업자도 이 체결 순서를 지켜주세요.",
    ],
    participantCode: "SAMPLE-02",
    author: "박성호",
    createdAt: "어제 17:18",
    status: "승인",
    confidence: 96,
    structureMode: "sample",
    views: 18,
  },
  {
    id: -1031,
    title: "포장 라벨 재출력 동선 4분 단축",
    kind: "개선",
    workOrder: "WO-260818-026",
    product: "C모델 출하 세트",
    process: "출하 포장",
    equipment: "포장 1라인 · PR-01",
    quantity: "",
    defect: "",
    symptom: "라벨 오류 발생 시 사무실 PC까지 이동",
    cause: "현장 프린터에 승인된 재출력 메뉴가 없음",
    action: "불량 라벨 QR 스캔 후 현장 태블릿에서 1회 재출력",
    result: "건당 처리 6분→2분, 2주간 오출력 없음",
    sourceAnswers: [
      "라벨 오류가 날 때마다 사무실 PC까지 이동해야 했고 현장 프린터에는 승인된 재출력 메뉴가 없었습니다. 불량 라벨 QR을 스캔한 뒤 현장 태블릿에서 한 번만 재출력하도록 바꾸자 건당 처리 시간이 6분에서 2분으로 줄었고 2주 동안 오출력이 없었습니다.",
    ],
    participantCode: "SAMPLE-03",
    author: "이수진",
    createdAt: "8월 15일",
    status: "승인",
    confidence: 94,
    structureMode: "sample",
    views: 11,
  },
  {
    id: -1026,
    title: "B모델 토크 편차 원인 후보 정리",
    kind: "문제",
    workOrder: "WO-260818-037",
    product: "B모델 밸브 Assy",
    process: "B모델 조립",
    equipment: "조립 1라인 · AS-01",
    quantity: "30개",
    defect: "",
    symptom: "체결 토크 8.5~11.2 N·m 편차",
    cause: "렌치 교정 주기 경과 가능성",
    action: "예비 렌치 교체 후 30개 비교 측정 필요",
    result: "확인 진행 중",
    sourceAnswers: [
      "B모델 체결 토크가 8.5에서 11.2 N·m 사이로 흔들렸습니다. 렌치 교정 주기가 지난 것이 원인일 수 있지만 아직 확인 중입니다. 다음 작업자는 예비 렌치로 바꿔 30개를 비교 측정하고 결과를 남겨주세요.",
    ],
    participantCode: "SAMPLE-04",
    author: "최은영",
    createdAt: "8월 14일",
    status: "검토 대기",
    confidence: 78,
    structureMode: "sample",
    views: 2,
  },
];

const navItems: { key: View; label: string; icon: string }[] = [
  { key: "dashboard", label: "오늘의 현장", icon: "⌂" },
  { key: "capture", label: "새 기록", icon: "+" },
  { key: "review", label: "승인함", icon: "✓" },
  { key: "knowledge", label: "지식 검색", icon: "⌕" },
];

const captureSteps = ["현장 선택", "말로 기록", "내용 확인", "저장 완료"];
const STORAGE_KEY = "taid-mvp-cards-v2";
const NO_ISSUE_STORAGE_KEY = "taid-mvp-no-issue-checkins-v1";

function persistCards(cards: KnowledgeCard[]) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      cards: cards.filter((card) => card.id < 0),
    }),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isIsoDateString(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function parseServerRecord(value: unknown): KnowledgeCard | null {
  if (!isObject(value)) return null;
  const id = Number(value.id);
  const confidence = Number(value.confidence);
  const status = value.status;
  const kind = value.kind;
  const rawMode = value.structureMode ?? value.mode;
  const mode = rawMode === "live" ? "ai" : rawMode;
  const participantCode = isNonEmptyString(value.participantCode)
    ? value.participantCode.trim()
    : isNonEmptyString(value.workerCode)
      ? value.workerCode.trim()
      : "";
  const transcript = value.transcript;
  const requiredStrings = [
    value.title,
    value.workOrder,
    value.product,
    value.process,
    value.equipment,
    value.quantity,
    value.defect,
    value.symptom,
    value.cause,
    value.action,
    value.result,
  ];

  if (
    !Number.isSafeInteger(id) || id <= 0 ||
    !["문제", "개선", "노하우"].includes(String(kind)) ||
    !["승인", "검토 대기", "반려"].includes(String(status)) ||
    !["ai", "rules", "sample"].includes(String(mode)) ||
    !participantCode ||
    !requiredStrings.every(isString) ||
    !isString(transcript) ||
    !Number.isFinite(confidence) || confidence < 0 || confidence > 100 ||
    !isIsoDateString(value.createdAt)
  ) {
    return null;
  }

  return {
    id,
    title: String(value.title),
    kind: kind as KnowledgeCard["kind"],
    workOrder: String(value.workOrder),
    product: String(value.product),
    process: String(value.process),
    equipment: String(value.equipment),
    quantity: String(value.quantity),
    defect: String(value.defect),
    symptom: String(value.symptom),
    cause: String(value.cause),
    action: String(value.action),
    result: String(value.result),
    sourceAnswers: [transcript],
    participantCode,
    author: participantCode,
    createdAt: value.createdAt,
    status: status as CardStatus,
    confidence: Math.round(confidence),
    structureMode: mode as StructureMode,
    views: Number.isSafeInteger(Number(value.views)) && Number(value.views) >= 0
      ? Number(value.views)
      : 0,
  };
}

function structureModeLabel(mode: StructureMode, confidence?: number) {
  if (mode === "ai") {
    return confidence === undefined ? "LIVE AI" : `LIVE AI · 미검증 자체평가 ${confidence}%`;
  }
  if (mode === "rules") return "RULES · 실제 입력";
  return confidence === undefined ? "SAMPLE" : "SAMPLE · AI 미사용";
}

function cardDisplayId(card: KnowledgeCard) {
  return card.id < 0 ? `SAMPLE #${Math.abs(card.id)}` : `#${card.id}`;
}

function parseServerCheckIn(value: unknown): NoIssueCheckIn | null {
  if (!isObject(value)) return null;
  const id = Number(value.id);
  const durationSeconds = Number(value.durationSeconds);
  const participantCode = isNonEmptyString(value.participantCode)
    ? value.participantCode.trim()
    : isNonEmptyString(value.participantKey)
      ? value.participantKey.trim()
      : "";
  if (
    !Number.isSafeInteger(id) || id <= 0 ||
    !participantCode ||
    !isNonEmptyString(value.periodKey) ||
    !isNonEmptyString(value.workOrder) ||
    !isString(value.product) ||
    !isString(value.process) ||
    !isString(value.equipment) ||
    !Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 180 ||
    !isIsoDateString(value.createdAt)
  ) {
    return null;
  }

  return {
    id,
    periodKey: value.periodKey,
    participantCode,
    workOrder: value.workOrder,
    product: value.product,
    process: value.process,
    equipment: value.equipment,
    durationSeconds: Math.round(durationSeconds),
    createdAt: value.createdAt,
    mode: "live",
  };
}

function parseStoredSampleRecord(value: unknown, index: number): KnowledgeCard | null {
  if (!isObject(value) || value.structureMode !== "sample") return null;
  const kind = value.kind;
  const status = value.status;
  const sourceAnswers = value.sourceAnswers;
  if (
    !["문제", "개선", "노하우"].includes(String(kind)) ||
    !["승인", "검토 대기", "반려"].includes(String(status)) ||
    !Array.isArray(sourceAnswers) || !sourceAnswers.every(isString)
  ) {
    return null;
  }
  const requiredStrings = [
    value.title,
    value.workOrder,
    value.product,
    value.process,
    value.equipment,
    value.symptom,
    value.cause,
    value.action,
    value.result,
    value.author,
    value.createdAt,
  ];
  if (!requiredStrings.every(isString)) return null;
  const confidence = Number(value.confidence);
  return {
    id: -Math.max(1, Math.abs(Number.isSafeInteger(Number(value.id)) ? Number(value.id) : Date.now() + index)),
    title: String(value.title),
    kind: kind as KnowledgeCard["kind"],
    workOrder: String(value.workOrder),
    product: String(value.product),
    process: String(value.process),
    equipment: String(value.equipment),
    quantity: isString(value.quantity) ? value.quantity : "",
    defect: isString(value.defect) ? value.defect : "",
    symptom: String(value.symptom),
    cause: String(value.cause),
    action: String(value.action),
    result: String(value.result),
    sourceAnswers,
    participantCode: isNonEmptyString(value.participantCode)
      ? value.participantCode.trim()
      : "SAMPLE",
    author: String(value.author),
    createdAt: String(value.createdAt),
    status: status as CardStatus,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0,
    structureMode: "sample",
    views: Number.isSafeInteger(Number(value.views)) && Number(value.views) >= 0
      ? Number(value.views)
      : 0,
  };
}

function parseStoredSampleCheckIn(value: unknown, index: number): NoIssueCheckIn | null {
  if (!isObject(value) || value.mode !== "sample") return null;
  const participantCode = isNonEmptyString(value.participantCode)
    ? value.participantCode.trim()
    : "SAMPLE";
  if (
    !isNonEmptyString(value.periodKey) ||
    !isNonEmptyString(value.workOrder) ||
    !isString(value.product) ||
    !isString(value.process) ||
    !isString(value.equipment)
  ) {
    return null;
  }
  const durationSeconds = Number(value.durationSeconds);
  return {
    id: -Math.max(1, Math.abs(Number.isSafeInteger(Number(value.id)) ? Number(value.id) : Date.now() + index)),
    periodKey: value.periodKey,
    participantCode,
    workOrder: value.workOrder,
    product: value.product,
    process: value.process,
    equipment: value.equipment,
    durationSeconds: Number.isFinite(durationSeconds)
      ? Math.max(0, Math.min(180, Math.round(durationSeconds)))
      : 0,
    createdAt: isIsoDateString(value.createdAt) ? value.createdAt : new Date().toISOString(),
    mode: "sample",
  };
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!isObject(payload)) return fallback;
  if (isNonEmptyString(payload.error)) return payload.error;
  if (isObject(payload.error) && isNonEmptyString(payload.error.message)) {
    return payload.error.message;
  }
  return isNonEmptyString(payload.message) ? payload.message : fallback;
}

function getApiErrorCode(payload: unknown) {
  if (!isObject(payload)) return "";
  if (isObject(payload.error) && isNonEmptyString(payload.error.code)) {
    return payload.error.code;
  }
  return isNonEmptyString(payload.code) ? payload.code : "";
}

function parseApiList<T>(
  payload: unknown,
  key: "records" | "checkIns",
  parser: (value: unknown) => T | null,
) {
  if (!isObject(payload) || payload.ok !== true || !Array.isArray(payload[key])) {
    throw new Error("서버 응답 형식이 올바르지 않습니다.");
  }
  const parsed = payload[key].map(parser);
  if (parsed.some((item) => item === null)) {
    throw new Error("서버 데이터에 올바르지 않은 항목이 있습니다.");
  }
  return parsed as T[];
}

function parseApiItem<T>(
  payload: unknown,
  key: "record" | "checkIn",
  parser: (value: unknown) => T | null,
) {
  if (!isObject(payload) || payload.ok !== true) {
    throw new Error("서버 응답 형식이 올바르지 않습니다.");
  }
  const parsed = parser(payload[key]);
  if (!parsed) throw new Error("서버 응답 데이터가 올바르지 않습니다.");
  return parsed;
}

function parseOverview(payload: unknown): LiveOverview {
  if (!isObject(payload) || payload.ok !== true || !isObject(payload.overview)) {
    throw new Error("서버 요약 응답 형식이 올바르지 않습니다.");
  }
  const fields = [
    "totalRecords",
    "pendingRecords",
    "approvedRecords",
    "rejectedRecords",
    "aiRecords",
    "rulesRecords",
    "completedCheckIns",
  ] as const;
  const values = fields.map((field) => Number(payload.overview[field]));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("서버 요약 데이터가 올바르지 않습니다.");
  }
  return Object.fromEntries(fields.map((field, index) => [field, values[index]])) as LiveOverview;
}

function getCurrentPeriodKey() {
  const today = new Date();
  return `day-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function isNoIssueTranscript(value: string) {
  const normalized = value
    .trim()
    .replace(/[.!?。！？]/g, "")
    .replace(/\s+/g, "");
  return /^(?:오늘|금일)?(?:은)?(?:별다른|특별한)?(?:특이사항|특이한사항|이상|문제)(?:은|는|이|가)?(?:없음|없습니다|없었습니다|없어요|없었어요)$/.test(normalized);
}

function isReviewField(value: unknown): value is ReviewField {
  return typeof value === "string" && REVIEW_FIELDS.includes(value as ReviewField);
}

function extractFirstNumber(value: string) {
  const match = value.replaceAll(",", "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function Workspace() {
  const [view, setView] = useState<View>("capture");
  const [cards, setCards] = useState<KnowledgeCard[]>(initialCards);
  const [noIssueCheckIns, setNoIssueCheckIns] = useState<NoIssueCheckIn[]>([]);
  const [liveOverview, setLiveOverview] = useState<LiveOverview | null>(null);
  const [participantCode, setParticipantCode] = useState("");
  const [contextEntryMode, setContextEntryMode] = useState<ContextEntryMode>("preset");
  const [reviewerCode, setReviewerCode] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [serverLoading, setServerLoading] = useState(true);
  const [serverLoadError, setServerLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState("");
  const [captureStage, setCaptureStage] = useState(0);
  const [completionMode, setCompletionMode] = useState<CompletionMode>(null);
  const [recording, setRecording] = useState(false);
  const [finalizingRecording, setFinalizingRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [transcriptReviewRequired, setTranscriptReviewRequired] = useState(false);
  const [structureMeta, setStructureMeta] = useState<StructureMeta | null>(null);
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(initialCards[0].id);
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerSourceCardId, setAnswerSourceCardId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionBaseTranscriptRef = useRef("");
  const recognitionFinalizeTimerRef = useRef<number | null>(null);
  const recordingEndNoticeRef = useRef("");
  const analysisControllerRef = useRef<AbortController | null>(null);
  const allowDocumentNavigationRef = useRef(false);
  const recordStageRef = useRef<HTMLDivElement | null>(null);
  const serverLoadRequestRef = useRef(0);
  const recordRequestIdRef = useRef<string | null>(null);

  const finalizeRecording = useCallback((completionNotice: string) => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setRecording(false);
      setFinalizingRecording(false);
      return;
    }

    recordingEndNoticeRef.current = completionNotice;
    setRecording(false);
    setFinalizingRecording(true);
    setSpeechNotice("마지막 음성을 문장에 반영하고 있습니다.");
    if (recognitionFinalizeTimerRef.current !== null) {
      window.clearTimeout(recognitionFinalizeTimerRef.current);
      recognitionFinalizeTimerRef.current = null;
    }

    try {
      recognition.stop();
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setFinalizingRecording(false);
      setSpeechNotice(completionNotice);
      return;
    }

    recognitionFinalizeTimerRef.current = window.setTimeout(() => {
      if (recognitionRef.current !== recognition) return;
      recognitionFinalizeTimerRef.current = null;
      recognitionRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      setFinalizingRecording(false);
      setTranscriptReviewRequired(true);
      setSpeechNotice("음성 종료 확인이 지연되었습니다. 마지막 문장이 빠졌을 수 있으니 전사문을 확인해주세요.");
    }, 5_000);
  }, []);

  const [draft, setDraft] = useState<DraftRecord>({
    kind: "문제" as KnowledgeCard["kind"],
    workOrder: "",
    product: "",
    process: "",
    equipment: "",
    quantity: "",
    defect: "",
    symptom: "",
    cause: "",
    action: "",
    result: "",
  });

  const loadServerData = useCallback(async () => {
    const requestId = serverLoadRequestRef.current + 1;
    serverLoadRequestRef.current = requestId;
    setServerLoading(true);
    setServerLoadError("");

    try {
      const [recordsResponse, approvedRecordsResponse, pendingRecordsResponse, checkInsResponse, overviewResponse] = await Promise.all([
        fetch("/api/records?limit=250&includeSamples=false", { cache: "no-store" }),
        fetch("/api/records?limit=1000&status=approved&includeSamples=false", { cache: "no-store" }),
        fetch("/api/records?limit=1000&status=pending&includeSamples=false", { cache: "no-store" }),
        fetch("/api/check-ins", { cache: "no-store" }),
        fetch("/api/overview", { cache: "no-store" }),
      ]);
      const [recordsPayload, approvedRecordsPayload, pendingRecordsPayload, checkInsPayload, overviewPayload] = await Promise.all([
        recordsResponse.json().catch(() => null),
        approvedRecordsResponse.json().catch(() => null),
        pendingRecordsResponse.json().catch(() => null),
        checkInsResponse.json().catch(() => null),
        overviewResponse.json().catch(() => null),
      ]);
      if (!recordsResponse.ok) {
        throw new Error(getApiErrorMessage(recordsPayload, "현장 기록을 불러오지 못했습니다."));
      }
      if (!checkInsResponse.ok) {
        throw new Error(getApiErrorMessage(checkInsPayload, "참여 기록을 불러오지 못했습니다."));
      }
      if (!approvedRecordsResponse.ok) {
        throw new Error(getApiErrorMessage(approvedRecordsPayload, "승인 지식을 불러오지 못했습니다."));
      }
      if (!pendingRecordsResponse.ok) {
        throw new Error(getApiErrorMessage(pendingRecordsPayload, "검토 대기 기록을 불러오지 못했습니다."));
      }
      if (!overviewResponse.ok) {
        throw new Error(getApiErrorMessage(overviewPayload, "현장 요약을 불러오지 못했습니다."));
      }
      const recentServerRecords = parseApiList(recordsPayload, "records", parseServerRecord);
      const approvedServerRecords = parseApiList(approvedRecordsPayload, "records", parseServerRecord);
      const pendingServerRecords = parseApiList(pendingRecordsPayload, "records", parseServerRecord);
      const serverRecords = Array.from(new Map(
        [...recentServerRecords, ...approvedServerRecords, ...pendingServerRecords].map((card) => [card.id, card]),
      ).values());
      const serverCheckIns = parseApiList(checkInsPayload, "checkIns", parseServerCheckIn);
      const overview = parseOverview(overviewPayload);
      if (serverLoadRequestRef.current !== requestId) return;

      setCards((current) => [
        ...serverRecords,
        ...current.filter((card) => card.id < 0),
      ]);
      setNoIssueCheckIns((current) => [
        ...serverCheckIns,
        ...current.filter((checkIn) => checkIn.id < 0),
      ]);
      setLiveOverview(overview);
    } catch (error) {
      if (serverLoadRequestRef.current !== requestId) return;
      setServerLoadError(
        error instanceof TypeError
          ? "공유 데이터 서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요."
          : error instanceof Error && error.message
            ? error.message
            : "공유 데이터를 불러오지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      if (serverLoadRequestRef.current === requestId) setServerLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { version?: number; cards?: unknown[] };
          if (parsed.version === 2 && Array.isArray(parsed.cards)) {
            const storedSamples = parsed.cards
              .map(parseStoredSampleRecord)
              .filter((card): card is KnowledgeCard => card !== null);
            setCards((current) => [
              ...current.filter((card) => card.id > 0),
              ...(storedSamples.length > 0 ? storedSamples : initialCards),
            ]);
          }
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      const storedNoIssueCheckIns = window.localStorage.getItem(NO_ISSUE_STORAGE_KEY);
      if (storedNoIssueCheckIns) {
        try {
          const parsed = JSON.parse(storedNoIssueCheckIns) as {
            version?: number;
            checkIns?: unknown[];
          };
          if (parsed.version === 1 && Array.isArray(parsed.checkIns)) {
            const storedSamples = parsed.checkIns
              .map(parseStoredSampleCheckIn)
              .filter((checkIn): checkIn is NoIssueCheckIn => checkIn !== null);
            setNoIssueCheckIns((current) => [
              ...current.filter((checkIn) => checkIn.mode !== "sample"),
              ...storedSamples,
            ]);
          }
        } catch {
          window.localStorage.removeItem(NO_ISSUE_STORAGE_KEY);
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadServerData(), 0);
    return () => {
      window.clearTimeout(timer);
      serverLoadRequestRef.current += 1;
    };
  }, [loadServerData]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setSeconds((value) => Math.min(value + 1, 180)),
      1000,
    );
    const limit = window.setTimeout(() => {
      finalizeRecording("한 번의 회고가 최대 녹음 시간 3분에 도달해 종료됐습니다. 지금까지의 전사문은 그대로 보존됩니다.");
    }, Math.max(0, 180 - seconds) * 1000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(limit);
    };
  }, [finalizeRecording, recording, seconds]);

  useEffect(() => () => {
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
    if (recognitionFinalizeTimerRef.current !== null) {
      window.clearTimeout(recognitionFinalizeTimerRef.current);
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    }
    try {
      if (recognition?.abort) recognition.abort();
      else recognition?.stop();
    } catch {
      // Ignore browser-specific shutdown errors during unmount.
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (captureStage !== 1) return;
    const frame = window.requestAnimationFrame(() => {
      recordStageRef.current?.scrollIntoView({ block: "start" });
      recordStageRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [captureStage]);

  const captureWorkInProgress = view === "capture" && captureStage > 0 && captureStage < 3 && Boolean(
    transcript.trim() ||
    structureMeta ||
    recording ||
    finalizingRecording ||
    seconds > 0,
  );

  useEffect(() => {
    if (!captureWorkInProgress) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowDocumentNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [captureWorkInProgress]);

  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? cards[0];
  const pendingCards = cards.filter((card) => card.status === "검토 대기");
  const liveCards = cards.filter((card) => card.structureMode !== "sample");
  const liveApprovedCards = liveCards.filter((card) => card.status === "승인");
  const sampleApprovedCards = cards.filter((card) => card.structureMode === "sample" && card.status === "승인");
  const livePendingCards = liveCards.filter((card) => card.status === "검토 대기");
  const filteredCards = liveApprovedCards.filter((card) =>
    `${card.title} ${card.workOrder} ${card.product} ${card.process} ${card.equipment} ${card.symptom} ${card.cause} ${card.action} ${card.sourceAnswers.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const filteredSampleCards = sampleApprovedCards.filter((card) =>
    `${card.title} ${card.workOrder} ${card.product} ${card.process} ${card.equipment} ${card.symptom} ${card.cause} ${card.action} ${card.sourceAnswers.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const knowledgeSelectedCard = [...filteredCards, ...filteredSampleCards]
    .find((card) => card.id === selectedCardId) ?? null;
  const answerSourceCard = liveApprovedCards.find((card) => card.id === answerSourceCardId) ?? null;

  const metrics = [
    { label: "누적 회고", value: String((liveOverview?.totalRecords ?? 0) + (liveOverview?.completedCheckIns ?? 0)), unit: "건", delta: `기록 ${liveOverview?.totalRecords ?? 0} · 특이사항 없음 ${liveOverview?.completedCheckIns ?? 0}`, tone: "orange" },
    { label: "실제 구조화", value: String((liveOverview?.aiRecords ?? 0) + (liveOverview?.rulesRecords ?? 0)), unit: "건", delta: `AI ${liveOverview?.aiRecords ?? 0} · 규칙 ${liveOverview?.rulesRecords ?? 0}`, tone: "lime" },
    { label: "승인 지식", value: String(liveOverview?.approvedRecords ?? 0), unit: "개", delta: "공유 서버 누적", tone: "plain" },
    { label: "검토 대기", value: String(liveOverview?.pendingRecords ?? 0), unit: "건", delta: "공유 서버 누적", tone: "plain" },
  ];
  const normalizedParticipantCode = participantCode.trim().toUpperCase();
  const participantCodeIsValid = /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalizedParticipantCode);

  const missingRequiredFields = REQUIRED_DRAFT_FIELDS[draft.kind].filter(
    (field) => !draft[field].trim(),
  );
  const contentValidationError = draft.kind === "개선" && !draft.symptom.trim() && !draft.action.trim() && !draft.result.trim()
    ? "개선 내용, 제안한 조치, 확인된 결과 중 하나를 입력해주세요."
    : "";
  const quantityValue = extractFirstNumber(draft.quantity);
  const defectValue = extractFirstNumber(draft.defect);
  const numericValidationError = draft.quantity.trim() && quantityValue === null
      ? "작업 수량을 입력할 때는 숫자를 포함해주세요."
      : draft.defect.trim() && defectValue === null
        ? "불량 수량을 입력할 때는 숫자를 포함해주세요."
        : quantityValue !== null && defectValue !== null && defectValue > quantityValue
        ? "불량 수량은 작업 수량보다 클 수 없습니다."
        : "";
  const draftHasErrors = missingRequiredFields.length > 0 || Boolean(contentValidationError) || Boolean(numericValidationError);
  const draftTitleDetail = draft.defect.trim() || draft.symptom.trim() || "새 현장 기록";
  const blankStructuredFields = REVIEW_FIELDS.filter((field) => !draft[field].trim());
  const fieldsNeedingReview = Array.from(new Set([
    ...(structureMeta?.needsReview ?? []),
    ...blankStructuredFields,
  ]));
  const latestNoIssueCheckIn = noIssueCheckIns.find((checkIn) => (
    checkIn.workOrder === draft.workOrder &&
    checkIn.participantCode === participantCode.trim()
  )) ?? noIssueCheckIns[0];

  function updateDraftField<Field extends keyof DraftRecord>(
    field: Field,
    value: DraftRecord[Field],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setCriticalConfirmed(false);
  }

  function selectWorkOrder(workOrder: string) {
    const context = CONTEXT_OPTIONS.find((option) => option.workOrder === workOrder);
    setContextEntryMode("preset");
    setDraft((current) => ({
      ...current,
      workOrder: context?.workOrder ?? "",
      product: context?.product ?? "",
      process: context?.process ?? "",
      equipment: context?.equipment ?? "",
    }));
    setCriticalConfirmed(false);
  }

  function startManualContextEntry() {
    setContextEntryMode("manual");
    setDraft((current) => ({
      ...current,
      workOrder: "",
      product: "",
      process: "",
      equipment: "",
    }));
    setCriticalConfirmed(false);
  }

  function cancelAnalysis() {
    const controller = analysisControllerRef.current;
    analysisControllerRef.current = null;
    controller?.abort();
    setProcessing(false);
  }

  function resetCaptureState(preserveContext = true) {
    stopRecording();
    cancelAnalysis();
    recognitionBaseTranscriptRef.current = "";
    setCaptureStage(0);
    setCompletionMode(null);
    setSeconds(0);
    setTranscript("");
    setAnalysisError("");
    setSaveError("");
    setSpeechNotice("");
    setTranscriptReviewRequired(false);
    setStructureMeta(null);
    setCriticalConfirmed(false);
    setSaving(false);
    recordRequestIdRef.current = null;
    setDraft((current) => ({
      kind: "문제",
      workOrder: preserveContext ? current.workOrder : "",
      product: preserveContext ? current.product : "",
      process: preserveContext ? current.process : "",
      equipment: preserveContext ? current.equipment : "",
      quantity: "",
      defect: "",
      symptom: "",
      cause: "",
      action: "",
      result: "",
    }));
    if (!preserveContext) setContextEntryMode("preset");
  }

  function hasCaptureWorkInProgress() {
    return captureWorkInProgress;
  }

  function confirmCaptureReset() {
    return !hasCaptureWorkInProgress() || window.confirm(
      "작성 중인 3분 회고 전사문과 구조화 초안을 지우고 이동할까요?",
    );
  }

  function returnToContextSelection() {
    if (!confirmCaptureReset()) return;
    resetCaptureState();
  }

  function changeView(nextView: View) {
    if (view === "capture" && !confirmCaptureReset()) return;
    if (nextView === "capture" || view === "capture") {
      resetCaptureState();
    } else {
      stopRecording();
    }
    if (
      nextView === "knowledge" &&
      liveApprovedCards[0] &&
      (selectedCard?.status !== "승인" || selectedCard.structureMode === "sample")
    ) {
      setSelectedCardId(liveApprovedCards[0].id);
    }
    if (nextView === "review" && pendingCards[0]) {
      setSelectedCardId((livePendingCards[0] ?? pendingCards[0]).id);
    }
    setView(nextView);
  }

  function startRecording() {
    if (finalizingRecording) return;
    if (transcript.length >= MAX_TRANSCRIPT_CHARACTERS) {
      setSpeechNotice("전사문 6,000자 한도에 도달했습니다. 내용을 줄인 뒤 다시 녹음해주세요.");
      return;
    }
    if (seconds >= 180) {
      setSpeechNotice("한 번의 회고에 제공되는 3분 녹음 시간을 모두 사용했습니다. 빠진 내용은 전사문에 직접 입력해주세요.");
      return;
    }
    stopRecording();
    setAnalysisError("");
    setSpeechNotice("");
    recognitionBaseTranscriptRef.current = transcript.trim();

    const speechWindow = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setSpeechNotice("이 브라우저는 음성 인식을 지원하지 않습니다. 인식된 내용 칸에 직접 입력하거나 샘플 문장을 불러와 주세요.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = true;
    let transcriptLimitReached = false;
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition || transcriptLimitReached) return;
      const nextTranscript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      const combinedTranscript = [recognitionBaseTranscriptRef.current, nextTranscript]
        .filter(Boolean)
        .join("\n");
      setTranscript(combinedTranscript.slice(0, MAX_TRANSCRIPT_CHARACTERS));
      if (combinedTranscript.length >= MAX_TRANSCRIPT_CHARACTERS) {
        transcriptLimitReached = true;
        setTranscriptReviewRequired(true);
        finalizeRecording("전사문은 6,000자까지 보존되었고 초과 부분은 포함되지 않았습니다. 끝부분을 확인해주세요.");
      }
    };
    recognition.onerror = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      if (recognitionFinalizeTimerRef.current !== null) {
        window.clearTimeout(recognitionFinalizeTimerRef.current);
        recognitionFinalizeTimerRef.current = null;
      }
      setSpeechNotice("음성을 인식하지 못했습니다. 마이크 권한과 브라우저 설정을 확인하거나 내용을 직접 입력해 주세요.");
      setTranscriptReviewRequired(true);
      setRecording(false);
      setFinalizingRecording(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        if (recognitionFinalizeTimerRef.current !== null) {
          window.clearTimeout(recognitionFinalizeTimerRef.current);
          recognitionFinalizeTimerRef.current = null;
        }
        setRecording(false);
        setFinalizingRecording(false);
        const completionNotice = recordingEndNoticeRef.current;
        recordingEndNoticeRef.current = "";
        setSpeechNotice(completionNotice || "브라우저 음성 인식이 종료되었습니다. 이어서 말하기를 누르면 현재 내용 뒤에 계속 기록됩니다.");
      }
    };
    recognitionRef.current = recognition;
    recordingEndNoticeRef.current = "";
    try {
      recognition.start();
      setRecording(true);
    } catch {
      recognitionRef.current = null;
      setRecording(false);
      setFinalizingRecording(false);
      setSpeechNotice("마이크를 시작하지 못했습니다. 브라우저 권한을 확인하거나 내용을 직접 입력해 주세요.");
    }
  }

  function stopRecording() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recordingEndNoticeRef.current = "";
    if (recognitionFinalizeTimerRef.current !== null) {
      window.clearTimeout(recognitionFinalizeTimerRef.current);
      recognitionFinalizeTimerRef.current = null;
    }
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    }
    try {
      if (recognition?.abort) recognition.abort();
      else recognition?.stop();
    } catch {
      // The recognizer may already have stopped itself.
    }
    setRecording(false);
    setFinalizingRecording(false);
  }

  function clearTranscriptForRestart() {
    if (
      transcript.trim() &&
      !window.confirm("현재 3분 회고 전사문을 모두 지울까요?")
    ) {
      return;
    }
    stopRecording();
    recognitionBaseTranscriptRef.current = "";
    setTranscript("");
    setAnalysisError("");
    setSpeechNotice("전체 회고 전사문을 지웠습니다. 다시 녹음하거나 직접 입력하세요.");
    setTranscriptReviewRequired(false);
  }

  async function completeNoIssuesReflection() {
    const hasDetailedAnswer = Boolean(
      transcript.trim() && transcript.trim() !== "특이사항 없음",
    );
    if (
      hasDetailedAnswer &&
      !window.confirm("작성 중인 회고 전사문 대신 이 작업을 ‘특이사항 없음’으로 완료할까요?")
    ) {
      return;
    }
    if (!participantCodeIsValid) {
      setSaveError("참여자 코드를 영문·숫자·하이픈 조합 3~32자로 입력해주세요.");
      return;
    }

    stopRecording();
    cancelAnalysis();
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/check-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantCode: normalizedParticipantCode,
          periodKey: getCurrentPeriodKey(),
          workOrder: draft.workOrder,
          product: draft.product,
          process: draft.process,
          equipment: draft.equipment,
          durationSeconds: seconds,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, response.status === 409
          ? "같은 참여 기록이 이미 처리 중입니다. 공유 데이터를 다시 불러온 뒤 확인해주세요."
          : "참여 기록을 저장하지 못했습니다."));
      }
      const savedCheckIn = parseApiItem(payload, "checkIn", parseServerCheckIn);
      setNoIssueCheckIns((current) => [
        savedCheckIn,
        ...current.filter((checkIn) => checkIn.id !== savedCheckIn.id),
      ]);
      setTranscript("특이사항 없음");
      recognitionBaseTranscriptRef.current = "";
      setTranscriptReviewRequired(false);
      setAnalysisError("");
      setSpeechNotice("");
      setStructureMeta(null);
      setCriticalConfirmed(false);
      setCompletionMode("no-issues");
      setCaptureStage(3);
      void loadServerData();
    } catch (error) {
      setSaveError(
        error instanceof TypeError
          ? "공유 데이터 서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요."
          : error instanceof Error && error.message
            ? error.message
            : "참여 기록을 저장하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmSampleReplacement() {
    const currentTranscript = transcript.trim();
    const transcriptWillChange = Boolean(currentTranscript && currentTranscript !== demoReflectionTranscript);
    const contextWillChange = draft.workOrder !== DEMO_CONTEXT.workOrder;
    if (!transcriptWillChange && !contextWillChange) return true;
    return window.confirm(
      "준비된 A모델 샘플에 맞춰 현재 작업 맥락과 회고 전사문을 교체할까요?",
    );
  }

  function applyDemoContext() {
    setContextEntryMode("preset");
    setDraft((current) => ({
      ...current,
      workOrder: DEMO_CONTEXT.workOrder,
      product: DEMO_CONTEXT.product,
      process: DEMO_CONTEXT.process,
      equipment: DEMO_CONTEXT.equipment,
    }));
  }

  async function analyzeTranscript(preferredMode: "auto" | "rules" = "auto") {
    if (!participantCodeIsValid) {
      setAnalysisError("현장 선택 단계로 돌아가 참여자 코드를 확인해주세요.");
      return;
    }
    if (transcriptReviewRequired) {
      setAnalysisError("전사문을 확인한 뒤 ‘전사문 확인 완료’를 눌러주세요.");
      return;
    }
    if (recording || finalizingRecording) {
      setAnalysisError("먼저 녹음을 멈추고 마지막 음성이 반영될 때까지 기다려주세요.");
      return;
    }
    stopRecording();
    const currentTranscript = transcript.trim();
    if (!currentTranscript) {
      setAnalysisError("한 번의 회고를 녹음하거나 전사문을 직접 입력해주세요.");
      return;
    }
    if (isNoIssueTranscript(currentTranscript)) {
      completeNoIssuesReflection();
      return;
    }
    if (currentTranscript.length > MAX_TRANSCRIPT_CHARACTERS) {
      setAnalysisError(
        `전체 회고 전사문이 ${MAX_TRANSCRIPT_CHARACTERS.toLocaleString()}자를 넘었습니다. 내용을 조금 줄여주세요.`,
      );
      return;
    }

    cancelAnalysis();
    recordRequestIdRef.current = null;
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    setProcessing(true);
    setAnalysisError("");
    setSaveError("");
    setStructureMeta(null);

    try {
      const response = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: currentTranscript,
          process: draft.process,
          equipment: draft.equipment,
          ...(preferredMode === "rules" ? { structureMode: "rules" } : {}),
        }),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | StructureSuccessResponse
        | StructureErrorResponse
        | null;

      if (!response.ok || !payload || payload.ok !== true) {
        const errorPayload = payload as StructureErrorResponse | null;
        const errorCode =
          typeof errorPayload?.error === "object"
            ? errorPayload.error.code
            : errorPayload?.code;
        const errorMessage =
          typeof errorPayload?.error === "object"
            ? errorPayload.error.message
            : errorPayload?.error;
        if (
          response.status === 503 ||
          errorCode === "AI_NOT_CONFIGURED" ||
          errorMessage?.includes("API 키")
        ) {
          throw new Error("AI API 키가 아직 설정되지 않았습니다. 설정 후 다시 시도하거나 샘플 결과로 계속할 수 있습니다.");
        }
        if (response.status === 429) {
          throw new Error("현재 AI 요청 한도를 초과했습니다. 잠시 후 다시 시도하거나 샘플 결과로 계속해주세요.");
        }
        throw new Error("AI 구조화 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.");
      }

      if (!["ai", "rules", "live"].includes(payload.mode) || !payload.data) {
        throw new Error("AI 서버 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.");
      }

      const data = payload.data;
      if (
        !Array.isArray(data.needsReview) ||
        !data.needsReview.every(isReviewField) ||
        ![
          data.process,
          data.equipment,
          data.quantity,
          data.defect,
          data.symptom,
          data.cause,
          data.action,
          data.result,
        ].every(isString)
      ) {
        throw new Error("AI 서버 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.");
      }
      const confidenceValue = Number(data.confidence);
      if (
        !Number.isInteger(confidenceValue) ||
        confidenceValue < 0 ||
        confidenceValue > 100
      ) {
        throw new Error("구조화 신뢰도 형식을 확인할 수 없습니다. 다시 시도해주세요.");
      }
      const confidence = confidenceValue;
      if (!["문제", "개선", "노하우"].includes(data.kind)) {
        throw new Error("AI 서버 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.");
      }

      setDraft((current) => ({
        ...current,
        kind: data.kind,
        process: current.process,
        equipment: current.equipment,
        quantity: data.quantity,
        defect: data.defect,
        symptom: data.symptom,
        cause: data.cause,
        action: data.action,
        result: data.result,
      }));
      setStructureMeta({
        mode: payload.mode === "live" ? "ai" : payload.mode,
        confidence,
        needsReview: data.needsReview,
      });
      setCriticalConfirmed(false);
      setCaptureStage(2);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setAnalysisError(
        error instanceof TypeError
          ? "AI 서버에 연결하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해주세요."
          : error instanceof Error && error.message
            ? error.message
            : "AI 구조화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setProcessing(false);
      }
    }
  }

  function continueWithSample(transcriptOverride: string) {
    if (!confirmSampleReplacement()) return;
    stopRecording();
    cancelAnalysis();
    applyDemoContext();
    recordRequestIdRef.current = null;
    setTranscript(transcriptOverride);
    setTranscriptReviewRequired(false);
    setDraft((current) => ({
      ...current,
      kind: "문제",
      quantity: "50개",
      defect: "누설 불량 3개",
      symptom: "누설 검사 불합격",
      cause: "실링 고무가 홈 안쪽으로 밀림",
      action: "실링 위치 재조정 후 둘레 확인",
      result: "재작업 3개 모두 재검사 통과",
    }));
    setAnalysisError("");
    setSaveError("");
    setStructureMeta({
      mode: "sample",
      confidence: 0,
      needsReview: [...REVIEW_FIELDS],
    });
    setCriticalConfirmed(false);
    setCaptureStage(2);
  }

  async function saveDraft() {
    if (!criticalConfirmed || draftHasErrors || saving) return;
    if (!participantCodeIsValid) {
      setSaveError("현장 선택 단계로 돌아가 참여자 코드를 확인해주세요.");
      return;
    }
    const isSample = structureMeta?.mode === "sample";
    const recordTitle = `${draft.process} — ${draftTitleDetail}`.slice(0, 300);
    const newCard: KnowledgeCard = {
      id: Math.min(0, ...cards.filter((card) => card.structureMode === "sample").map((card) => card.id)) - 1,
      title: recordTitle,
      kind: draft.kind,
      workOrder: draft.workOrder,
      product: draft.product,
      process: draft.process,
      equipment: draft.equipment,
      quantity: draft.quantity,
      defect: draft.defect,
      symptom: draft.quantity.trim()
        ? `${draft.quantity} 작업 중 ${draft.symptom}`
        : draft.symptom,
      cause: draft.cause,
      action: draft.action,
      result: draft.result,
      sourceAnswers: [transcript.trim()],
      participantCode: normalizedParticipantCode,
      author: normalizedParticipantCode,
      createdAt: "방금 전",
      status: "검토 대기",
      confidence: isSample ? 0 : (structureMeta?.confidence ?? 0),
      structureMode: structureMeta?.mode ?? "sample",
      views: 0,
    };

    if (isSample) {
      const nextCards = [newCard, ...cards];
      setCards(nextCards);
      persistCards(nextCards);
      setSelectedCardId(newCard.id);
      setCompletionMode("knowledge");
      setCaptureStage(3);
      return;
    }

    if (!structureMeta || !["ai", "rules"].includes(structureMeta.mode)) {
      setSaveError("실제 구조화 결과를 확인할 수 없습니다. 전사문을 다시 분석해주세요.");
      return;
    }

    setSaving(true);
    setSaveError("");
    if (!recordRequestIdRef.current) {
      recordRequestIdRef.current = window.crypto.randomUUID();
    }
    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: recordRequestIdRef.current,
          structureMode: structureMeta.mode,
          participantCode: normalizedParticipantCode,
          workOrder: draft.workOrder,
          product: draft.product,
          process: draft.process,
          equipment: draft.equipment,
          transcript: transcript.trim(),
          title: newCard.title,
          kind: draft.kind,
          quantity: draft.quantity,
          defect: draft.defect,
          symptom: draft.symptom,
          cause: draft.cause,
          action: draft.action,
          result: draft.result,
          confidence: structureMeta.confidence,
          needsReview: structureMeta.needsReview,
          excludeFromMetrics: false,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (getApiErrorCode(payload) === "IDEMPOTENCY_CONFLICT") {
          recordRequestIdRef.current = null;
        }
        throw new Error(getApiErrorMessage(payload, response.status === 409
          ? "같은 요청 식별자가 다른 내용에 사용되었습니다. 다시 누르면 새 요청으로 저장합니다."
          : "현장 기록을 저장하지 못했습니다."));
      }
      const savedCard = parseApiItem(payload, "record", parseServerRecord);
      setCards((current) => [
        savedCard,
        ...current.filter((card) => card.id !== savedCard.id),
      ]);
      setSelectedCardId(savedCard.id);
      setCompletionMode("knowledge");
      setCaptureStage(3);
      void loadServerData();
    } catch (error) {
      setSaveError(
        error instanceof TypeError
          ? "공유 데이터 서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요."
          : error instanceof Error && error.message
            ? error.message
            : "현장 기록을 저장하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: number, status: CardStatus) {
    const currentCard = cards.find((card) => card.id === id);
    if (!currentCard || currentCard.status !== "검토 대기" || statusUpdatingId !== null) return;

    if (currentCard.id < 0) {
      const nextCards = cards.map((card) => (card.id === id ? { ...card, status } : card));
      setCards(nextCards);
      persistCards(nextCards);
      const nextPendingCard = nextCards.find((card) => card.status === "검토 대기");
      if (nextPendingCard) setSelectedCardId(nextPendingCard.id);
      setToast(status === "승인" ? "SAMPLE 카드가 로컬 데모 지식으로 승인되었습니다." : "SAMPLE 카드가 로컬에서 반려되었습니다.");
      return;
    }

    const normalizedReviewerCode = reviewerCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalizedReviewerCode)) {
      setStatusError("검토자 코드를 영문·숫자·하이픈 조합 3~32자로 입력해주세요.");
      return;
    }
    if (status === "반려" && !rejectionReason.trim()) {
      setStatusError("반려 사유를 입력해주세요.");
      return;
    }

    setStatusUpdatingId(id);
    setStatusError("");
    try {
      const response = await fetch(`/api/records/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          reviewerCode: normalizedReviewerCode,
          rejectionReason: status === "반려" ? rejectionReason.trim() : "",
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, response.status === 409
          ? "다른 검토자가 먼저 처리했습니다. 공유 데이터를 다시 불러와주세요."
          : "검토 상태를 저장하지 못했습니다."));
      }
      const savedCard = parseApiItem(payload, "record", parseServerRecord);
      const nextCards = cards.map((card) => (card.id === id ? savedCard : card));
      setCards(nextCards);
      setRejectionReason("");
      const nextPendingCard = nextCards.find((card) => card.status === "검토 대기");
      if (nextPendingCard) setSelectedCardId(nextPendingCard.id);
      setToast(status === "승인" ? "지식 카드가 공유 현장 지식으로 게시되었습니다." : "보완 요청을 공유 서버에 저장했습니다.");
      void loadServerData();
    } catch (error) {
      setStatusError(
        error instanceof TypeError
          ? "공유 데이터 서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요."
          : error instanceof Error && error.message
            ? error.message
            : "검토 상태를 저장하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      setStatusUpdatingId(null);
    }
  }

  function askKnowledge() {
    const normalized = question.trim().toLowerCase();
    if (!normalized) return;
    const terms = normalized
      .split(/[^\p{L}\p{N}-]+/u)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);
    const match = liveApprovedCards
      .map((card) => ({
        card,
        score: terms.filter((term) =>
          `${card.title} ${card.workOrder} ${card.product} ${card.process} ${card.equipment} ${card.symptom} ${card.cause} ${card.action} ${card.result}`
            .toLowerCase()
            .includes(term),
        ).length,
      }))
      .sort((left, right) => right.score - left.score)
      .find((candidate) => candidate.score > 0)?.card;

    if (!match) {
      setAnswerSourceCardId(null);
      setAnswer("승인된 LIVE 현장 지식에서 일치하는 근거를 찾지 못했습니다. 다른 검색어를 사용하거나 새 기록으로 남겨 주세요.");
      return;
    }

    setAnswerSourceCardId(match.id);
    setAnswer([
      match.symptom && `증상: ${match.symptom}`,
      match.cause && `확인된 원인: ${match.cause}`,
      match.action && `조치: ${match.action}`,
      match.result && `결과: ${match.result}`,
    ].filter(Boolean).join(" · "));
  }

  function resetDemo() {
    if (view === "capture" && !confirmCaptureReset()) return;
    resetCaptureState(false);
    setCards((current) => [
      ...current.filter((card) => card.id > 0),
      ...initialCards,
    ]);
    setNoIssueCheckIns((current) => current.filter((checkIn) => checkIn.mode === "live"));
    setParticipantCode("");
    setReviewerCode("");
    setRejectionReason("");
    setSaveError("");
    setStatusError("");
    setSelectedCardId(initialCards[0].id);
    setSearch("");
    setQuestion("");
    setAnswer("");
    setAnswerSourceCardId(null);
    setView("capture");
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(NO_ISSUE_STORAGE_KEY);
    setToast("로컬 SAMPLE 데이터만 처음 상태로 되돌렸습니다. 공유 서버 데이터는 유지됩니다.");
  }

  return (
    <div className={`workspace-shell view-${view}`}>
      <aside className="workspace-sidebar">
        {/* Sites에서는 문서 이동이 클라이언트 라우팅보다 안정적이므로 기본 링크를 사용합니다. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="workspace-logo" href="/" data-navigation="document" aria-label="TAID 홈페이지" onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; if (view === "capture" && !confirmCaptureReset()) event.preventDefault(); else { allowDocumentNavigationRef.current = true; window.setTimeout(() => { allowDocumentNavigationRef.current = false; }, 1_500); } }}>
          TAID<span>.</span>
        </a>
        <span className="mvp-label">INTERACTIVE MVP · LIVE DATA + SAMPLE</span>
        <div className="factory-switcher">
          <span className="factory-mark">대</span>
          <div><b>대한정밀</b><small>화성 1공장</small></div>
          <span aria-hidden="true">⌄</span>
        </div>
        <nav className="workspace-nav" aria-label="워크스페이스 메뉴">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.key}
              className={view === item.key ? "active" : ""}
              onClick={() => changeView(item.key)}
            >
              <span aria-hidden="true">{item.icon}</span>{item.label}
              {item.key === "review" && pendingCards.length > 0 && <i>{pendingCards.length}</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-principle">
          <span>TAID 원칙 01</span>
          <b>상시 녹음하지 않습니다.</b>
          <p>작업자가 버튼을 누른 순간만 기록하며 개인평가에 사용하지 않습니다.</p>
        </div>
        <button className="profile-row" type="button" onClick={() => setToast("프로토타입에서는 사용자·권한 설정을 제공하지 않습니다.")}>
          <span className="avatar">관리</span>
          <div><b>DEMO 관리자</b><small>로그인 아님</small></div>
          <span aria-hidden="true">•••</span>
        </button>
      </aside>

      <main className="workspace-main">
        <header className="workspace-mobile-header">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="workspace-logo" href="/" data-navigation="document" onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; if (view === "capture" && !confirmCaptureReset()) event.preventDefault(); else { allowDocumentNavigationRef.current = true; window.setTimeout(() => { allowDocumentNavigationRef.current = false; }, 1_500); } }}>TAID<span>.</span> <small>MVP · LIVE + SAMPLE</small></a>
          <button type="button" disabled={view === "capture"} onClick={() => changeView("capture")}>{view === "capture" ? "기록 진행 중" : "+ 새 기록"}</button>
        </header>

        {serverLoading && <div className="analysis-status" role="status">공유 현장 데이터를 불러오는 중입니다.</div>}
        {serverLoadError && (
          <div className="analysis-error" role="alert">
            <div><b>공유 데이터를 불러오지 못했습니다.</b><p>{serverLoadError}</p></div>
            <button type="button" disabled={serverLoading} onClick={() => void loadServerData()}>다시 시도</button>
          </div>
        )}

        {view === "dashboard" && (
          <section className="workspace-view dashboard-view">
            <div className="view-heading">
              <div><p>현장 검증 · 공유 서버 기준 <span className="demo-data-label">LIVE KPI</span></p><h1>오늘의 현장</h1></div>
              <button className="dark-action" type="button" onClick={() => changeView("capture")}><span>+</span> 새 음성 기록</button>
            </div>

            <div className="pilot-banner">
              <div><span>파일럿 운영 예시 · DEMO</span><b>DAY 28</b></div>
              <p>90일 검증 계획의 화면 예시이며 아래 KPI에는 포함되지 않습니다.</p>
              <div className="pilot-progress"><span style={{ width: "31%" }} /></div>
              <small>28일 경과</small><small>목표일까지 62일</small>
            </div>

            <div className="metric-grid">
              {metrics.map((metric) => (
                <article key={metric.label} className={`metric-card ${metric.tone}`}>
                  <span>{metric.label}</span><div><strong>{metric.value}</strong><b>{metric.unit}</b></div><p>{metric.delta}</p>
                </article>
              ))}
            </div>

            <div className="dashboard-grid">
              <section className="feed-panel">
                <div className="panel-heading"><div><span className="section-kicker">RECENT RECORDS · LIVE + SAMPLE</span><h2>방금 들어온 현장 기록</h2></div><button type="button" onClick={() => changeView("review")}>모두 보기 →</button></div>
                <div className="feed-list">
                  {cards.slice(0, 3).map((card) => (
                    <button className="feed-item" type="button" key={card.id} onClick={() => { setSelectedCardId(card.id); setView(card.status === "승인" ? "knowledge" : "review"); }}>
                      <span className={`kind-mark ${card.kind}`}>{card.kind}</span>
                      <div><b>{card.title}</b><p>{card.workOrder} · {card.product}<br />{card.equipment} · {card.author} · {card.createdAt} <span className={`mode-chip ${card.structureMode === "sample" ? "sample" : "live"}`}>{structureModeLabel(card.structureMode)}</span></p></div>
                      <span className={`status-chip ${card.status.replace(" ", "-")}`}>{card.status}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="signal-panel">
                <div className="panel-heading"><div><span className="section-kicker">SIGNAL · DEMO DATA</span><h2>반복 이슈 신호</h2></div></div>
                <div className="signal-chart" aria-label="이번 주 문제 유형별 발생 횟수">
                  {[
                    ["누설", 76, 7], ["토크 편차", 55, 5], ["표면 불량", 34, 3], ["라벨", 22, 2],
                  ].map(([label, width, count]) => (
                    <div key={String(label)}><span>{label}</span><i><b style={{ width: `${width}%` }} /></i><strong>{count}</strong></div>
                  ))}
                </div>
                <div className="signal-note"><span>!</span><p><b>누설 이슈가 2주 연속 증가 중입니다.</b><br />AS-02 설비에서 7건 중 5건이 발생했습니다.</p></div>
              </section>
            </div>
          </section>
        )}

        {view === "capture" && (
          <section className="workspace-view capture-view">
            <div className="view-heading compact"><div><p>TAID VOICE</p><h1>3분 현장 기록</h1></div><button className="ghost-action" type="button" onClick={() => changeView("dashboard")}>나가기 ×</button></div>
            <div className="capture-steps" aria-label="기록 진행 단계">
              {captureSteps.map((step, index) => <div key={step} className={captureStage >= index ? "active" : ""}><span>{captureStage > index ? "✓" : index + 1}</span><b>{step}</b></div>)}
            </div>

            {captureStage === 0 && (
              <div className="capture-card context-card">
                <span className="section-kicker">STEP 01</span><h2>어떤 작업에서 있었던 일인가요?</h2><p>작업지시·품목·공정·설비를 연결해 기록의 맥락을 먼저 고정합니다.</p>
                <div className="demo-guide"><b>처음 체험하시나요?</b><span>QR 데모를 누른 뒤 다음 화면에서 ‘마이크 없이 샘플로 체험’을 선택하세요.</span></div>
                <button className="qr-button" type="button" onClick={() => { selectWorkOrder("WO-260818-042"); setParticipantCode(DEMO_PARTICIPANT_CODE); setToast("QR 데모: 참여자 코드와 작업 맥락을 함께 채웠습니다."); }}><span>▦</span><b>설비 QR 데모</b><small>PILOT-01 · WO-260818-042 · A모델 · AS-02</small></button>
                <div className="or-line"><span>또는 작업 정보 입력</span></div>
                <div className="context-mode-toggle" aria-label="작업 정보 입력 방식">
                  <button type="button" className={contextEntryMode === "preset" ? "active" : ""} aria-pressed={contextEntryMode === "preset"} onClick={() => { setContextEntryMode("preset"); selectWorkOrder(""); }}>등록된 작업 선택</button>
                  <button type="button" className={contextEntryMode === "manual" ? "active" : ""} aria-pressed={contextEntryMode === "manual"} onClick={startManualContextEntry}>실제 작업 직접 입력</button>
                </div>
                <p className="context-helper">{contextEntryMode === "preset" ? "한 항목을 선택하면 같은 작업에 연결된 나머지 값도 함께 채워집니다." : "파일럿 현장의 실제 작업지시·품목·공정·설비명을 입력하세요."}</p>
                <div className="field-grid">
                  <label><span>참여자 코드</span><input autoComplete="off" maxLength={32} placeholder="예: PILOT-01" value={participantCode} onChange={(event) => { setParticipantCode(event.target.value.toUpperCase()); setSaveError(""); }} /></label>
                  {contextEntryMode === "preset" ? (
                    <>
                      <label><span>작업지시</span><select value={draft.workOrder} onChange={(event) => selectWorkOrder(event.target.value)}><option value="">작업지시를 선택하세요</option>{CONTEXT_OPTIONS.map((option) => <option key={option.workOrder} value={option.workOrder}>{option.workOrder}</option>)}</select></label>
                      <label><span>품목</span><select value={draft.product} onChange={(event) => { const option = CONTEXT_OPTIONS.find((item) => item.product === event.target.value); selectWorkOrder(option?.workOrder ?? ""); }}><option value="">품목을 선택하세요</option>{CONTEXT_OPTIONS.map((option) => <option key={option.product} value={option.product}>{option.product}</option>)}</select></label>
                      <label><span>공정</span><select value={draft.process} onChange={(event) => { const option = CONTEXT_OPTIONS.find((item) => item.process === event.target.value); selectWorkOrder(option?.workOrder ?? ""); }}><option value="">공정을 선택하세요</option>{CONTEXT_OPTIONS.map((option) => <option key={option.process} value={option.process}>{option.process}</option>)}</select></label>
                      <label><span>설비·라인</span><select value={draft.equipment} onChange={(event) => { const option = CONTEXT_OPTIONS.find((item) => item.equipment === event.target.value); selectWorkOrder(option?.workOrder ?? ""); }}><option value="">설비를 선택하세요</option>{CONTEXT_OPTIONS.map((option) => <option key={option.equipment} value={option.equipment}>{option.equipment}</option>)}</select></label>
                    </>
                  ) : (
                    <>
                      <label><span>작업지시</span><input autoComplete="off" maxLength={240} placeholder="예: WO-2026-0819-01" value={draft.workOrder} onChange={(event) => updateDraftField("workOrder", event.target.value)} /></label>
                      <label><span>품목</span><input autoComplete="off" maxLength={240} placeholder="예: A모델 밸브 Assy" value={draft.product} onChange={(event) => updateDraftField("product", event.target.value)} /></label>
                      <label><span>공정</span><input autoComplete="off" maxLength={240} placeholder="예: 최종 조립" value={draft.process} onChange={(event) => updateDraftField("process", event.target.value)} /></label>
                      <label><span>설비·라인</span><input autoComplete="off" maxLength={240} placeholder="예: 조립 2라인 · AS-02" value={draft.equipment} onChange={(event) => updateDraftField("equipment", event.target.value)} /></label>
                    </>
                  )}
                </div>
                <p className="context-helper">참여자·검토자 코드는 파일럿 기록 구분용이며 로그인이나 보안 인증 수단이 아닙니다.</p>
                {participantCode && !participantCodeIsValid && <p className="required-field-warning" role="alert">참여자 코드는 영문·숫자·하이픈 조합 3~32자로 입력해주세요.</p>}
                <button className="wide-primary" type="button" disabled={!participantCodeIsValid || !draft.workOrder || !draft.product || !draft.process || !draft.equipment} onClick={() => { setParticipantCode(normalizedParticipantCode); setCaptureStage(1); }}>선택하고 계속 <span>→</span></button>
              </div>
            )}

            {captureStage === 1 && (
              <div ref={recordStageRef} tabIndex={-1} role="region" className="capture-card record-card" aria-labelledby="record-stage-title">
                <span className="section-kicker">STEP 02 · 3분 회고</span>
                <h2 id="record-stage-title">한 번에 말씀해주세요.</h2>
                <p>아래 질문은 말하기 힌트입니다. 해당 없는 내용은 생략해도 됩니다.</p>
                <div className="reflection-guide" aria-label="말하기 가이드">
                  <div className="reflection-guide-grid">
                    {REFLECTION_QUESTIONS.map((question, index) => (
                      <article key={question}>
                        <span aria-hidden="true">{index + 1}</span>
                        <b>{question}</b>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="record-context-summary" aria-label="선택한 작업"><span>{draft.workOrder}</span><b>{draft.product}</b><small>{draft.process} · {draft.equipment}</small></div>
                <p className="recording-safety-note">개인정보·기밀정보는 말하지 마세요. 이 앱은 원음 파일을 저장하지 않습니다.</p>
                <div className={`recorder ${recording ? "recording" : ""} ${finalizingRecording ? "finalizing" : ""}`}>
                  <button type="button" disabled={processing || finalizingRecording} aria-pressed={recording} aria-label={finalizingRecording ? "마지막 음성 반영 중" : recording ? "녹음 중지" : transcript.trim() ? "기존 내용에 이어 녹음" : "녹음 시작"} onClick={recording ? () => finalizeRecording("녹음을 종료했습니다. 기존 입력은 보존되며 다시 누르면 뒤에 이어집니다.") : startRecording}><i /><span>{finalizingRecording ? "마무리 중" : recording ? "멈추기" : transcript.trim() ? "이어서 말하기" : "눌러서 말하기"}</span></button>
                  <div className="recorder-wave" aria-hidden="true">
                    {[14, 30, 22, 43, 18, 36, 26, 49, 32, 17, 40, 24, 34, 16, 29, 45, 21, 33, 15].map((height, index) => <i key={index} style={{ height: recording ? `${height}px` : "4px", animationDelay: `${index * 45}ms` }} />)}
                  </div>
                  <strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><small>한 번의 회고 · 최대 03:00</small>
                </div>
                <div className="record-secondary-actions">
                  <button className="sample-shortcut" type="button" disabled={processing || recording || finalizingRecording || saving} onClick={() => { setSpeechNotice("AI를 사용하지 않는 한 번의 회고 샘플 흐름입니다."); continueWithSample(demoReflectionTranscript); }}><span aria-hidden="true">◇</span><b>마이크 없이 샘플로 체험</b><i>SAMPLE · AI 미사용</i></button>
                  <button className="no-issues-shortcut" type="button" disabled={processing || recording || finalizingRecording || saving} onClick={() => void completeNoIssuesReflection()}><span aria-hidden="true">✓</span><b>이 작업은 특이사항 없음</b><i>{saving ? "공유 서버 저장 중…" : "바로 완료 →"}</i></button>
                </div>
                <details className="privacy-notice">
                  <summary><span>녹음·전사 데이터 처리 방식</span><i>자세히</i></summary>
                  <p>이 MVP에는 개인평가 기능이 없습니다. 음성은 브라우저 음성 서비스에서 처리될 수 있습니다. AI 모드에서는 전사문이 OpenAI에 <code>store:false</code>로 전송되고, 규칙 모드에서는 실제 전사문을 규칙으로 구조화합니다. 완료된 LIVE 기록과 참여 기록은 기기 간 공유를 위해 서버에 저장하며, SAMPLE 카드만 이 브라우저에 저장합니다. 실제 개인정보와 기밀정보는 입력하지 마세요.</p>
                </details>
                {transcript.trim() && !recording && !finalizingRecording && <p className="transcript-append-note">추가 녹음은 현재 내용 뒤에 새 줄로 이어집니다.</p>}
                <label className="transcript-field"><span>3분 회고 전체 전사문 <small>{finalizingRecording ? "마지막 음성 반영 중" : recording ? "녹음 중 자동 갱신" : `직접 수정 가능 · ${transcript.length.toLocaleString()}/${MAX_TRANSCRIPT_CHARACTERS.toLocaleString()}자`}</small></span><textarea maxLength={MAX_TRANSCRIPT_CHARACTERS} readOnly={recording || finalizingRecording} value={transcript} onChange={(event) => { setTranscript(event.target.value); setAnalysisError(""); setSpeechNotice(""); }} placeholder="예: 오늘 A모델 50개 중 3개에서 누설이 났습니다. 실링 고무가 안쪽으로 밀려 있어 다시 끼우고 검사하니 모두 통과했습니다. 다음 작업자는 실링 위치를 먼저 확인해주세요." /></label>
                <div className="transcript-tools" aria-live="polite">
                  {speechNotice && <p role="status">{speechNotice}</p>}
                  <div>{transcript.trim() && <button className="reset-transcript" type="button" disabled={processing || recording || finalizingRecording} onClick={clearTranscriptForRestart}>전사문 지우기</button>}</div>
                </div>
                {transcriptReviewRequired && <div className="transcript-review-warning" role="alert"><p><b>마지막 문장을 확인해주세요.</b><span>음성 종료가 정상 확인되지 않아 끝부분이 누락됐을 수 있습니다.</span></p><button type="button" onClick={() => { setTranscriptReviewRequired(false); setAnalysisError(""); setSpeechNotice("전사문 확인을 완료했습니다."); }}>전사문 확인 완료</button></div>}
                {processing && <div className="analysis-status" role="status">현장 기록을 구조화하고 있습니다. 잠시만 기다려주세요.</div>}
                {analysisError && (
                  <div className="analysis-error" role="alert">
                    <div><b>실제 입력 구조화에 실패했습니다.</b><p>{analysisError}</p></div>
                    <div className="error-actions"><button type="button" disabled={processing} onClick={() => void analyzeTranscript("rules")}>현재 전사문을 규칙으로 정리</button><button type="button" onClick={() => continueWithSample(demoReflectionTranscript)}>준비된 샘플로 전환</button></div>
                  </div>
                )}
                {saveError && (
                  <div className="analysis-error" role="alert">
                    <div><b>참여 기록을 저장하지 못했습니다.</b><p>{saveError}</p></div>
                    <button type="button" disabled={saving} onClick={() => void completeNoIssuesReflection()}>다시 시도</button>
                  </div>
                )}
                <div className="button-row">
                  <button className="ghost-action" type="button" disabled={recording || finalizingRecording || processing} onClick={returnToContextSelection}>← 현장 선택</button>
                  <button className="wide-primary inline" type="button" disabled={processing || recording || finalizingRecording || transcriptReviewRequired || !transcript.trim()} onClick={() => void analyzeTranscript()}>{finalizingRecording ? "마지막 음성 반영 중…" : transcriptReviewRequired ? "전사문 확인 필요" : processing ? "회고를 구조화하는 중…" : isNoIssueTranscript(transcript) ? "특이사항 없음으로 회고 완료" : "전체 회고 구조화"}<span>→</span></button>
                </div>
              </div>
            )}

            {captureStage === 2 && (
              <div className="capture-card review-draft-card">
                <span className="section-kicker">STEP 03</span><h2>중요한 내용만 확인해주세요.</h2><p>{structureMeta?.mode === "ai" ? "실제 AI가 정리한 초안입니다. 확인 필요 항목과 필수값을 작업자가 확인해야 저장됩니다." : structureMeta?.mode === "rules" ? "실제 전사문을 규칙으로 정리한 초안입니다. 모든 필드를 원문과 대조해주세요." : "AI를 사용하지 않은 SAMPLE 초안입니다. 모든 항목을 직접 확인해주세요."}</p>
                <div className={`confidence-banner ${structureMeta?.mode === "sample" ? "sample" : ""}`}>
                  <span>{structureMeta?.mode === "ai" ? "AI 근거 완전성 자체평가 · 정확도 아님" : structureMeta?.mode === "rules" ? "규칙 기반 실제 입력" : "샘플 결과"}</span>
                  <strong>{structureMeta?.mode === "ai" ? `${structureMeta.confidence}%` : structureMeta?.mode === "rules" ? "RULES" : "AI 미사용"}</strong>
                  <i><b style={{ width: structureMeta?.mode === "ai" ? `${structureMeta.confidence}%` : "0%" }} /></i>
                  <small>{structureMeta?.mode === "sample" ? "전체 필드 직접 확인" : `${fieldsNeedingReview.length}개 필드 확인 필요`}</small>
                </div>
                {fieldsNeedingReview.length > 0 && <div className="review-field-list"><b>확인 대상</b>{fieldsNeedingReview.map((field) => <span key={field}>{REVIEW_FIELD_LABELS[field]}</span>)}</div>}
                <details className="reflection-source" open>
                  <summary>작업자 3분 회고 원문 다시 보기</summary>
                  <div className="reflection-transcript"><p>{transcript.trim() || "언급 없음"}</p><small>세 질문은 별도 답변란이 아닌 말하기 가이드입니다.</small></div>
                </details>
                <div className="structure-boundary-note"><b>AI는 작업자의 답을 대신 만들지 않습니다.</b><span>원문에 없는 값은 비워두고 ‘언급 없음 · 확인 필요’로 표시합니다. 작업자가 확인한 뒤에만 저장됩니다.</span></div>
                <div className="draft-form">
                  <label className={fieldsNeedingReview.includes("kind") ? "critical" : undefined}><span>기록 유형 {fieldsNeedingReview.includes("kind") && <b>확인 필요</b>}</span><select value={draft.kind} onChange={(event) => updateDraftField("kind", event.target.value as KnowledgeCard["kind"])}><option>문제</option><option>개선</option><option>노하우</option></select></label>
                  <label><span>작업지시 <b className="worker-confirmed">작업자 선택 · 고정</b></span><input readOnly value={draft.workOrder} /></label>
                  <label><span>품목 <b className="worker-confirmed">작업자 선택 · 고정</b></span><input readOnly value={draft.product} /></label>
                  <label className={fieldsNeedingReview.includes("process") ? "critical" : undefined}><span>공정 <b className="worker-confirmed">작업자 선택 · 고정</b></span><input readOnly value={draft.process} /></label>
                  <label className={fieldsNeedingReview.includes("equipment") ? "critical" : undefined}><span>설비·라인 <b className="worker-confirmed">작업자 선택 · 고정</b></span><input readOnly value={draft.equipment} /></label>
                  <label className={fieldsNeedingReview.includes("quantity") ? "critical" : undefined}><span>작업 수량 {fieldsNeedingReview.includes("quantity") && <b>확인 필요</b>}</span><input maxLength={2000} placeholder="언급 없음 · 확인 필요" value={draft.quantity} onChange={(event) => updateDraftField("quantity", event.target.value)} /></label>
                  <label className={fieldsNeedingReview.includes("defect") ? "critical" : undefined}><span>불량 수량 {fieldsNeedingReview.includes("defect") && <b>확인 필요</b>}</span><input maxLength={2000} placeholder="언급 없음 · 확인 필요" value={draft.defect} onChange={(event) => updateDraftField("defect", event.target.value)} /></label>
                  <label className={`full ${fieldsNeedingReview.includes("symptom") ? "critical" : ""}`}><span>증상 {fieldsNeedingReview.includes("symptom") && <b>확인 필요</b>}</span><input maxLength={2000} placeholder="언급 없음 · 확인 필요" value={draft.symptom} onChange={(event) => updateDraftField("symptom", event.target.value)} /></label>
                  <label className={`full ${fieldsNeedingReview.includes("cause") ? "critical" : ""}`}><span>원인 가설 {fieldsNeedingReview.includes("cause") && <b>확인 필요</b>} <small>승인 전에는 사실로 확정되지 않습니다</small></span><textarea maxLength={2000} placeholder="언급 없음 · 확인 필요" value={draft.cause} onChange={(event) => updateDraftField("cause", event.target.value)} /></label>
                  <label className={`full ${fieldsNeedingReview.includes("action") ? "critical" : ""}`}><span>조치 {fieldsNeedingReview.includes("action") && <b>확인 필요</b>}</span><textarea maxLength={2000} placeholder="언급 없음 · 확인 필요" value={draft.action} onChange={(event) => updateDraftField("action", event.target.value)} /></label>
                  <label className={`full ${fieldsNeedingReview.includes("result") ? "critical" : ""}`}><span>결과 {fieldsNeedingReview.includes("result") && <b>확인 필요</b>}</span><input maxLength={2000} placeholder="언급 없음 · 확인 필요" value={draft.result} onChange={(event) => updateDraftField("result", event.target.value)} /></label>
                </div>
                {missingRequiredFields.length > 0 && <p className="required-field-warning" role="alert">이 기록 유형의 필수 입력: {missingRequiredFields.map((field) => DRAFT_FIELD_LABELS[field]).join(", ")}</p>}
                {contentValidationError && <p className="required-field-warning" role="alert">{contentValidationError}</p>}
                {numericValidationError && <p className="required-field-warning" role="alert">{numericValidationError}</p>}
                {saveError && <div className="analysis-error" role="alert"><div><b>공유 서버 저장에 실패했습니다.</b><p>{saveError}</p></div><button type="button" disabled={saving} onClick={() => void saveDraft()}>다시 시도</button></div>}
                <label className="confirm-check" htmlFor="critical-field-confirm" aria-label="구조화 초안 확인"><input id="critical-field-confirm" type="checkbox" disabled={draftHasErrors} checked={criticalConfirmed} onChange={(event) => setCriticalConfirmed(event.target.checked)} /><span><b>확인 대상과 필수값을 원문과 대조했습니다.</b><small>값을 수정하면 다시 확인해야 하며, 저장 후 관리자 검토를 거쳐 공식 지식이 됩니다.</small></span></label>
                <div className="button-row"><button className="ghost-action" type="button" disabled={saving} onClick={() => { setAnalysisError(""); setSaveError(""); setStructureMeta(null); setCriticalConfirmed(false); setCaptureStage(1); }}>← 다시 말하기</button><button className="wide-primary inline" type="button" disabled={!criticalConfirmed || draftHasErrors || saving} onClick={() => void saveDraft()}>{saving ? "공유 서버에 저장 중…" : structureMeta?.mode === "sample" ? "SAMPLE 카드로 저장" : "검토 요청으로 저장"} <span>→</span></button></div>
              </div>
            )}

            {captureStage === 3 && (
              <div className="capture-card success-card">
                <div className="success-mark">✓</div>
                {completionMode === "no-issues" ? (
                  <>
                    <span className="section-kicker">CHECK-IN SAVED</span><h2>오늘 회고를 완료했습니다.</h2><p>특이사항 없음으로 참여만 기록했습니다. 관리자 승인과 지식 카드는 생성되지 않습니다.</p>
                    <div className="saved-mode no-issues">NO ISSUE · AI 미사용</div>
                    <div className="saved-summary"><span className="no-issue-summary-mark">✓</span><div><b>이 작업은 특이사항 없음</b><small>{latestNoIssueCheckIn?.workOrder ?? draft.workOrder} · {latestNoIssueCheckIn?.product ?? draft.product}<br />{latestNoIssueCheckIn?.equipment ?? draft.equipment} · {latestNoIssueCheckIn && latestNoIssueCheckIn.durationSeconds > 0 ? `회고 ${Math.floor(latestNoIssueCheckIn.durationSeconds / 60)}분 ${latestNoIssueCheckIn.durationSeconds % 60}초` : "바로 완료"}</small></div><span className="status-chip 승인">참여 완료</span></div>
                  </>
                ) : (
                  <>
                    <span className="section-kicker">SAVED</span><h2>현장의 경험을 남겼습니다.</h2><p>관리자가 확인하면 모두가 검색할 수 있는 현장 지식이 됩니다.</p>
                    <div className={`saved-mode ${structureMeta?.mode === "sample" ? "sample" : "live"}`}>{structureModeLabel(structureMeta?.mode ?? "sample", structureMeta?.confidence)}</div>
                    <div className="saved-summary"><span className={`kind-mark ${draft.kind}`}>{draft.kind}</span><div><b>{draft.process} — {draftTitleDetail}</b><small>{draft.workOrder} · {draft.product}<br />{draft.equipment} · 방금 전</small></div><span className="status-chip 검토-대기">검토 대기</span></div>
                  </>
                )}
                <div className="success-actions"><button className="wide-primary" type="button" onClick={() => resetCaptureState()}>하나 더 기록하기 <span>+</span></button><button className="ghost-action" type="button" onClick={() => changeView("dashboard")}>오늘의 현장으로</button></div>
              </div>
            )}
          </section>
        )}

        {view === "review" && (
          <section className="workspace-view review-view">
            <div className="view-heading"><div><p>TAID KNOWLEDGE · LIVE + SAMPLE</p><h1>지식 승인함 <span>{pendingCards.length}</span></h1></div><p className="heading-note">실제 입력 기반 초안을 관리자가 검증한 뒤에만<br />공식 현장 지식으로 게시합니다.</p></div>
            <div className="review-layout">
              <div className="review-queue">
                <div className="queue-filter"><b>검토 대기</b><span>{pendingCards.length}건</span><button type="button" onClick={() => setToast("프로토타입은 현재 등록 순서로 표시합니다.")}>등록 순⌄</button></div>
                {pendingCards.length === 0 && <div className="empty-state">모든 검토를 마쳤습니다.</div>}
                {pendingCards.map((card) => (
                  <button type="button" className={`queue-item ${selectedCardId === card.id ? "active" : ""}`} key={card.id} onClick={() => { setSelectedCardId(card.id); setStatusError(""); setRejectionReason(""); }}>
                    <div><span className={`kind-mark ${card.kind}`}>{card.kind}</span><small>{cardDisplayId(card)}</small></div><b>{card.title}</b><p>{card.workOrder} · {card.product}<br />{card.process} · {card.author}</p><footer><span>{structureModeLabel(card.structureMode, card.confidence)}</span><span>{card.createdAt}</span></footer>
                  </button>
                ))}
              </div>
              {selectedCard && (
                <article className="review-detail">
                  <header><div><span className={`kind-mark ${selectedCard.kind}`}>{selectedCard.kind}</span><span>{cardDisplayId(selectedCard)}</span></div><h2>{selectedCard.title}</h2><p>{selectedCard.workOrder} · {selectedCard.product}<br />{selectedCard.equipment} · {selectedCard.author} · {selectedCard.createdAt}</p></header>
                  <div className="source-block"><span>작업자 3분 회고 원문</span><div className="source-transcript"><p>{selectedCard.sourceAnswers.filter((source) => source.trim()).join("\n\n") || "언급 없음"}</p></div><small>{structureModeLabel(selectedCard.structureMode)} · {selectedCard.id < 0 ? "로컬 데모 카드" : "공유 서버 기록"} · 원음 파일은 앱에 저장하지 않음</small></div>
                  <dl className="knowledge-fields">
                    <div><dt>작업 수량</dt><dd>{selectedCard.quantity || "언급 없음"}</dd></div><div><dt>불량 수량</dt><dd>{selectedCard.defect || "언급 없음"}</dd></div><div><dt>상황·증상</dt><dd>{selectedCard.symptom}</dd></div><div><dt>원인 가설</dt><dd>{selectedCard.cause}<small>관리자 확인 필요</small></dd></div><div><dt>실행한 조치</dt><dd>{selectedCard.action}</dd></div><div><dt>확인된 결과</dt><dd>{selectedCard.result}</dd></div>
                  </dl>
                  {selectedCard.status === "검토 대기" ? (
                    <>
                      {selectedCard.id > 0 && (
                        <div className="draft-form">
                          <label><span>검토자 코드</span><input autoComplete="off" maxLength={32} placeholder="예: REVIEW-01" value={reviewerCode} onChange={(event) => { setReviewerCode(event.target.value.toUpperCase()); setStatusError(""); }} /></label>
                          <label><span>반려 사유 <small>보완 요청 시 필수</small></span><input maxLength={500} placeholder="보완이 필요한 내용을 입력하세요" value={rejectionReason} onChange={(event) => { setRejectionReason(event.target.value); setStatusError(""); }} /></label>
                        </div>
                      )}
                      {statusError && <div className="analysis-error" role="alert"><div><b>검토 상태를 저장하지 못했습니다.</b><p>{statusError}</p></div><button type="button" onClick={() => void loadServerData()}>공유 데이터 새로고침</button></div>}
                      <footer className="approval-actions"><button type="button" disabled={statusUpdatingId === selectedCard.id} onClick={() => void updateStatus(selectedCard.id, "반려")}>↩ {statusUpdatingId === selectedCard.id ? "처리 중…" : "보완 요청"}</button><button type="button" disabled={statusUpdatingId === selectedCard.id} onClick={() => void updateStatus(selectedCard.id, "승인")}>✓ {statusUpdatingId === selectedCard.id ? "처리 중…" : "확인하고 지식으로 승인"}</button></footer>
                    </>
                  ) : (
                    <div className={`review-status-note ${selectedCard.status === "승인" ? "approved" : "rejected"}`}><b>{selectedCard.status === "승인" ? "승인 완료" : "보완 요청됨"}</b><span>처리된 카드는 승인함에서 다시 상태를 변경할 수 없습니다.</span></div>
                  )}
                </article>
              )}
            </div>
          </section>
        )}

        {view === "knowledge" && (
          <section className="workspace-view knowledge-view">
            <div className="view-heading"><div><p>APPROVED KNOWLEDGE · LIVE + SAMPLE</p><h1>현장 지식 검색</h1></div><div className="knowledge-stat"><strong>{liveOverview?.approvedRecords ?? 0}</strong><span>LIVE 누적 · 최근 승인 최대 1,000개 검색</span></div></div>
            <div className="coach-box"><span className="coach-mark">T.</span><div><b>승인된 LIVE 지식에서 찾아보세요 <span className="mode-chip sample">KEYWORD RULE · RAG 아님</span></b><p>질문의 핵심어와 일치하는 승인 기록을 찾아 실제 카드 내용을 요약합니다. 근거가 없으면 답을 만들지 않습니다.</p><div><input value={question} onChange={(event) => { setQuestion(event.target.value); setAnswer(""); setAnswerSourceCardId(null); }} onKeyDown={(event) => event.key === "Enter" && askKnowledge()} placeholder="예: 누설 불량 실링 조치는?" /><button type="button" onClick={askKnowledge}>찾아보기 →</button></div></div></div>
            {answer && <div className="coach-answer"><span>TAID 키워드 요약</span><p>{answer}</p>{answerSourceCard && <button type="button" onClick={() => { setSearch(""); setSelectedCardId(answerSourceCard.id); }}>근거 · LIVE #{answerSourceCard.id} {answerSourceCard.title} ↗</button>}</div>}
            <div className="knowledge-toolbar"><div className="search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="증상, 설비, 공정, 원인으로 검색" /></div><button type="button" onClick={() => setToast("공정 필터는 다음 MVP 범위입니다.")}>전체 공정⌄</button><button type="button" onClick={() => setToast("유형 필터는 다음 MVP 범위입니다.")}>전체 유형⌄</button></div>
            <div className="knowledge-layout">
              <div className="knowledge-list">
                {filteredCards.length > 0 && <p className="knowledge-list-label">LIVE 승인 지식 · 공유 서버</p>}
                {filteredCards.map((card) => (
                  <button type="button" className={`knowledge-list-item ${selectedCardId === card.id ? "active" : ""}`} key={card.id} onClick={() => setSelectedCardId(card.id)}><span className={`kind-mark ${card.kind}`}>{card.kind}</span><div><b>{card.title}</b><p>{card.workOrder} · {card.product}<br />{card.process} · {card.equipment} <span className="mode-chip live">{structureModeLabel(card.structureMode)}</span></p></div><span>→</span></button>
                ))}
                {filteredSampleCards.length > 0 && <p className="knowledge-list-label sample">SAMPLE 데모 지식 · LIVE KPI 제외</p>}
                {filteredSampleCards.map((card) => (
                  <button type="button" className={`knowledge-list-item sample ${selectedCardId === card.id ? "active" : ""}`} key={card.id} onClick={() => setSelectedCardId(card.id)}><span className={`kind-mark ${card.kind}`}>{card.kind}</span><div><b>{card.title}</b><p>{card.workOrder} · {card.product}<br />{card.process} · {card.equipment} <span className="mode-chip sample">SAMPLE · AI 미사용</span></p></div><span>→</span></button>
                ))}
                {filteredCards.length === 0 && filteredSampleCards.length === 0 && <div className="empty-state">일치하는 승인 지식이 없습니다.</div>}
              </div>
              {knowledgeSelectedCard && <article className={`knowledge-preview ${knowledgeSelectedCard.structureMode === "sample" ? "sample" : ""}`}><span className={`kind-mark ${knowledgeSelectedCard.kind}`}>{knowledgeSelectedCard.kind}</span><small>{knowledgeSelectedCard.structureMode === "sample" ? `SAMPLE 데모 지식 ${cardDisplayId(knowledgeSelectedCard)} · LIVE KPI 제외` : `승인 지식 #${knowledgeSelectedCard.id} · ${structureModeLabel(knowledgeSelectedCard.structureMode)}`}</small><h2>{knowledgeSelectedCard.title}</h2><p className="knowledge-context">{knowledgeSelectedCard.workOrder} · {knowledgeSelectedCard.product}<br />{knowledgeSelectedCard.process} · {knowledgeSelectedCard.equipment}</p><dl><div><dt>작업·불량 수량</dt><dd>{knowledgeSelectedCard.quantity || "언급 없음"} · {knowledgeSelectedCard.defect || "언급 없음"}</dd></div><div><dt>증상</dt><dd>{knowledgeSelectedCard.symptom || "언급 없음"}</dd></div><div><dt>확인된 원인</dt><dd>{knowledgeSelectedCard.cause || "언급 없음"}</dd></div><div><dt>해결 방법</dt><dd>{knowledgeSelectedCard.action || "언급 없음"}</dd></div><div><dt>검증 결과</dt><dd>{knowledgeSelectedCard.result || "언급 없음"}</dd></div></dl><footer><span>작성 {knowledgeSelectedCard.author}</span><span>{knowledgeSelectedCard.structureMode === "sample" ? "로컬 SAMPLE 승인 · 실제 운영 데이터 아님" : "현장 책임자 승인"}</span></footer></article>}
            </div>
          </section>
        )}
      </main>

      <nav className="mobile-bottom-nav" aria-label="모바일 메뉴">
        {navItems.map((item) => <button type="button" key={item.key} className={view === item.key ? "active" : ""} onClick={() => changeView(item.key)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
      <button className="demo-reset" type="button" onClick={resetDemo}>데모 초기화</button>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
