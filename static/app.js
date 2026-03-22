const STORAGE_KEY = 'python-dojo-web-progress-v2';

const state = {
  lessons: [],
  currentLessonId: null,
  editor: null,
  autosaveTimer: null,
  pyodide: null,
  runtimeReady: false,
  runtimeLoading: false,
  progress: loadProgress(),
};

function defaultProgress() {
  return {
    completed: {},
    attempts: [],
    drafts: {},
    bookmark: null,
  };
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultProgress();
  try {
    return { ...defaultProgress(), ...JSON.parse(raw) };
  } catch {
    return defaultProgress();
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

async function fetchLessons() {
  const res = await fetch('./content/lessons.json');
  state.lessons = await res.json();
  computeUnlocks();
}

function computeUnlocks() {
  const grouped = new Map();
  state.lessons.forEach((lesson) => {
    if (!grouped.has(lesson.level)) grouped.set(lesson.level, []);
    grouped.get(lesson.level).push(lesson);
  });
  const levels = [...grouped.keys()].sort((a, b) => a - b);
  levels.forEach((level, index) => {
    const prevLevel = levels[index - 1];
    const prevGroup = grouped.get(prevLevel) || [];
    const prevPassed = prevGroup.filter((item) => state.progress.completed[item.id]).length;
    const prevNeeded = prevGroup.length === 0 ? 0 : Math.max(1, Math.ceil(prevGroup.length * 0.6));
    const unlocked = index === 0 || prevPassed >= prevNeeded;
    grouped.get(level).forEach((lesson) => {
      lesson.progress = {
        passed: !!state.progress.completed[lesson.id],
        attempts: state.progress.attempts.filter((a) => a.lessonId === lesson.id).length,
      };
      lesson.bookmarked = state.progress.bookmark === lesson.id;
      lesson.has_draft = !!state.progress.drafts[lesson.id];
      lesson.unlocked = unlocked;
    });
  });
}

function renderStats() {
  const passed = Object.keys(state.progress.completed).length;
  const current = state.lessons.find((lesson) => lesson.id === state.progress.bookmark);
  document.getElementById('hero-stats').innerHTML = `
    <div class="stat"><span>Completed</span><strong>${passed}/${state.lessons.length}</strong></div>
    <div class="stat"><span>Attempts</span><strong>${state.progress.attempts.length}</strong></div>
    <div class="stat"><span>Current lesson</span><strong>${current?.title || 'Start here'}</strong></div>
    <div class="stat"><span>Saved drafts</span><strong>${Object.keys(state.progress.drafts).length}</strong></div>
  `;
}

function lessonStatusText(lesson) {
  if (!lesson.unlocked) return 'Locked for now';
  if (lesson.progress.passed) return `Done · ${lesson.progress.attempts} attempt${lesson.progress.attempts === 1 ? '' : 's'}`;
  if (lesson.bookmarked) return 'Resume here';
  if (lesson.has_draft) return 'Draft saved';
  if (lesson.progress.attempts > 0) return `${lesson.progress.attempts} attempt${lesson.progress.attempts === 1 ? '' : 's'}`;
  return 'Ready';
}

function renderLessonList() {
  const root = document.getElementById('lesson-list');
  const tpl = document.getElementById('lesson-template');
  root.innerHTML = '';
  state.lessons.forEach((lesson) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('h3').textContent = lesson.title;
    node.querySelector('.summary').textContent = lesson.summary;
    node.querySelector('.track').textContent = lesson.track;
    node.querySelector('.level').textContent = `Level ${lesson.level}`;
    node.querySelector('.xp').textContent = `${lesson.xp} XP`;
    node.querySelector('.lesson-meta').textContent = lessonStatusText(lesson);
    node.classList.toggle('active', lesson.id === state.currentLessonId);
    node.classList.toggle('done', lesson.progress.passed);
    node.classList.toggle('locked', !lesson.unlocked);
    node.addEventListener('click', () => {
      if (!lesson.unlocked) return;
      loadLesson(lesson.id);
    });
    root.appendChild(node);
  });
}

function recentAttemptsMarkup(lesson) {
  const attempts = state.progress.attempts
    .filter((a) => a.lessonId === lesson.id)
    .slice(-5)
    .reverse()
    .map((a) => `
      <div class="attempt-card">
        <div class="kpi"><span>${a.when}</span><strong class="${a.passed ? 'result-pass' : 'result-fail'}">${a.passed ? 'PASS' : 'TRY AGAIN'}</strong></div>
        <p>${a.summary}</p>
      </div>
    `).join('');

  return attempts || '<p class="muted">No attempts yet. Start small and make one.</p>';
}

function lessonDetailMarkup(lesson) {
  return `
    <div class="lesson-grid">
      <div class="stack">
        <section class="copy-card intro-card">
          <div class="pill-row">
            <span class="pill">${lesson.track}</span>
            <span class="pill">Level ${lesson.level}</span>
            <span class="pill">${lesson.xp} XP</span>
          </div>
          <h2>${lesson.title}</h2>
          <p class="muted">${lesson.summary}</p>
          <div class="teach-grid">
            <div class="teach-card">
              <h3>1. Learn the idea</h3>
              <p>${lesson.teach || lesson.why}</p>
            </div>
            <div class="teach-card">
              <h3>2. See an example</h3>
              <pre>${escapeHtml(lesson.example || lesson.starter_code)}</pre>
            </div>
            <div class="teach-card">
              <h3>3. Your tiny task</h3>
              <p>${lesson.brief}</p>
            </div>
          </div>
        </section>
        <section class="editor-card">
          <div class="editor-head">
            <div>
              <h2>Try it</h2>
              <p class="small">Type in the editor, then run the check when you're ready.</p>
            </div>
            <div id="runtime-pill" class="runtime-pill ${state.runtimeReady ? 'ready' : 'loading'}">${state.runtimeReady ? 'Python ready' : 'Loading Python engine…'}</div>
          </div>
          <div id="editor"></div>
          <div class="actions">
            <button id="run-btn" ${state.runtimeReady ? '' : 'disabled'}>${state.runtimeReady ? 'Run check' : 'Loading Python…'}</button>
            <button id="bookmark-btn" class="ghost">Bookmark</button>
            <button id="save-btn" class="ghost">Save draft</button>
            <button id="hint-btn" class="ghost">Show hint</button>
          </div>
        </section>
      </div>
      <div class="stack">
        <section class="console-card">
          <h2>Feedback</h2>
          <div id="result-box">
            <div class="result-welcome">
              <p><strong>Start simple.</strong> Read the idea, copy the pattern, change just one thing, then run the check.</p>
              <ul>
                <li>You do not need to solve a big puzzle.</li>
                <li>You only need the smallest change that makes this lesson pass.</li>
                <li>If it fails, the hint should tell you what to try next.</li>
              </ul>
            </div>
          </div>
        </section>
        <section class="copy-card">
          <h2>Recent attempts</h2>
          ${recentAttemptsMarkup(lesson)}
        </section>
      </div>
    </div>
  `;
}

function createEditor(value) {
  if (state.editor) {
    state.editor.dispose();
    state.editor = null;
  }
  const el = document.getElementById('editor');
  el.innerHTML = '';
  const build = () => {
    state.editor = monaco.editor.create(el, {
      value,
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 16,
      lineNumbersMinChars: 3,
      roundedSelection: true,
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
    });
    state.editor.onDidChangeModelContent(() => queueAutosave());
  };
  if (window.monaco?.editor) build();
  else require(['vs/editor/editor.main'], build);
}

function currentCode() {
  return state.editor ? state.editor.getValue() : '';
}

function queueAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => saveDraft(true), 800);
}

