import Link from "next/link";

export default function Home() {
  return (
    <main>
      <nav className="site-nav" aria-label="주요 메뉴">
        <Link className="brand" href="/" aria-label="TAID 홈">
          TAID<span>.</span>
        </Link>
        <div className="nav-links">
          <a href="#why">문제와 해법</a>
          <a href="#how">작동 방식</a>
          <Link className="nav-cta" href="/app">
            MVP 체험하기 <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> VOICE-TO-KNOWLEDGE FOR FACTORIES</p>
          <h1>
            현장은 말하고,
            <br />
            공장은 <em>배웁니다.</em>
          </h1>
          <p className="hero-lead">
            작업자의 한마디를 문제·개선·노하우 데이터로 바꾸는
            중소 제조현장용 AI 지식 운영 서비스.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/app">
              3분 기록 시작하기 <span aria-hidden="true">→</span>
            </Link>
            <a className="text-link" href="#how">어떻게 작동하나요?</a>
          </div>
          <div className="trust-row" aria-label="서비스 핵심 원칙">
            <span>설치 없이 스마트폰으로</span>
            <span>중요 수치는 확인 후 저장</span>
            <span>평가가 아닌 개선을 위해</span>
          </div>
        </div>

        <div className="hero-product" aria-label="TAID 음성 기록 제품 미리보기">
          <div className="product-topbar">
            <div className="mini-brand">T.</div>
            <div>
              <b>오늘의 현장 기록</b>
              <span>조립 2팀 · 오후 근무</span>
            </div>
            <span className="live-pill"><i /> 기록 중</span>
          </div>
          <div className="voice-panel">
            <p className="panel-label">작업자의 말</p>
            <blockquote>
              “A모델 조립 50개 완료했고,
              <strong> 3개에서 누설 불량</strong>이 났어요.
              실링 고무 위치가 원인 같아요.”
            </blockquote>
            <div className="wave" aria-hidden="true">
              {[14, 28, 19, 38, 24, 44, 31, 18, 35, 23, 41, 16, 29, 12].map((h, index) => (
                <span key={index} style={{ height: `${h}px` }} />
              ))}
            </div>
          </div>
          <div className="structured-card">
            <div className="card-title-row">
              <p className="panel-label">AI가 정리한 기록</p>
              <span className="confidence">검토 필요 1건</span>
            </div>
            <dl>
              <div><dt>공정</dt><dd>A모델 조립</dd></div>
              <div><dt>생산량</dt><dd>50개 <span className="verified">확인</span></dd></div>
              <div><dt>문제</dt><dd>누설 불량 3개</dd></div>
              <div><dt>추정 원인</dt><dd>실링 고무 위치</dd></div>
            </dl>
            <button type="button">내용 확인하고 저장 <span aria-hidden="true">→</span></button>
          </div>
          <div className="product-caption">
            <span>01</span>
            <p><b>말이 끝나면 기록도 끝.</b><br />숫자와 품목만 다시 확인합니다.</p>
          </div>
        </div>
      </section>

      <section className="problem-strip" id="why">
        <p>사람이 일하는 공장에는 기록되지 않은 데이터가 있습니다.</p>
        <div><strong>말</strong><span>→</span><strong>데이터</strong><span>→</span><strong>지식</strong><span>→</span><strong>실행</strong></div>
      </section>

      <section className="steps-section" id="how">
        <div className="section-heading">
          <p className="eyebrow"><span /> HOW IT WORKS</p>
          <h2>복잡한 입력 대신,<br />세 번의 자연스러운 대화.</h2>
        </div>
        <div className="step-grid">
          <article><span>01</span><h3>AI가 묻습니다</h3><p>오늘 어려웠던 점, 새로 알게 된 것, 다음 작업자에게 전할 말을 짧게 질문합니다.</p></article>
          <article><span>02</span><h3>작업자가 말합니다</h3><p>현장 용어 그대로 답하면 공정·문제·원인·조치 후보를 자동으로 구조화합니다.</p></article>
          <article><span>03</span><h3>공장이 배웁니다</h3><p>검토된 기록은 지식 카드가 되고, 같은 문제가 생기면 해결 경험을 다시 꺼내줍니다.</p></article>
        </div>
      </section>

      <section className="loop-section">
        <div className="loop-intro">
          <p className="eyebrow"><span /> ONE CLOSED LOOP</p>
          <h2>메모로 끝나지 않고,<br /><em>해결까지 이어집니다.</em></h2>
          <p>음성 인식은 시작일 뿐입니다. TAID는 현장의 말이 담당 업무가 되고, 검증된 해결 경험으로 다시 쓰이는 과정 전체를 설계합니다.</p>
          <Link className="primary-button light" href="/app">실제 흐름 체험하기 <span>→</span></Link>
        </div>
        <div className="loop-flow">
          <article><span>01 · CONTEXT</span><b>설비와 공정을 먼저 확인</b><p>QR 또는 직접 선택으로 말의 맥락을 고정합니다.</p></article>
          <article><span>02 · CAPTURE</span><b>60초~3분 음성 회고</b><p>AI가 질문하고 작업자는 현장 용어 그대로 답합니다.</p></article>
          <article><span>03 · VERIFY</span><b>숫자·품목을 사람이 확인</b><p>AI 초안을 바로 확정하지 않고 중요한 값만 다시 봅니다.</p></article>
          <article><span>04 · APPROVE</span><b>관리자가 지식으로 승인</b><p>제보와 공식 지식을 분리해 신뢰도를 유지합니다.</p></article>
          <article><span>05 · REUSE</span><b>유사 문제에서 다시 사용</b><p>승인된 사례만 검색하고 답변의 근거를 표시합니다.</p></article>
        </div>
      </section>

      <section className="product-section" id="product">
        <div className="product-heading">
          <p className="eyebrow"><span /> MVP SCOPE</p>
          <h2>첫 제품은 두 가지에만<br />집중합니다.</h2>
          <p>거대한 스마트공장 구축이 아니라, 지금 가진 스마트폰으로 현장의 경험을 남기고 다시 찾는 일부터 시작합니다.</p>
        </div>
        <div className="module-grid">
          <article className="voice-module">
            <header><span>TAID / VOICE</span><b>01</b></header>
            <div className="module-orb"><i /><i /><i /><i /><i /><strong>말</strong><i /><i /><i /><i /><i /></div>
            <h3>현장의 말을<br />정확한 기록으로.</h3>
            <ul><li>AI가 묻는 3분 회고</li><li>제조 현장 필드 자동 구조화</li><li>중요값 재확인과 원문 근거</li></ul>
          </article>
          <article className="knowledge-module">
            <header><span>TAID / KNOWLEDGE</span><b>02</b></header>
            <div className="stacked-cards" aria-hidden="true"><i /><i /><div><span>APPROVED</span><b>실링 고무 위치 점검</b><small>증상 → 원인 → 조치 → 결과</small></div></div>
            <h3>검증된 경험을<br />모두의 지식으로.</h3>
            <ul><li>관리자 검토·승인 워크플로</li><li>승인 지식만 검색·답변</li><li>반복 문제와 재사용 현황 집계</li></ul>
          </article>
        </div>
      </section>

      <section className="trust-section">
        <div className="trust-title"><p className="eyebrow"><span /> TRUST BY DESIGN</p><h2>기록보다 먼저,<br />신뢰를 설계합니다.</h2></div>
        <div className="trust-principles">
          <article><span>01</span><b>상시 녹음 없음</b><p>작업자가 직접 시작한 순간만 기록합니다.</p></article>
          <article><span>02</span><b>개인평가 미사용</b><p>사람이 아닌 이슈와 공정 개선을 봅니다.</p></article>
          <article><span>03</span><b>AI 초안 명시</b><p>원인 가설과 확정 사실을 구분합니다.</p></article>
          <article><span>04</span><b>승인된 지식만 검색</b><p>근거가 없을 때는 추측하지 않습니다.</p></article>
          <article><span>05</span><b>삭제·보관 선택권</b><p>원음 보관 정책을 회사와 작업자가 확인합니다.</p></article>
          <article><span>06</span><b>수정 이력 보존</b><p>누가 무엇을 확인했는지 추적할 수 있습니다.</p></article>
        </div>
      </section>

      <section className="pilot-section" id="pilot">
        <div>
          <p className="eyebrow"><span /> 90-DAY FIELD PILOT</p>
          <h2>작은 공장 한 곳에서,<br />쓸모부터 증명합니다.</h2>
        </div>
        <div className="pilot-copy">
          <p>8~10명의 작업자와 함께 실제 소음 환경, 핵심 숫자 정확도, 4주차 참여율, 지식 승인과 재사용을 검증합니다.</p>
          <div><span><b>70%</b>4주차 회고 참여율</span><span><b>85%</b>핵심 필드 완전성</span><span><b>0건</b>중대 신뢰·보안 이슈</span></div>
          <Link href="/app">MVP 데모 열기 <span>→</span></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div><Link className="brand" href="/">TAID<span>.</span></Link><p>From Talk to Data.<br />From Data to Knowledge.</p></div>
        <div><b>말하는 현장,<br />배우는 공장.</b></div>
        <div><span>MVP · 2026</span><span>TAID / TALK AI DATA</span></div>
      </footer>
    </main>
  );
}
