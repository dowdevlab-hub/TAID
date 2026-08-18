"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type View = "dashboard" | "capture" | "review" | "knowledge";
type CardStatus = "승인" | "검토 대기" | "반려";

type KnowledgeCard = {
  id: number;
  title: string;
  kind: "문제" | "개선" | "노하우";
  process: string;
  equipment: string;
  symptom: string;
  cause: string;
  action: string;
  result: string;
  author: string;
  createdAt: string;
  status: CardStatus;
  confidence: number;
  structureMode?: "live" | "sample";
  views: number;
};

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
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

type StructureSuccessResponse = {
  ok: true;
  mode: "live";
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
    needsReview: string[];
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
  mode: "live" | "sample";
  confidence: number;
  needsReviewCount: number;
};

const initialCards: KnowledgeCard[] = [
  {
    id: 1042,
    title: "A모델 누설 불량 — 실링 고무 위치 점검",
    kind: "문제",
    process: "A모델 최종 조립",
    equipment: "조립 2라인 · AS-02",
    symptom: "50개 중 3개 누설 검사 불합격",
    cause: "실링 고무가 홈 안쪽으로 약 2mm 밀림",
    action: "실링 삽입 후 손가락으로 둘레 1회 확인, 지그 기준선 추가",
    result: "재작업 3개 정상, 이후 120개 동일 불량 없음",
    author: "김민수",
    createdAt: "오늘 14:32",
    status: "검토 대기",
    confidence: 91,
    structureMode: "sample",
    views: 0,
  },
  {
    id: 1038,
    title: "CNC-03 진동 증가 시 척 체결 순서",
    kind: "노하우",
    process: "정밀 가공",
    equipment: "가공 1라인 · CNC-03",
    symptom: "Ø28 가공 중 진동음과 표면 거칠기 증가",
    cause: "척 2번 조가 먼저 밀착되어 소재 편심 발생",
    action: "1→3→2 순서로 1차 체결 후 토크렌치로 균등 체결",
    result: "진동 해소, 표면조도 Ra 1.4 복귀",
    author: "박성호",
    createdAt: "어제 17:18",
    status: "승인",
    confidence: 96,
    structureMode: "sample",
    views: 18,
  },
  {
    id: 1031,
    title: "포장 라벨 재출력 동선 4분 단축",
    kind: "개선",
    process: "출하 포장",
    equipment: "포장 1라인 · PR-01",
    symptom: "라벨 오류 발생 시 사무실 PC까지 이동",
    cause: "현장 프린터에 승인된 재출력 메뉴가 없음",
    action: "불량 라벨 QR 스캔 후 현장 태블릿에서 1회 재출력",
    result: "건당 처리 6분→2분, 2주간 오출력 없음",
    author: "이수진",
    createdAt: "8월 15일",
    status: "승인",
    confidence: 94,
    structureMode: "sample",
    views: 11,
  },
  {
    id: 1026,
    title: "B모델 토크 편차 원인 후보 정리",
    kind: "문제",
    process: "B모델 조립",
    equipment: "조립 1라인 · AS-01",
    symptom: "체결 토크 8.5~11.2 N·m 편차",
    cause: "렌치 교정 주기 경과 가능성",
    action: "예비 렌치 교체 후 30개 비교 측정 필요",
    result: "확인 진행 중",
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

const demoTranscript =
  "A모델 조립 50개 완료했고 3개에서 누설 불량이 났어요. 확인해 보니 실링 고무가 안쪽으로 밀려 있었습니다. 고무를 홈에 맞춰 다시 끼우고 둘레를 한 번 눌러 확인하니 재검사는 모두 통과했습니다. 다음 작업자도 실링 위치를 먼저 봐주세요.";

const captureSteps = ["현장 선택", "말로 기록", "내용 확인", "저장 완료"];
const STORAGE_KEY = "taid-mvp-cards-v1";

function persistCards(cards: KnowledgeCard[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, cards }));
}