function saveDraft(quiet = false) {
  if (!state.currentLessonId || !state.editor) return;
  state.progress.drafts[state.currentLessonId] = currentCode();
  saveProgress();
  if (!quiet) {
    document.getElementById('result-box').innerHTML = `<p class="result-pass"><strong>Draft saved.</strong> You can come back to this lesson later.</p>`;
  }
  computeUnlocks();
  renderStats();
  renderLessonList();
}

async function ensureRuntime() {
  if (state.runtimeReady || state.runtimeLoading) return;
  state.runtimeLoading = true;
  updateRuntimeStatus('Loading Python engine…');
  try {
    state.pyodide = await loadPyodide();
    state.runtimeReady = true;
    updateRuntimeStatus('Python ready');
    updateRunButton();
  } catch (error) {
    updateRuntimeStatus(`Python failed to load: ${error.message}`);
    throw error;
  } finally {
    state.runtimeLoading = false;
  }
}

function updateRuntimeStatus(text) {
  const status = document.getElementById('runtime-status');
  if (status) status.textContent = text;
  const pill = document.getElementById('runtime-pill');
  if (pill) {
    pill.textContent = text;
    pill.classList.toggle('ready', state.runtimeReady);
    pill.classList.toggle('loading', !state.runtimeReady);
  }
}

function updateRunButton() {
  const btn = document.getElementById('run-btn');
  if (!btn) return;
  btn.disabled = !state.runtimeReady;
  btn.textContent = state.runtimeReady ? 'Run check' : 'Loading Python…';
}

