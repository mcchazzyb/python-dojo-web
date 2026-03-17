const STORAGE_KEY = 'python-dojo-web-progress-v1';

const state = {
  lessons: [],
  currentLessonId: null,
  editor: null,
  autosaveTimer: null,
  pyodide: null,
  runtimeReady: false,
  progress: loadProgress(),
};

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      completed: {},
      attempts: [],
      drafts: {},
      bookmark: null,
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { completed: {}, attempts: [], drafts: {}, bookmark: null };
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
    const prevNeeded = Math.max(1, Math.ceil(prevGroup.length * 0.8));
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
  document.getElementById('hero-stats').innerHTML = `
    <div class="stat"><span>Completed</span><strong>${passed}/${state.lessons.length}</strong></div>
    <div class="stat"><span>Total attempts</span><strong>${state.progress.attempts.length}</strong></div>
    <div class="stat"><span>Resume from</span><strong>${state.progress.bookmark || 'Start'}</strong></div>
    <div class="stat"><span>Saved drafts</span><strong>${Object.keys(state.progress.drafts).length}</strong></div>
  `;
}

function lessonStatusText(lesson) {
  if (!lesson.unlocked) return 'Locked until most of the previous level is done';
  if (lesson.progress.passed) return `Completed · ${lesson.progress.attempts} attempts`;
  if (lesson.bookmarked) return 'Bookmarked to resume';
  if (lesson.has_draft) return 'Draft saved';
  return `${lesson.progress.attempts} attempts so far`;
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
      if (!lesson.unlocked || !state.runtimeReady) return;
      loadLesson(lesson.id);
    });
    root.appendChild(node);
  });
}