export default function Workspace() {
  const [view, setView] = useState<View>("capture");
  const [cards, setCards] = useState<KnowledgeCard[]>(initialCards);
  const [captureStage, setCaptureStage] = useState(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [structureMeta, setStructureMeta] = useState<StructureMeta | null>(null);
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(initialCards[0].id);
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [toast, setToast] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [draft, setDraft] = useState({
    kind: "문제" as KnowledgeCard["kind"],
    process: "A모델 최종 조립",
    equipment: "조립 2라인 · AS-02",
    quantity: "",
    defect: "",
    symptom: "",
    cause: "",
    action: "",
    result: "",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { version?: number; cards?: KnowledgeCard[] };
          if (parsed.version === 1 && Array.isArray(parsed.cards)) setCards(parsed.cards);
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    const limit = window.setTimeout(() => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // The recognizer may already have stopped itself.
      }
      recognitionRef.current = null;
      setSeconds(180);
      setRecording(false);
      setSpeechNotice("최대 녹음 시간 3분에 도달해 음성 인식을 종료했습니다.");
    }, 180_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(limit);
    };
  }, [recording]);

  useEffect(() => () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore browser-specific shutdown errors during unmount.
    }
    recognitionRef.current = null;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? cards[0];
  const pendingCards = cards.filter((card) => card.status === "검토 대기");
  const approvedCards = cards.filter((card) => card.status === "승인");
  const filteredCards = approvedCards.filter((card) =>
    `${card.title} ${card.process} ${card.equipment} ${card.symptom} ${card.cause} ${card.action}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const metrics = [
    { label: "이번 주 회고", value: "42", unit: "건", delta: "+8 지난주 대비", tone: "orange" },
    { label: "4주차 참여율", value: "74", unit: "%", delta: "목표 70% 통과", tone: "lime" },
    { label: "승인 지식", value: String(approvedCards.length + 27), unit: "개", delta: "이번 주 +6", tone: "plain" },
    { label: "검토 대기", value: String(pendingCards.length), unit: "건", delta: "평균 1.2일", tone: "plain" },
  ];

  function changeView(nextView: View) {
    if (recording) stopRecording();
    if (nextView === "knowledge" && selectedCard?.status !== "승인" && approvedCards[0]) {
      setSelectedCardId(approvedCards[0].id);
    }
    if (nextView === "review" && selectedCard?.status !== "검토 대기" && pendingCards[0]) {
      setSelectedCardId(pendingCards[0].id);
    }
    setView(nextView);
    if (nextView !== "capture") {
      setCaptureStage(0);
      setAnalysisError("");
      setStructureMeta(null);
      setCriticalConfirmed(false);
    }
  }

  function startRecording() {
    setAnalysisError("");
    setSpeechNotice("");
    setSeconds(0);

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
    recognition.onresult = (event) => {
      const nextTranscript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      setTranscript(nextTranscript);
    };
    recognition.onerror = () => {
      setSpeechNotice("음성을 인식하지 못했습니다. 마이크 권한과 브라우저 설정을 확인하거나 내용을 직접 입력해 주세요.");
      setRecording(false);
    };
    recognition.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setRecording(true);
    } catch {
      recognitionRef.current = null;
      setRecording(false);
      setSpeechNotice("마이크를 시작하지 못했습니다. 브라우저 권한을 확인하거나 내용을 직접 입력해 주세요.");
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
  }

  async function analyzeTranscript() {
    const source = transcript.trim();
    if (!source) {
      setAnalysisError("먼저 음성으로 기록하거나 인식된 내용을 직접 입력해주세요.");
      return;
    }

    if (recording) stopRecording();
    setProcessing(true);
    setAnalysisError("");
    setStructureMeta(null);

    try {
      const response = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: source,
          process: draft.process,
          equipment: draft.equipment,
        }),
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

      if (payload.mode !== "live" || !payload.data) {
        throw new Error("AI 서버 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.");
      }

      const data = payload.data;
      if (!Array.isArray(data.needsReview)) {
        throw new Error("AI 서버 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.");
      }
      const confidenceValue = Number(data.confidence);
      const confidence = Number.isFinite(confidenceValue)
        ? Math.max(0, Math.min(100, Math.round(confidenceValue <= 1 ? confidenceValue * 100 : confidenceValue)))
        : 0;
      const needsReviewCount = data.needsReview.length;

      setDraft((current) => ({
        kind: ["문제", "개선", "노하우"].includes(data.kind)
          ? (data.kind as KnowledgeCard["kind"])
          : current.kind,
        process: data.process || current.process,
        equipment: data.equipment || current.equipment,
        quantity: data.quantity,
        defect: data.defect,
        symptom: data.symptom,
        cause: data.cause,
        action: data.action,
        result: data.result,
      }));
      setStructureMeta({ mode: "live", confidence, needsReviewCount });
      setCriticalConfirmed(false);
      setCaptureStage(2);
    } catch (error) {
      setAnalysisError(
        error instanceof TypeError
          ? "AI 서버에 연결하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해주세요."
          : error instanceof Error && error.message
            ? error.message
            : "AI 구조화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setProcessing(false);
    }
  }

  function continueWithSample() {
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
    setStructureMeta({ mode: "sample", confidence: 0, needsReviewCount: 9 });
    setCriticalConfirmed(false);
    setCaptureStage(2);
  }

  function saveDraft() {
    if (!criticalConfirmed) return;
    const newCard: KnowledgeCard = {
      id: Date.now(),
      title: `${draft.process} — ${draft.defect}`,
      kind: draft.kind,
      process: draft.process,
      equipment: draft.equipment,
      symptom: `${draft.quantity} 작업 중 ${draft.symptom}`,
      cause: draft.cause,
      action: draft.action,
      result: draft.result,
      author: "김민수",
      createdAt: "방금 전",
      status: "검토 대기",
      confidence: structureMeta?.mode === "live" ? structureMeta.confidence : 0,
      structureMode: structureMeta?.mode ?? "sample",
      views: 0,
    };
    const nextCards = [newCard, ...cards];
    setCards(nextCards);
    persistCards(nextCards);
    setSelectedCardId(newCard.id);
    setCaptureStage(3);
  }

  function updateStatus(id: number, status: CardStatus) {
    const nextCards = cards.map((card) => (card.id === id ? { ...card, status } : card));
    setCards(nextCards);
    persistCards(nextCards);
    setToast(status === "승인" ? "지식 카드가 현장 지식으로 게시되었습니다." : "작성자에게 보완 요청을 보냈습니다.");
  }

  function askKnowledge() {
    const normalized = question.trim();
    if (!normalized) return;
    const match = approvedCards.find((card) =>
      `${card.title} ${card.symptom} ${card.cause}`.includes("진동"),
    );
    if (/진동|CNC|표면/.test(normalized) && match) {
      setAnswer(
        `CNC-03에서 진동과 표면 거칠기가 함께 증가했다면 척 체결 순서를 먼저 확인하세요. 1→3→2 순서로 1차 체결한 뒤 토크렌치로 균등 체결했을 때 진동이 해소된 승인 사례가 있습니다.`,
      );
    } else {
      setAnswer("승인된 현장 지식에서 충분한 근거를 찾지 못했습니다. 담당 반장에게 확인하고 새 기록으로 남겨 주세요.");
    }
  }

  function resetDemo() {
    setCards(initialCards);
    window.localStorage.removeItem(STORAGE_KEY);
    setToast("데모 데이터를 처음 상태로 되돌렸습니다.");
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="workspace-logo" href="/" aria-label="TAID 홈페이지">
          TAID<span>.</span>
        </Link>
        <span className="mvp-label">INTERACTIVE MVP · SAMPLE DATA</span>
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
          <div><b>박지훈 공장장</b><small>관리자</small></div>
          <span aria-hidden="true">•••</span>
        </button>
      </aside>

      <main className="workspace-main">
        <header className="workspace-mobile-header">
          <Link className="workspace-logo" href="/">TAID<span>.</span> <small>MVP</small></Link>
          <button type="button" onClick={() => changeView("capture")}>+ 새 기록</button>
        </header>

        {view === "dashboard" && (
          <section className="workspace-view dashboard-view">
            <div className="view-heading">
              <div><p>2026년 8월 18일 · 화요일</p><h1>오늘의 현장</h1></div>
              <button className="dark-action" type="button" onClick={() => changeView("capture")}><span>+</span> 새 음성 기록</button>
            </div>

            <div className="pilot-banner">
              <div><span>90일 파일럿</span><b>DAY 28</b></div>
              <p>현장 채택과 데이터 품질을 함께 검증하고 있습니다.</p>
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
                <div className="panel-heading"><div><span className="section-kicker">LIVE FEED</span><h2>방금 들어온 현장 기록</h2></div><button type="button" onClick={() => changeView("review")}>모두 보기 →</button></div>
                <div className="feed-list">
                  {cards.slice(0, 3).map((card) => (
                    <button className="feed-item" type="button" key={card.id} onClick={() => { setSelectedCardId(card.id); setView(card.status === "승인" ? "knowledge" : "review"); }}>
                      <span className={`kind-mark ${card.kind}`}>{card.kind}</span>
                      <div><b>{card.title}</b><p>{card.equipment} · {card.author} · {card.createdAt}</p></div>
                      <span className={`status-chip ${card.status.replace(" ", "-")}`}>{card.status}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="signal-panel">
                <div className="panel-heading"><div><span className="section-kicker">SIGNAL</span><h2>반복 이슈 신호</h2></div></div>
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
                <span className="section-kicker">STEP 01</span><h2>어디에서 있었던 일인가요?</h2><p>설비 QR을 스캔하면 현장 정보가 자동으로 채워집니다.</p>
                <div className="demo-guide"><b>처음 체험하시나요?</b><span>아래의 ‘선택하고 계속’을 누른 뒤, 다음 화면에서 ‘AI 없이 샘플 전체 흐름 체험’을 선택하세요.</span></div>
                <button className="qr-button" type="button" onClick={() => setToast("QR 데모: AS-02 설비를 확인했습니다.")}><span>▦</span><b>설비 QR 스캔</b><small>카메라로 설비 코드를 비춰주세요</small></button>
                <div className="or-line"><span>또는 직접 선택</span></div>
                <div className="field-grid">
                  <label><span>공정</span><select value={draft.process} onChange={(event) => setDraft({ ...draft, process: event.target.value })}><option>A모델 최종 조립</option><option>B모델 조립</option><option>정밀 가공</option><option>출하 포장</option></select></label>
                  <label><span>설비·라인</span><select value={draft.equipment} onChange={(event) => setDraft({ ...draft, equipment: event.target.value })}><option>조립 2라인 · AS-02</option><option>조립 1라인 · AS-01</option><option>가공 1라인 · CNC-03</option></select></label>
                </div>
                <button className="wide-primary" type="button" onClick={() => setCaptureStage(1)}>선택하고 계속 <span>→</span></button>
              </div>
            )}

            {captureStage === 1 && (
              <div className="capture-card record-card">
                <span className="section-kicker">STEP 02 · 질문 1/3</span>
                <h2>오늘 작업에서 어려웠던 점과<br />어떻게 해결했는지 말해주세요.</h2>
                <p>품목, 수량, 증상, 조치를 함께 말하면 더 정확하게 정리할 수 있어요.</p>
                <div className="ai-connection-status"><i aria-hidden="true" />실제 AI 연결 시 구조화</div>
                <div className="privacy-notice"><b>입력 전 확인</b><span>음성 인식은 브라우저 제공자에서 처리될 수 있고, 확인한 텍스트는 구조화를 위해 OpenAI로 전송됩니다. 이 앱은 원음 파일을 저장하지 않습니다. 실제 개인정보와 기밀정보는 입력하지 마세요.</span></div>
                <div className={`recorder ${recording ? "recording" : ""}`}>
                  <button type="button" aria-label={recording ? "녹음 중지" : "녹음 시작"} onClick={recording ? stopRecording : startRecording}><i /><span>{recording ? "멈추기" : "눌러서 말하기"}</span></button>
                  <div className="recorder-wave" aria-hidden="true">
                    {[14, 30, 22, 43, 18, 36, 26, 49, 32, 17, 40, 24, 34, 16, 29, 45, 21, 33, 15].map((height, index) => <i key={index} style={{ height: recording ? `${height}px` : "4px", animationDelay: `${index * 45}ms` }} />)}
                  </div>
                  <strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><small>최대 03:00</small>
                </div>
                <label className="transcript-field"><span>인식된 내용 <small>직접 수정할 수 있어요</small></span><textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setAnalysisError(""); setSpeechNotice(""); }} placeholder="음성을 인식하면 여기에 내용이 표시됩니다." /></label>
                <div className="transcript-tools">
                  {speechNotice && <p role="status">{speechNotice}</p>}
                  <button type="button" onClick={() => { setTranscript(demoTranscript); setSpeechNotice("샘플 문장을 불러왔습니다. 실제 음성 인식 결과가 아닙니다."); }}>샘플 문장 불러오기</button>
                </div>
                <button className="sample-flow-shortcut" type="button" onClick={() => { setTranscript(demoTranscript); setSpeechNotice("AI를 사용하지 않는 샘플 흐름입니다."); continueWithSample(); }}><b>AI 없이 샘플 전체 흐름 체험</b><span>키 설정 전에도 검토·저장·승인 흐름을 바로 볼 수 있습니다. →</span></button>
                {processing && <div className="analysis-status" role="status">AI가 현장 기록을 분석하고 있습니다. 잠시만 기다려주세요.</div>}
                {analysisError && (
                  <div className="analysis-error" role="alert">
                    <div><b>실제 AI 구조화에 실패했습니다.</b><p>{analysisError}</p></div>
                    <button type="button" onClick={continueWithSample}>샘플 결과로 계속</button>
                  </div>
                )}
                <div className="button-row"><button className="ghost-action" type="button" onClick={() => { if (recording) stopRecording(); setAnalysisError(""); setSpeechNotice(""); setCaptureStage(0); }}>← 이전</button><button className="wide-primary inline" type="button" disabled={processing} onClick={analyzeTranscript}>{processing ? "AI가 구조화하는 중…" : "AI로 내용 정리"}<span>→</span></button></div>
              </div>
            )}

            {captureStage === 2 && (
              <div className="capture-card review-draft-card">
                <span className="section-kicker">STEP 03</span><h2>중요한 내용만 확인해주세요.</h2><p>{structureMeta?.mode === "live" ? "실제 AI가 정리한 초안입니다. 숫자와 품목은 작업자가 확인해야 저장됩니다." : "AI를 사용하지 않은 샘플 초안입니다. 모든 항목을 직접 확인해주세요."}</p>
                <div className={`confidence-banner ${structureMeta?.mode === "sample" ? "sample" : ""}`}>
                  <span>{structureMeta?.mode === "live" ? "실제 AI 구조화 신뢰도" : "샘플 결과"}</span>
                  <strong>{structureMeta?.mode === "live" ? `${structureMeta.confidence}%` : "AI 미사용"}</strong>
                  <i><b style={{ width: structureMeta?.mode === "live" ? `${structureMeta.confidence}%` : "0%" }} /></i>
                  <small>{structureMeta?.mode === "live" ? `${structureMeta.needsReviewCount}개 필드 확인 필요` : "전체 필드 직접 확인"}</small>
                </div>
                <div className="draft-form">
                  <label><span>기록 유형</span><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as KnowledgeCard["kind"] })}><option>문제</option><option>개선</option><option>노하우</option></select></label>
                  <label><span>공정</span><input value={draft.process} onChange={(event) => setDraft({ ...draft, process: event.target.value })} /></label>
                  <label className="critical"><span>작업 수량 <b>확인 필요</b></span><input value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></label>
                  <label className="critical"><span>불량 수량 <b>확인 필요</b></span><input value={draft.defect} onChange={(event) => setDraft({ ...draft, defect: event.target.value })} /></label>
                  <label className="full"><span>증상</span><input value={draft.symptom} onChange={(event) => setDraft({ ...draft, symptom: event.target.value })} /></label>
                  <label className="full"><span>원인 가설 <small>승인 전에는 사실로 확정되지 않습니다</small></span><textarea value={draft.cause} onChange={(event) => setDraft({ ...draft, cause: event.target.value })} /></label>
                  <label className="full"><span>조치</span><textarea value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} /></label>
                  <label className="full"><span>결과</span><input value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })} /></label>
                </div>
                <label className="confirm-check" htmlFor="critical-field-confirm" aria-label="품목과 수량 확인"><input id="critical-field-confirm" type="checkbox" checked={criticalConfirmed} onChange={(event) => setCriticalConfirmed(event.target.checked)} /><span><b>품목과 수량을 원래 말한 내용과 대조했습니다.</b><small>확인해야 저장할 수 있으며, 저장 후 관리자 검토를 거쳐 공식 지식이 됩니다.</small></span></label>
                <div className="button-row"><button className="ghost-action" type="button" onClick={() => { setAnalysisError(""); setStructureMeta(null); setCriticalConfirmed(false); setCaptureStage(1); }}>← 다시 말하기</button><button className="wide-primary inline" type="button" disabled={!criticalConfirmed} onClick={saveDraft}>검토 요청으로 저장 <span>→</span></button></div>
              </div>
            )}

            {captureStage === 3 && (
              <div className="capture-card success-card">
                <div className="success-mark">✓</div><span className="section-kicker">SAVED</span><h2>현장의 경험을 남겼습니다.</h2><p>관리자가 확인하면 모두가 검색할 수 있는 현장 지식이 됩니다.</p>
                <div className="saved-summary"><span className="kind-mark 문제">문제</span><div><b>{draft.process} — {draft.defect}</b><small>{draft.equipment} · 방금 전</small></div><span className="status-chip 검토-대기">검토 대기</span></div>
                <div className="success-actions"><button className="wide-primary" type="button" onClick={() => { setCaptureStage(0); setTranscript(""); setAnalysisError(""); setSpeechNotice(""); setStructureMeta(null); setCriticalConfirmed(false); }}>하나 더 기록하기 <span>+</span></button><button className="ghost-action" type="button" onClick={() => changeView("dashboard")}>오늘의 현장으로</button></div>
              </div>
            )}
          </section>
        )}

        {view === "review" && (
          <section className="workspace-view review-view">
            <div className="view-heading"><div><p>TAID KNOWLEDGE</p><h1>지식 승인함 <span>{pendingCards.length}</span></h1></div><p className="heading-note">AI 초안을 관리자가 검증한 뒤에만<br />공식 현장 지식으로 게시합니다.</p></div>
            <div className="review-layout">
              <div className="review-queue">
                <div className="queue-filter"><b>검토 대기</b><span>{pendingCards.length}건</span><button type="button" onClick={() => setToast("프로토타입은 현재 등록 순서로 표시합니다.")}>등록 순⌄</button></div>
                {pendingCards.length === 0 && <div className="empty-state">모든 검토를 마쳤습니다.</div>}
                {pendingCards.map((card) => (
                  <button type="button" className={`queue-item ${selectedCardId === card.id ? "active" : ""}`} key={card.id} onClick={() => setSelectedCardId(card.id)}>
                    <div><span className={`kind-mark ${card.kind}`}>{card.kind}</span><small>#{card.id}</small></div><b>{card.title}</b><p>{card.process} · {card.author}</p><footer><span>{card.structureMode === "live" ? `AI 신뢰도 ${card.confidence}%` : "샘플 결과 · AI 미사용"}</span><span>{card.createdAt}</span></footer>
                  </button>
                ))}
              </div>
              {selectedCard && (
                <article className="review-detail">
                  <header><div><span className={`kind-mark ${selectedCard.kind}`}>{selectedCard.kind}</span><span>#{selectedCard.id}</span></div><h2>{selectedCard.title}</h2><p>{selectedCard.equipment} · {selectedCard.author} · {selectedCard.createdAt}</p></header>
                  <div className="source-block"><span>구조화된 기록 요약</span><blockquote>“{selectedCard.symptom}이 있었고, 확인해 보니 {selectedCard.cause}이었습니다. {selectedCard.action}했고 {selectedCard.result}.”</blockquote><small>브라우저에 저장된 구조화 결과 · 원음 파일은 앱에 저장하지 않음</small></div>
                  <dl className="knowledge-fields">
                    <div><dt>상황·증상</dt><dd>{selectedCard.symptom}</dd></div><div><dt>원인 가설</dt><dd>{selectedCard.cause}<small>관리자 확인 필요</small></dd></div><div><dt>실행한 조치</dt><dd>{selectedCard.action}</dd></div><div><dt>확인된 결과</dt><dd>{selectedCard.result}</dd></div>
                  </dl>
                  <div className="similar-card"><span>유사 지식 1건</span><b>C모델 실링 홈 이탈 방지 체크</b><small>내용 중복도 68% · 승인됨</small></div>
                  <footer className="approval-actions"><button type="button" onClick={() => updateStatus(selectedCard.id, "반려")}>↩ 보완 요청</button><button type="button" onClick={() => updateStatus(selectedCard.id, "승인")}>✓ 확인하고 지식으로 승인</button></footer>
                </article>
              )}
            </div>
          </section>
        )}

        {view === "knowledge" && (
          <section className="workspace-view knowledge-view">
            <div className="view-heading"><div><p>APPROVED KNOWLEDGE ONLY</p><h1>현장 지식 검색</h1></div><div className="knowledge-stat"><strong>{approvedCards.length + 27}</strong><span>검증된 지식</span></div></div>
            <div className="coach-box"><span className="coach-mark">T.</span><div><b>현장 지식에게 물어보세요</b><p>승인된 우리 공장 기록에서만 답하고, 근거가 없으면 모른다고 말합니다.</p><div><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && askKnowledge()} placeholder="예: CNC-03 진동이 커지면 무엇부터 확인하지?" /><button type="button" onClick={askKnowledge}>질문하기 →</button></div></div></div>
            {answer && <div className="coach-answer"><span>TAID 답변</span><p>{answer}</p>{answer.includes("승인 사례") && <button type="button" onClick={() => setSelectedCardId(1038)}>근거 · #1038 CNC-03 진동 증가 시 척 체결 순서 ↗</button>}</div>}
            <div className="knowledge-toolbar"><div className="search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="증상, 설비, 공정, 원인으로 검색" /></div><button type="button" onClick={() => setToast("공정 필터는 다음 MVP 범위입니다.")}>전체 공정⌄</button><button type="button" onClick={() => setToast("유형 필터는 다음 MVP 범위입니다.")}>전체 유형⌄</button></div>
            <div className="knowledge-layout">
              <div className="knowledge-list">
                {filteredCards.map((card) => (
                  <button type="button" className={`knowledge-list-item ${selectedCardId === card.id ? "active" : ""}`} key={card.id} onClick={() => setSelectedCardId(card.id)}><span className={`kind-mark ${card.kind}`}>{card.kind}</span><div><b>{card.title}</b><p>{card.process} · {card.equipment}</p></div><small>조회 {card.views}</small><span>→</span></button>
                ))}
                {filteredCards.length === 0 && <div className="empty-state">일치하는 승인 지식이 없습니다.</div>}
              </div>
              {selectedCard && selectedCard.status === "승인" && <article className="knowledge-preview"><span className={`kind-mark ${selectedCard.kind}`}>{selectedCard.kind}</span><small>승인 지식 #{selectedCard.id}</small><h2>{selectedCard.title}</h2><dl><div><dt>증상</dt><dd>{selectedCard.symptom}</dd></div><div><dt>확인된 원인</dt><dd>{selectedCard.cause}</dd></div><div><dt>해결 방법</dt><dd>{selectedCard.action}</dd></div><div><dt>검증 결과</dt><dd>{selectedCard.result}</dd></div></dl><footer><span>작성 {selectedCard.author}</span><span>현장 책임자 승인</span></footer></article>}
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
