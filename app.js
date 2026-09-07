(() => {
  const STORAGE_KEY = 'weeklyEnglishVocabulary.v1';
  const WORDS_PER_WEEK = 100;

  const emptyState = () => ({
    version: 1,
    weeks: [],
    attempts: [],
    currentWeekId: null,
    examDraft: null,
    settings: { shuffleNewList: true }
  });

  let state = loadState();
  let currentView = isExamLocked() ? 'exam' : 'study';
  let editingList = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return { ...emptyState(), ...JSON.parse(raw) };
    } catch {
      return emptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isExamLocked() {
    return Boolean(state.examDraft && ['spelling', 'meaning', 'result'].includes(state.examDraft.phase));
  }

  function syncExamLockUI() {
    const locked = isExamLocked();
    document.body.classList.toggle('exam-mode-active', locked);

    $$('.tab').forEach(tab => {
      const blocked = locked && tab.dataset.view !== 'exam';
      tab.disabled = blocked;
      tab.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    });

    const badge = $('#exam-lock-badge');
    if (badge) badge.hidden = !locked;

    if (locked && currentView !== 'exam') currentView = 'exam';
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  }

  function formatDateTime(iso) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
  }

  function getCurrentWeek() {
    return state.weeks.find(w => w.id === state.currentWeekId) || state.weeks.at(-1) || null;
  }

  function getWeekAttempts(weekId) {
    return state.attempts.filter(a => a.weekId === weekId).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }

  function usedMasterIds() {
    return new Set(state.weeks.flatMap(w => w.words.map(word => word.masterId).filter(Boolean)));
  }

  function makeWeek() {
    const used = usedMasterIds();
    let candidates = window.MASTER_WORDS.filter(w => !used.has(w.id));

    if (candidates.length < WORDS_PER_WEEK) {
      // 단어 풀을 모두 사용했으면 가장 최근 주의 단어만 제외하고 재사용 가능하게 한다.
      const recent = new Set((getCurrentWeek()?.words || []).map(w => w.masterId));
      candidates = window.MASTER_WORDS.filter(w => !recent.has(w.id));
    }

    const picked = shuffle(candidates).slice(0, Math.min(WORDS_PER_WEEK, candidates.length));
    const weekNo = state.weeks.length ? Math.max(...state.weeks.map(w => w.weekNo)) + 1 : 1;
    const week = {
      id: uid('week'),
      weekNo,
      createdAt: new Date().toISOString(),
      words: picked.map((w, index) => ({
        id: uid(`word${index + 1}`),
        masterId: w.id,
        english: w.english,
        korean: w.korean,
        meanings: [...w.meanings]
      }))
    };

    state.weeks.push(week);
    state.currentWeekId = week.id;
    state.examDraft = null;
    saveState();
    editingList = false;
    renderAll();
  }

  function replaceWord(weekId, wordId) {
    const week = state.weeks.find(w => w.id === weekId);
    if (!week) return;
    const usedInWeek = new Set(week.words.map(w => w.masterId));
    const usedAll = usedMasterIds();
    let candidates = window.MASTER_WORDS.filter(w => !usedAll.has(w.id) && !usedInWeek.has(w.id));
    if (!candidates.length) candidates = window.MASTER_WORDS.filter(w => !usedInWeek.has(w.id));
    if (!candidates.length) return;

    const replacement = candidates[Math.floor(Math.random() * candidates.length)];
    const idx = week.words.findIndex(w => w.id === wordId);
    week.words[idx] = {
      id: uid('word'), masterId: replacement.id,
      english: replacement.english,
      korean: replacement.korean,
      meanings: [...replacement.meanings]
    };
    saveState();
    renderStudy();
  }

  function saveEditedWords() {
    const week = getCurrentWeek();
    if (!week) return;
    $$('#vocab-table tbody tr').forEach(row => {
      const word = week.words.find(w => w.id === row.dataset.wordId);
      if (!word) return;
      const english = $('.edit-en', row)?.value.trim();
      const korean = $('.edit-ko', row)?.value.trim();
      if (english) word.english = english;
      if (korean) {
        word.korean = korean;
        word.meanings = korean.split(/[,/]/).map(v => v.trim()).filter(Boolean);
      }
    });
    saveState();
    editingList = false;
    renderStudy();
  }

  function setView(view) {
    if (isExamLocked() && view !== 'exam') view = 'exam';
    currentView = view;
    syncExamLockUI();
    $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `${view}-view`));
    if (view === 'study') renderStudy();
    if (view === 'exam') renderExam();
    if (view === 'history') renderHistory();
    if (view === 'manage') renderManage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderAll() {
    syncExamLockUI();
    renderStudy();
    renderExam();
    renderHistory();
    renderManage();
  }

  function renderStudy() {
    const root = $('#study-view');
    const week = getCurrentWeek();

    if (!week) {
      root.innerHTML = `
        <div class="panel empty">
          <h3>아직 생성된 단어 목록이 없습니다.</h3>
          <p>부모가 아래 버튼을 누르면 초등 고학년 수준의 단어 풀에서 100개를 선택하여 첫 번째 주간 목록을 만듭니다.</p>
          <button class="btn" id="create-first-week">첫 100단어 만들기</button>
        </div>`;
      $('#create-first-week')?.addEventListener('click', makeWeek);
      return;
    }

    const attempts = getWeekAttempts(week.id);
    const options = state.weeks.map(w => `<option value="${w.id}" ${w.id === week.id ? 'selected' : ''}>Week ${w.weekNo} · ${formatDate(w.createdAt)}</option>`).join('');

    root.innerHTML = `
      <div class="panel">
        <div class="page-head">
          <div>
            <h2>Week ${week.weekNo} 단어 목록</h2>
            <p>영어 단어와 뜻 100개를 한 화면에서 확인하고 공책으로 공부합니다.</p>
          </div>
          <div class="actions">
            ${editingList ? '<button class="btn" id="save-edit">수정 저장</button><button class="btn secondary" id="cancel-edit">취소</button>' : '<button class="btn secondary" id="edit-list">목록 편집</button>'}
            <button class="btn" id="go-exam">시험 보기</button>
          </div>
        </div>
        <div class="meta-row">
          <span class="badge">Week ${week.weekNo}</span>
          <span class="badge gray">생성일 ${formatDate(week.createdAt)}</span>
          <span class="badge ${attempts.length ? 'green' : 'gray'}">시험 ${attempts.length}회</span>
        </div>
        <div class="selector" style="margin-bottom:14px">
          <label for="week-select"><strong>목록 선택</strong></label>
          <select id="week-select">${options}</select>
        </div>
        <div class="table-wrap">
          <table id="vocab-table">
            <thead><tr><th class="num">No.</th><th>English</th><th>한글 의미</th>${editingList ? '<th class="row-actions">교체</th>' : ''}</tr></thead>
            <tbody>
              ${week.words.map((w, i) => `
                <tr data-word-id="${w.id}">
                  <td class="num">${i + 1}</td>
                  <td class="word">${editingList ? `<input class="edit-input edit-en" type="text" value="${escapeHtml(w.english)}">` : escapeHtml(w.english)}</td>
                  <td class="meaning">${editingList ? `<input class="edit-input edit-ko" type="text" value="${escapeHtml(w.korean)}">` : escapeHtml(w.korean)}</td>
                  ${editingList ? `<td class="row-actions"><button class="btn secondary small replace-word" data-word-id="${w.id}">교체</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${editingList ? '<p class="footer-note">한글 뜻을 쉼표(,)로 여러 개 입력하면 시험에서 각각을 정답으로 인정합니다.</p>' : ''}
      </div>`;

    $('#week-select')?.addEventListener('change', e => {
      state.currentWeekId = e.target.value;
      state.examDraft = null;
      editingList = false;
      saveState();
      renderAll();
    });
    $('#go-exam')?.addEventListener('click', () => setView('exam'));
    $('#edit-list')?.addEventListener('click', () => { editingList = true; renderStudy(); });
    $('#cancel-edit')?.addEventListener('click', () => { editingList = false; renderStudy(); });
    $('#save-edit')?.addEventListener('click', saveEditedWords);
    $$('.replace-word').forEach(btn => btn.addEventListener('click', () => replaceWord(week.id, btn.dataset.wordId)));
  }

  function renderExam() {
    const root = $('#exam-view');
    const week = getCurrentWeek();
    if (!week) {
      root.innerHTML = `<div class="panel empty"><h3>먼저 단어 목록을 만들어 주세요.</h3><p>시험은 현재 선택된 주간 단어 목록을 기준으로 출제됩니다.</p><button class="btn" id="exam-create-week">단어 목록 만들기</button></div>`;
      $('#exam-create-week')?.addEventListener('click', makeWeek);
      return;
    }

    const draft = state.examDraft;
    if (!draft || draft.weekId !== week.id) return renderExamStart(root, week);
    if (draft.phase === 'spelling') return renderExamPhase(root, week, 'spelling');
    if (draft.phase === 'meaning') return renderExamPhase(root, week, 'meaning');
    if (draft.phase === 'result') return renderExamResult(root, week, draft);
  }

  function renderExamStart(root, week) {
    const previous = getWeekAttempts(week.id);
    root.innerHTML = `
      <div class="panel exam-intro">
        <div class="page-head">
          <div><h2>Week ${week.weekNo} 시험</h2><p>총 200문제이며 두 단계로 진행합니다.</p></div>
        </div>
        <ol>
          <li><strong>Spelling Test</strong> — 한글 뜻을 보고 영어 단어 100개 입력</li>
          <li><strong>Meaning Test</strong> — 영어 단어를 보고 한글 뜻 100개 입력</li>
          <li>두 시험 모두 완료하면 자동 채점하여 결과와 오답을 저장</li>
        </ol>
        <div class="notice warning">시험 문제 순서는 학습 목록과 다르게 매번 무작위로 섞입니다. 철자 시험은 정확히 일치해야 정답입니다.</div>
        <div class="actions" style="justify-content:flex-start; margin-top:18px">
          <button class="btn" id="start-exam">${previous.length ? '재시험 시작' : '시험 시작'}</button>
        </div>
      </div>`;
    $('#start-exam')?.addEventListener('click', () => {
      state.examDraft = {
        id: uid('attempt'), weekId: week.id, startedAt: new Date().toISOString(), phase: 'spelling',
        spellingOrder: shuffle(week.words.map(w => w.id)),
        meaningOrder: shuffle(week.words.map(w => w.id)),
        spellingAnswers: {}, meaningAnswers: {}, spellingResult: null, meaningResult: null
      };
      saveState();
      syncExamLockUI();
      setView('exam');
    });
  }

  function renderExamPhase(root, week, phase) {
    const draft = state.examDraft;
    const isSpelling = phase === 'spelling';
    const order = isSpelling ? draft.spellingOrder : draft.meaningOrder;
    const answers = isSpelling ? draft.spellingAnswers : draft.meaningAnswers;
    const label = isSpelling ? 'Spelling Test' : 'Meaning Test';
    const sub = isSpelling ? '한글 뜻을 보고 영어 단어를 입력하세요.' : '영어 단어를 보고 한글 뜻을 입력하세요.';

    root.innerHTML = `
      <div class="exam-toolbar">
        <div class="panel" style="padding:12px 16px">
          <div class="page-head" style="margin:0; align-items:center">
            <div><strong>Week ${week.weekNo} · ${label}</strong><div style="color:var(--muted);font-size:12px;margin-top:2px">${sub}</div></div>
            <div class="progress"><span id="answered-count">0</span> / ${order.length}</div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table class="question-table">
            <thead><tr><th>No.</th><th>문제</th><th>답안</th></tr></thead>
            <tbody>
              ${order.map((wordId, i) => {
                const w = week.words.find(x => x.id === wordId);
                return `<tr>
                  <td>${i + 1}</td>
                  <td>${escapeHtml(isSpelling ? w.korean : w.english)}</td>
                  <td><input class="answer-input" type="text" data-word-id="${w.id}" value="${escapeHtml(answers[w.id] || '')}" autocomplete="off" autocapitalize="none" spellcheck="false"></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="actions" style="margin-top:18px">
          <button class="btn secondary" id="cancel-exam">시험 취소</button>
          <button class="btn" id="submit-phase">${isSpelling ? 'Spelling 제출 →' : '최종 채점'}</button>
        </div>
      </div>`;

    const inputs = $$('.answer-input', root);
    const updateCount = () => {
      $('#answered-count').textContent = inputs.filter(i => i.value.trim()).length;
    };
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        answers[input.dataset.wordId] = input.value;
        saveState();
        updateCount();
      });
    });
    updateCount();

    $('#cancel-exam')?.addEventListener('click', () => {
      confirmAction('시험을 취소하시겠습니까?', '현재 입력한 답안은 삭제됩니다.', () => {
        state.examDraft = null; saveState(); syncExamLockUI(); renderExam();
      });
    });

    $('#submit-phase')?.addEventListener('click', () => {
      if (isSpelling) {
        draft.spellingResult = gradeSpelling(week, draft.spellingAnswers);
        draft.phase = 'meaning';
      } else {
        draft.meaningResult = gradeMeaning(week, draft.meaningAnswers);
        draft.phase = 'result';
      }
      saveState();
      renderExam();
      window.scrollTo({ top: 0 });
    });
  }

  function normalizeEnglish(v) {
    return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizeKorean(v) {
    return String(v || '')
      .trim().toLowerCase()
      .replace(/[.!?()\[\]{}'"`~]/g, '')
      .replace(/\s+/g, '')
      .replace(/하다$/g, '하다');
  }

  function gradeSpelling(week, answers) {
    const details = week.words.map(w => {
      const answer = answers[w.id] || '';
      const correct = normalizeEnglish(answer) === normalizeEnglish(w.english);
      return { wordId: w.id, prompt: w.korean, answer, correctAnswer: w.english, correct };
    });
    return { correct: details.filter(x => x.correct).length, total: details.length, details };
  }

  function gradeMeaning(week, answers) {
    const details = week.words.map(w => {
      const answer = answers[w.id] || '';
      const normalized = normalizeKorean(answer);
      const allowed = (w.meanings?.length ? w.meanings : w.korean.split(/[,/]/))
        .map(normalizeKorean).filter(Boolean);
      const correct = normalized.length > 0 && allowed.some(m => normalized === m);
      return { wordId: w.id, prompt: w.english, answer, correctAnswer: w.korean, correct };
    });
    return { correct: details.filter(x => x.correct).length, total: details.length, details };
  }

  function renderExamResult(root, week, draft) {
    const s = draft.spellingResult || gradeSpelling(week, draft.spellingAnswers);
    const m = draft.meaningResult || gradeMeaning(week, draft.meaningAnswers);
    const totalCorrect = s.correct + m.correct;
    const total = s.total + m.total;
    const percent = Math.round((totalCorrect / total) * 1000) / 10;
    const wrong = [
      ...s.details.filter(x => !x.correct).map(x => ({ ...x, type: 'Spelling' })),
      ...m.details.filter(x => !x.correct).map(x => ({ ...x, type: 'Meaning' }))
    ];

    const alreadySaved = state.attempts.some(a => a.id === draft.id);
    if (!alreadySaved) {
      state.attempts.push({
        id: draft.id,
        weekId: week.id,
        completedAt: new Date().toISOString(),
        spellingScore: s.correct,
        spellingTotal: s.total,
        meaningScore: m.correct,
        meaningTotal: m.total,
        totalCorrect,
        total,
        percent,
        wrong
      });
      saveState();
    }

    root.innerHTML = `
      <div class="panel">
        <div class="page-head"><div><h2>Week ${week.weekNo} 시험 결과</h2><p>${formatDateTime(new Date().toISOString())}</p></div></div>
        <div class="result-summary">
          <div class="metric"><span>Spelling</span><strong>${s.correct} / ${s.total}</strong></div>
          <div class="metric"><span>Meaning</span><strong>${m.correct} / ${m.total}</strong></div>
          <div class="metric"><span>Total</span><strong>${percent}%</strong></div>
        </div>
        <div class="actions" style="justify-content:flex-start">
          <button class="btn" id="finish-result">결과 저장하고 종료</button>
          <button class="btn secondary" id="view-history">기록 보기</button>
        </div>
      </div>
      <div class="panel">
        <div class="page-head"><div><h2>오답 ${wrong.length}개</h2><p>틀린 문제만 표시합니다.</p></div></div>
        ${wrong.length ? `<div class="table-wrap"><table><thead><tr><th>구분</th><th>문제</th><th>입력</th><th>정답</th></tr></thead><tbody>
          ${wrong.map(x => `<tr><td>${x.type}</td><td>${escapeHtml(x.prompt)}</td><td class="wrong">${escapeHtml(x.answer || '(미입력)')}</td><td class="correct">${escapeHtml(x.correctAnswer)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="notice">모든 문제를 맞혔습니다.</div>'}
      </div>`;

    $('#finish-result')?.addEventListener('click', () => { state.examDraft = null; saveState(); syncExamLockUI(); setView('study'); });
    $('#view-history')?.addEventListener('click', () => { state.examDraft = null; saveState(); syncExamLockUI(); setView('history'); });
  }

  function scoreClass(percent) {
    if (percent >= 90) return 'score-good';
    if (percent >= 70) return 'score-mid';
    return 'score-low';
  }

  function renderHistory() {
    const root = $('#history-view');
    if (!state.attempts.length) {
      root.innerHTML = `<div class="panel empty"><h3>아직 시험 기록이 없습니다.</h3><p>시험을 완료하면 날짜별 점수와 오답이 여기에 자동 저장됩니다.</p></div>`;
      return;
    }
    const attempts = [...state.attempts].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    root.innerHTML = `
      <div class="panel">
        <div class="page-head"><div><h2>시험 기록</h2><p>행을 누르면 해당 시험의 오답을 볼 수 있습니다.</p></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>시험일</th><th>Week</th><th>Spelling</th><th>Meaning</th><th>Total</th><th>오답</th></tr></thead>
          <tbody>${attempts.map(a => {
            const week = state.weeks.find(w => w.id === a.weekId);
            return `<tr class="history-row" data-attempt-id="${a.id}">
              <td>${formatDateTime(a.completedAt)}</td><td>Week ${week?.weekNo ?? '-'}</td>
              <td>${a.spellingScore}/${a.spellingTotal}</td><td>${a.meaningScore}/${a.meaningTotal}</td>
              <td class="${scoreClass(a.percent)}">${a.percent}%</td><td>${a.wrong?.length ?? 0}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
      <div id="history-detail"></div>`;

    $$('.history-row', root).forEach(row => row.addEventListener('click', () => renderHistoryDetail(row.dataset.attemptId)));
  }

  function renderHistoryDetail(attemptId) {
    const attempt = state.attempts.find(a => a.id === attemptId);
    const week = state.weeks.find(w => w.id === attempt?.weekId);
    const root = $('#history-detail');
    if (!attempt || !root) return;
    root.innerHTML = `
      <div class="panel">
        <div class="page-head"><div><h2>Week ${week?.weekNo ?? '-'} 상세 결과</h2><p>${formatDateTime(attempt.completedAt)} · ${attempt.percent}%</p></div></div>
        ${attempt.wrong?.length ? `<div class="table-wrap"><table><thead><tr><th>구분</th><th>문제</th><th>입력</th><th>정답</th></tr></thead><tbody>
          ${attempt.wrong.map(x => `<tr><td>${x.type}</td><td>${escapeHtml(x.prompt)}</td><td class="wrong">${escapeHtml(x.answer || '(미입력)')}</td><td class="correct">${escapeHtml(x.correctAnswer)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="notice">오답이 없습니다.</div>'}
      </div>`;
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderManage() {
    const root = $('#manage-view');
    const current = getCurrentWeek();
    root.innerHTML = `
      <div class="panel">
        <div class="page-head"><div><h2>관리</h2><p>새로운 주차 생성과 데이터 백업만 제공합니다.</p></div></div>
        <div class="manage-grid">
          <div class="manage-card">
            <h3>새 주간 단어 100개</h3>
            <p>현재까지 사용하지 않은 단어를 우선하여 새 Week를 생성합니다. 기존 목록과 시험 기록은 그대로 보관됩니다.</p>
            <button class="btn" id="new-week">새 100단어 생성</button>
            <p class="footer-note">현재: ${current ? `Week ${current.weekNo}` : '없음'} · 기본 단어 풀 ${window.MASTER_WORDS.length}개</p>
          </div>
          <div class="manage-card">
            <h3>백업 / 복원</h3>
            <p>브라우저를 바꾸거나 다른 기기로 옮길 때 JSON 백업 파일을 사용할 수 있습니다.</p>
            <div class="actions" style="justify-content:flex-start">
              <button class="btn secondary" id="export-data">백업 다운로드</button>
              <label class="btn secondary file-label">백업 복원<input id="import-data" type="file" accept="application/json"></label>
            </div>
          </div>
          <div class="manage-card">
            <h3>데이터 초기화</h3>
            <p>모든 주간 목록과 시험 기록을 삭제하고 처음부터 다시 시작합니다.</p>
            <button class="btn danger" id="reset-data">전체 초기화</button>
          </div>
          <div class="manage-card">
            <h3>저장 방식</h3>
            <p>로그인과 서버 없이 현재 브라우저에만 저장됩니다. iPad와 노트북은 서로 자동 동기화되지 않으므로 기기를 옮길 때 백업/복원을 사용합니다.</p>
          </div>
        </div>
      </div>`;

    $('#new-week')?.addEventListener('click', () => {
      confirmAction('새로운 주간 목록을 만들까요?', '기존 목록은 삭제되지 않고 다음 Week로 100단어가 추가됩니다.', makeWeek, '생성');
    });
    $('#export-data')?.addEventListener('click', exportData);
    $('#import-data')?.addEventListener('change', importData);
    $('#reset-data')?.addEventListener('click', () => {
      confirmAction('모든 데이터를 초기화할까요?', '주간 목록과 모든 시험 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.', () => {
        state = emptyState();
        saveState();
        renderAll();
        setView('study');
      }, '전체 삭제');
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.weeks) || !Array.isArray(data.attempts)) throw new Error('invalid');
        state = { ...emptyState(), ...data, examDraft: null };
        saveState();
        renderAll();
        setView('study');
      } catch {
        alert('올바른 백업 파일이 아닙니다.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function confirmAction(title, message, onConfirm, confirmLabel = '확인') {
    const dialog = $('#confirm-dialog');
    $('#dialog-title').textContent = title;
    $('#dialog-message').textContent = message;
    $('#dialog-confirm').textContent = confirmLabel;
    const handler = () => {
      dialog.removeEventListener('close', handler);
      if (dialog.returnValue === 'confirm') onConfirm();
    };
    dialog.addEventListener('close', handler);
    dialog.showModal();
  }

  $$('.tab').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

  // PWA: GitHub Pages 같은 HTTPS 환경에서는 앱 파일을 캐시하여 홈 화면 설치/오프라인 실행을 지원합니다.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {
        // 로컬/특수 환경에서 등록이 실패하더라도 기존 웹앱 기능은 그대로 사용합니다.
      });
    });
  }

  renderAll();
  setView(currentView);
})();