function lessonDetailMarkup(lesson) {
  const attempts = state.progress.attempts
    .filter((a) => a.lessonId === lesson.id)
    .slice(-5)
    .reverse()
    .map((a) => `
      <div class="attempt-card">
        <div class="kpi"><span>${a.when}</span><strong class="${a.passed ? 'result-pass' : 'result-fail'}">${a.passed ? 'PASS' : 'FAIL'}</strong></div>
        <p>${a.summary}</p>
      </div>
    `).join('');

  return `
    <div class="lesson-grid">
      <div class="stack">
        <section class="copy-card">
          <div class="pill-row">
            <span class="pill">${lesson.track}</span>
            <span class="pill">Level ${lesson.level}</span>
            <span class="pill">${lesson.xp} XP</span>
          </div>
          <h2>${lesson.title}</h2>
          <p class="muted">${lesson.summary}</p>
          <div class="kpi"><span>Why this matters</span><strong>${lesson.why}</strong></div>
          <div class="kpi"><span>Concepts</span><strong>${lesson.concepts.join(', ')}</strong></div>
          <div class="kpi"><span>Mission</span><strong>${lesson.brief}</strong></div>
          <div class="kpi"><span>Draft status</span><strong>${lesson.has_draft ? 'Saved in this browser' : 'Fresh starter code'}</strong></div>
        </section>
        <section class="editor-card">
          <h2>Write your solution</h2>
          <div id="editor"></div>
          <p class="small">Runs fully in the browser with Pyodide. Drafts autosave locally.</p>
          <div class="actions">
            <button id="run-btn">Run checks</button>
            <button id="bookmark-btn" class="ghost">Bookmark this mission</button>
            <button id="save-btn" class="ghost">Save draft now</button>
            <button id="hint-btn" class="ghost">Need a hint?</button>
          </div>
        </section>
      </div>
      <div class="stack">
        <section class="console-card">
          <h2>Feedback loop</h2>
          <div id="result-box">
            <div class="visual-grid">
              <div class="visual-tile"><strong>Real Python runtime</strong><span class="small">Your code executes in Pyodide, not a fake parser.</span></div>
              <div class="visual-tile"><strong>Portable learning</strong><span class="small">Host this on any static site and it still works.</span></div>
              <div class="visual-tile"><strong>Autosaved drafts</strong><span class="small">You can leave and come back without losing your train of thought.</span></div>
              <div class="visual-tile"><strong>Lesson data</strong><span class="small">Curriculum lives in JSON so it can grow cleanly.</span></div>
            </div>
          </div>
        </section>
        <section class="copy-card">
          <h2>Recent attempts</h2>
          ${attempts || '<p class="muted">No attempts yet. Time to make one.</p>'}
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
  const build = () => {
    state.editor = monaco.editor.create(document.getElementById('editor'), {
      value,
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 15,
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
  state.autosaveTimer = setTimeout(() => saveDraft(true), 1500);
}

function saveDraft(quiet = false) {
  if (!state.currentLessonId || !state.editor) return;
  state.progress.drafts[state.currentLessonId] = currentCode();
  saveProgress();
  if (!quiet) {
    document.getElementById('result-box').innerHTML = `<p class="result-pass"><strong>Draft saved.</strong></p>`;
  }
  computeUnlocks();
  renderStats();
  renderLessonList();
}

async function ensureRuntime() {
  document.getElementById('runtime-status').textContent = 'Loading Python runtime…';
  state.pyodide = await loadPyodide();
  state.runtimeReady = true;
  document.getElementById('runtime-status').textContent = 'Python runtime ready.';
}

async function runChallenge(lesson, code) {
  const python = `
import io, json, contextlib, traceback
namespace = {}
stdout_buffer = io.StringIO()
code = ${JSON.stringify(code)}
tests = ${JSON.stringify(lesson.test_code)}
result = {"passed": False, "summary": "", "output": "", "next_hint": None}
try:
    with contextlib.redirect_stdout(stdout_buffer):
        exec(code, namespace, namespace)
        exec(tests, namespace, namespace)
    result["passed"] = True
    result["summary"] = "Nice — all checks passed."
    result["output"] = stdout_buffer.getvalue()
except AssertionError as exc:
    result["summary"] = f"One of the checks failed: {exc or 'expected result did not match'}"
    result["output"] = stdout_buffer.getvalue()
    hints = ${JSON.stringify(lesson.hints)}
    result["next_hint"] = hints[0] if hints else None
except Exception:
    result["summary"] = "Your code crashed while running the checks."
    result["output"] = stdout_buffer.getvalue() + "\n" + traceback.format_exc(limit=4)
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

  document.getElementById('run-btn').addEventListener('click', async () => {
    const code = currentCode();
    saveDraft(true);
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
      ${result.next_hint ? `<p class="hint">Hint: ${result.next_hint}</p>` : ''}
      <pre>${escapeHtml(result.output || 'No console output.')}</pre>
    `;
    renderStats();
    renderLessonList();
  });

  document.getElementById('bookmark-btn').addEventListener('click', () => {
    state.progress.bookmark = lesson.id;
    saveProgress();
    computeUnlocks();
    renderStats();
    renderLessonList();
  });

  document.getElementById('save-btn').addEventListener('click', () => saveDraft(false));
  document.getElementById('hint-btn').addEventListener('click', () => {
    const hint = lesson.hints?.[0] || 'Try breaking the problem into small steps.';
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
  state.progress = JSON.parse(text);
  saveProgress();
  computeUnlocks();
  renderStats();
  renderLessonList();
  if (state.progress.bookmark) loadLesson(state.progress.bookmark);
}

function resetProgress() {
  if (!confirm('Reset all progress?')) return;
  state.progress = { completed: {}, attempts: [], drafts: {}, bookmark: null };
  saveProgress();
  computeUnlocks();
  renderStats();
  renderLessonList();
  const first = state.lessons.find((item) => item.unlocked);
  if (first) loadLesson(first.id);
}

function escapeHtml(text) {
  return text.replace(/[&<>\"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function init() {
  await Promise.all([fetchLessons(), ensureRuntime()]);
  renderStats();
  renderLessonList();
  const first = state.lessons.find((item) => item.id === state.progress.bookmark && item.unlocked) || state.lessons.find((item) => item.unlocked);
  if (first) loadLesson(first.id);
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
  document.getElementById('runtime-status').textContent = `Failed to start runtime: ${error.message}`;
  console.error(error);
});