async function runChallenge(lesson, code) {
  const python = `
import io, json, contextlib, traceback
stdout_buffer = io.StringIO()
namespace = {"stdout_buffer": stdout_buffer}
namespace["namespace"] = namespace
code = ${JSON.stringify(code)}
tests = ${JSON.stringify(lesson.test_code)}
result = {"passed": False, "summary": "", "output": "", "next_hint": None}
try:
    with contextlib.redirect_stdout(stdout_buffer):
        exec(code, namespace, namespace)
        exec(tests, namespace, namespace)
    result["passed"] = True
    result["summary"] = "Nice — that worked. On to the next tiny win."
    result["output"] = stdout_buffer.getvalue()
except AssertionError as exc:
    result["summary"] = f"Almost there: {exc or 'the result was not what the lesson expected'}"
    result["output"] = stdout_buffer.getvalue()
    hints = ${JSON.stringify(lesson.hints)}
    result["next_hint"] = hints[0] if hints else None
except Exception:
    result["summary"] = "Python hit an error before the check could pass."
    result["output"] = stdout_buffer.getvalue() + "\\n" + traceback.format_exc(limit=2)
    hints = ${JSON.stringify(lesson.hints)}
    result["next_hint"] = hints[min(1, len(hints)-1)] if hints else None
json.dumps(result)
`;
  const raw = await state.pyodide.runPythonAsync(python);
  return JSON.parse(raw);
}

async function loadLesson(lessonId) {
  state.currentLessonId = lessonId;
  state.progress.bookmark = lessonId;
  saveProgress();
  computeUnlocks();
  renderStats();
  renderLessonList();

  const lesson = state.lessons.find((item) => item.id === lessonId);
  const root = document.getElementById('lesson-view');
  root.classList.remove('empty');
  root.innerHTML = lessonDetailMarkup(lesson);
  createEditor(state.progress.drafts[lesson.id] || lesson.starter_code);
  updateRuntimeStatus(state.runtimeReady ? 'Python ready' : 'Loading Python engine…');
  updateRunButton();

  document.getElementById('run-btn').addEventListener('click', async () => {
    if (!state.runtimeReady) return;
    const code = currentCode();
    saveDraft(true);
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Checking…';
    document.getElementById('result-box').innerHTML = `<p class="small">Running your code…</p>`;
    try {
      const result = await runChallenge(lesson, code);
      state.progress.attempts.push({
        lessonId: lesson.id,
        passed: result.passed,
        summary: result.summary,
        when: new Date().toLocaleString(),
      });
      if (result.passed) {
        state.progress.completed[lesson.id] = true;
      }
      saveProgress();
      computeUnlocks();
      document.getElementById('result-box').innerHTML = `
        <p class="${result.passed ? 'result-pass' : 'result-fail'}"><strong>${result.summary}</strong></p>
        ${result.next_hint ? `<p class="hint"><strong>Try this next:</strong> ${result.next_hint}</p>` : ''}
        <pre>${escapeHtml(result.output || 'No output this time.')}</pre>
      `;
      renderStats();
      renderLessonList();
      root.querySelector('.copy-card:last-child').innerHTML = `<h2>Recent attempts</h2>${recentAttemptsMarkup(lesson)}`;
    } catch (error) {
      document.getElementById('result-box').innerHTML = `
        <p class="result-fail"><strong>The checker crashed.</strong></p>
        <p class="hint">This is a bug in the app, not you.</p>
        <pre>${escapeHtml(error?.stack || error?.message || String(error))}</pre>
      `;
      console.error('runChallenge failed', error);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Run check';
    }
  });

  document.getElementById('bookmark-btn').addEventListener('click', () => {
    state.progress.bookmark = lesson.id;
    saveProgress();
    computeUnlocks();
    renderStats();
    renderLessonList();
    document.getElementById('result-box').innerHTML = `<p class="result-pass"><strong>Bookmarked.</strong> This lesson is now your return point.</p>`;
  });

  document.getElementById('save-btn').addEventListener('click', () => saveDraft(false));
  document.getElementById('hint-btn').addEventListener('click', () => {
    const hint = lesson.hints?.[0] || 'Change one small thing at a time, then run the check again.';
    document.getElementById('result-box').innerHTML = `<p class="hint"><strong>Hint:</strong> ${hint}</p>`;
  });
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'python-dojo-web-progress.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function importProgress(file) {
  const text = await file.text();
  state.progress = { ...defaultProgress(), ...JSON.parse(text) };
  saveProgress();
  computeUnlocks();
  renderStats();
  renderLessonList();
  if (state.progress.bookmark) loadLesson(state.progress.bookmark);
}

function resetProgress() {
  if (!confirm('Reset all progress?')) return;
  state.progress = defaultProgress();
  saveProgress();
  computeUnlocks();
  renderStats();
  renderLessonList();
  const first = state.lessons.find((item) => item.unlocked);
  if (first) loadLesson(first.id);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function init() {
  await fetchLessons();
  renderStats();
  renderLessonList();
  const first = state.lessons.find((item) => item.id === state.progress.bookmark && item.unlocked) || state.lessons.find((item) => item.unlocked);
  if (first) loadLesson(first.id);
  ensureRuntime().catch((error) => console.error(error));
}

document.getElementById('export-btn').addEventListener('click', exportProgress);
document.getElementById('import-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  await importProgress(file);
  event.target.value = '';
});
document.getElementById('reset-btn').addEventListener('click', resetProgress);

init().catch((error) => {
  document.getElementById('runtime-status').textContent = `Failed to start: ${error.message}`;
  console.error(error);
});
