const KEY = 'meu-semestre-v1';
const COLORS = [
  '#6c5ce7',
  '#00b894',
  '#e17055',
  '#0984e3',
  '#fd79a8',
  '#fdcb6e',
  '#e84393',
  '#00cec9',
  '#636e72',
  '#d97757',
  '#788c5d',
  '#6a9bcc',
];

const DEFAULT_STATE = {
  subjects: [],
  absences: [],
  contents: [],
  tasks: [],
};

let appState = loadState();

/** Drops keys the app no longer keeps in the data (the theme is a device preference now). */
function cleanState({ theme, ...state }) {
  return { ...DEFAULT_STATE, ...state };
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return cleanState(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(appState));
  } catch {
    // ignore storage failures
  }
}

// Derived lookups, rebuilt at most once per change: every update replaces
// `appState`, so its identity says whether the cached copy is stale. Renders
// used to rescan every absence for each subject, several times per card.
let derived = null;

const EMPTY_TALLY = Object.freeze({ absences: 0, contents: 0, studied: 0, pending: 0 });

function stateIndex() {
  if (derived?.source === appState) return derived;

  const subjects = new Map();
  const tallies = new Map();
  for (const subject of appState.subjects) {
    subjects.set(subject.id, subject);
    tallies.set(subject.id, { absences: 0, contents: 0, studied: 0, pending: 0 });
  }
  for (const absence of appState.absences) {
    const tally = tallies.get(absence.sid);
    if (tally) tally.absences += Number(absence.count || 0);
  }
  for (const content of appState.contents) {
    const tally = tallies.get(content.sid);
    if (!tally) continue;
    tally.contents += 1;
    if (content.done) tally.studied += 1;
  }
  for (const task of appState.tasks) {
    const tally = tallies.get(task.sid);
    if (tally && !task.done) tally.pending += 1;
  }

  derived = { source: appState, subjects, tallies };
  return derived;
}

/** Per-subject counts: absences taken, contents (and studied ones), pending tasks. */
function tally(subjectId) {
  return stateIndex().tallies.get(subjectId) || EMPTY_TALLY;
}

function getSubject(subjectId) {
  return stateIndex().subjects.get(subjectId);
}

function getContent(contentId) {
  return appState.contents.find((content) => content.id === contentId);
}

function getTask(taskId) {
  return appState.tasks.find((task) => task.id === taskId);
}

function replaceState(nextState) {
  appState = cleanState(nextState);
  saveState();
}

function updateState(mutator) {
  appState = mutator(appState);
  saveState();
}

/**
 * Removes every record that matches, per collection (`{ tasks: (task) => … }`),
 * and returns `[collection, index, record]` entries for `putBackRecords`.
 */
function takeRecords(tests) {
  const taken = [];
  updateState((current) => {
    const next = { ...current };
    for (const [key, test] of Object.entries(tests)) {
      next[key] = current[key].filter((record, index) => {
        if (!test(record)) return true;
        taken.push([key, index, record]);
        return false;
      });
    }
    return next;
  });
  return taken;
}

/**
 * Undoes `takeRecords` against the current state, not a snapshot: whatever
 * changed meanwhile is kept. Entries come in ascending index order per
 * collection, so each record lands back in its old position.
 */
function putBackRecords(taken) {
  updateState((current) => {
    const next = { ...current };
    for (const [key, index, record] of taken) {
      if (next[key] === current[key]) next[key] = [...current[key]];
      if (next[key].some((other) => other.id === record.id)) continue;
      next[key].splice(Math.min(index, next[key].length), 0, record);
    }
    return next;
  });
}

// Device preferences (theme, last backup) live apart from the data: they do
// not belong in a backup, and the inline script in index.html reads the theme
// before the first paint without parsing the whole state.
const PREFS_KEY = 'meu-semestre-prefs';

let prefs = loadPrefs();

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function setPref(key, value) {
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage failures
  }
}
