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

/** Read aloud for each swatch in the colour picker, in the order of COLORS. */
const COLOR_NAMES = [
  'Roxo',
  'Verde',
  'Coral',
  'Azul',
  'Rosa',
  'Amarelo',
  'Magenta',
  'Turquesa',
  'Cinza',
  'Terracota',
  'Oliva',
  'Azul-claro',
];

const COLLECTIONS = ['subjects', 'absences', 'contents', 'tasks'];
const TASK_KIND_IDS = ['tarefa', 'prova', 'trabalho'];

// ---------- Schema versions ----------

// Bumped whenever the shape of the data changes, with a step in MIGRATIONS
// that takes older data (a stored state or a backup) up to it.
const SCHEMA_VERSION = 2;

/** Each step takes data from version N to N + 1; data saved before versions existed is 1. */
const MIGRATIONS = {
  // 2: semesters (name + archive); P1, P2 and final grades and a weekly schedule on subjects.
  // The new fields get their defaults from sanitizeState.
  1: (data) => data,
};

function migrate(data) {
  let version = Number.isInteger(data.version) ? data.version : 1;
  if (version > SCHEMA_VERSION) throw new RangeError('newer');
  let next = data;
  while (version < SCHEMA_VERSION) {
    next = MIGRATIONS[version](next);
    version += 1;
  }
  return { ...next, version };
}

/** "2026.1" for January to June, "2026.2" after. */
function semesterName(date = new Date()) {
  return `${date.getFullYear()}.${date.getMonth() < 6 ? 1 : 2}`;
}

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    semester: { name: semesterName() },
    subjects: [],
    absences: [],
    contents: [],
    tasks: [],
    archive: [],
  };
}

// ---------- Validation ----------

// Everything the app renders comes through here first, from storage or from a
// backup, so markup can trust ids, colours, dates and kinds to have these
// shapes. Records are repaired where possible (a blank name, a bad colour);
// only those that cannot be (no id, no subject, no date) are dropped and counted.
// Text is never shortened: a long note is the user's, not an attack.

const ID_RE = /^[\w-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#(?:[0-9a-f]{3}){1,2}$/i;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value) => typeof value === 'string' && ID_RE.test(value);
const isDay = (value) => typeof value === 'string' && DAY_RE.test(value) && !Number.isNaN(Date.parse(value));
const text = (value) => (typeof value === 'string' ? value : '');

/** `value` as a number within [min, max], else `fallback`. Blank values count as missing. */
function numberIn(value, min, max, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

/** Classes per weekday, indexed like Date#getDay (0 is Sunday). */
function cleanSchedule(value) {
  const days = Array.isArray(value) ? value : [];
  return Array.from({ length: 7 }, (_, day) => Math.round(numberIn(days[day], 0, 24, 0)));
}

/** P1, P2 and the final exam, each 0 to 10 or null while not out yet. */
function cleanGrades(value) {
  const grades = isObject(value) ? value : {};
  return {
    p1: numberIn(grades.p1, 0, 10, null),
    p2: numberIn(grades.p2, 0, 10, null),
    final: numberIn(grades.final, 0, 10, null),
  };
}

function cleanFile(raw) {
  if (!isObject(raw) || !isId(raw.id)) return null;
  return {
    id: raw.id,
    name: text(raw.name) || 'arquivo',
    type: text(raw.type),
    size: Math.round(numberIn(raw.size, 0, Number.MAX_SAFE_INTEGER, 0)),
  };
}

const CLEANERS = {
  // Dropping a subject would take its absences, contents and tasks along, so a
  // blank name is filled in rather than rejected.
  subjects: (raw, index) => ({
    id: raw.id,
    name: text(raw.name).trim() || 'Sem nome',
    prof: text(raw.prof),
    total: Math.round(numberIn(raw.total, 1, 10000, 60)),
    max: numberIn(raw.max, 1, 100, 25),
    color: HEX_RE.test(raw.color) ? raw.color : COLORS[index % COLORS.length],
    schedule: cleanSchedule(raw.schedule),
    grades: cleanGrades(raw.grades),
  }),
  absences: (raw, index, subjectIds) => {
    if (!subjectIds.has(raw.sid) || !isDay(raw.date)) return null;
    return {
      id: raw.id,
      sid: raw.sid,
      date: raw.date,
      count: Math.round(numberIn(raw.count, 1, 100, 1)),
      note: text(raw.note),
    };
  },
  contents: (raw, index, subjectIds, drop) => {
    if (!subjectIds.has(raw.sid)) return null;
    const files = (Array.isArray(raw.files) ? raw.files : []).flatMap((file) => {
      const clean = cleanFile(file);
      if (!clean) drop();
      return clean ? [clean] : [];
    });
    return {
      id: raw.id,
      sid: raw.sid,
      title: text(raw.title) || 'Sem título',
      notes: text(raw.notes),
      done: raw.done === true,
      files,
    };
  },
  tasks: (raw, index, subjectIds) => ({
    id: raw.id,
    title: text(raw.title) || 'Sem título',
    kind: TASK_KIND_IDS.includes(raw.kind) ? raw.kind : 'tarefa',
    sid: subjectIds.has(raw.sid) ? raw.sid : '',
    due: isDay(raw.due) ? raw.due : '',
    done: raw.done === true,
  }),
};

/** The four collections of one semester, cleaned; `drop` is called once per discarded record. */
function cleanSemester(data, drop) {
  const clean = (key, subjectIds) => {
    const seen = new Set();
    const records = Array.isArray(data[key]) ? data[key] : [];
    return records.flatMap((raw, index) => {
      // A repeated id would make one record's undo or edit hit the other.
      const record =
        isObject(raw) && isId(raw.id) && !seen.has(raw.id) ? CLEANERS[key](raw, index, subjectIds, drop) : null;
      if (!record) {
        drop();
        return [];
      }
      seen.add(record.id);
      return [record];
    });
  };

  const subjects = clean('subjects');
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  return {
    subjects,
    absences: clean('absences', subjectIds),
    contents: clean('contents', subjectIds),
    tasks: clean('tasks', subjectIds),
  };
}

/**
 * Brings any parsed data to the current shape: unknown keys go (the theme used
 * to live here), missing ones get defaults and invalid records are dropped.
 * Returns the clean state and how many records were discarded.
 */
function sanitizeState(data) {
  let dropped = 0;
  const drop = () => {
    dropped += 1;
  };
  const source = isObject(data) ? data : {};

  const archive = (Array.isArray(source.archive) ? source.archive : []).flatMap((entry) => {
    if (!isObject(entry) || !isId(entry.id)) {
      drop();
      return [];
    }
    return [
      {
        id: entry.id,
        name: text(entry.name).trim() || 'Sem nome',
        archivedAt: numberIn(entry.archivedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        ...cleanSemester(entry, drop),
      },
    ];
  });

  const state = {
    version: SCHEMA_VERSION,
    semester: { name: text(source.semester?.name).trim() || semesterName() },
    ...cleanSemester(source, drop),
    archive,
  };
  return { state, dropped };
}

/**
 * Reads a parsed backup file. Returns `{ state, files, dropped }`, or
 * `{ error }` with a message for the user when it cannot be used.
 */
function parseBackup(data) {
  if (!isObject(data) || !COLLECTIONS.some((key) => Array.isArray(data[key]))) {
    return { error: 'Este arquivo não é um backup do Meu Semestre' };
  }
  const { files, ...rest } = data;
  let migrated;
  try {
    migrated = migrate(rest);
  } catch {
    return { error: 'Este backup veio de uma versão mais nova do app' };
  }
  const { state, dropped } = sanitizeState(migrated);
  return { state, files: isObject(files) ? files : {}, dropped };
}

/** True when the current semester or the archive holds anything. */
function hasData(state) {
  return state.archive.length > 0 || COLLECTIONS.some((key) => state[key].length > 0);
}

// ---------- Storage ----------

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return emptyState();
  }
  if (!raw) return emptyState();

  try {
    return sanitizeState(migrate(JSON.parse(raw))).state;
  } catch {
    // Unreadable, or saved by a newer version: set it aside before the next
    // save overwrites it, so it can still be recovered by hand.
    try {
      localStorage.setItem(`${KEY}-ilegivel-${Date.now()}`, raw);
    } catch {
      // no room for the copy either
    }
    return emptyState();
  }
}

let appState = loadState();

// Set while saving fails, so the warning shows once per run of failures
// instead of on every click.
let saveFailing = false;

function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(appState));
    saveFailing = false;
  } catch {
    if (saveFailing) return;
    saveFailing = true;
    toast('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.', {
      action: 'Exportar backup',
      onAction: exportBackup,
      life: 12000,
    });
  }
}

/** Picks up what another tab saved. */
function reloadState() {
  appState = loadState();
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
    tallies.set(subject.id, { ...EMPTY_TALLY });
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

/** Swaps in a whole state that has already been through sanitizeState (an import, an undo). */
function replaceState(nextState) {
  appState = nextState;
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
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY));
    return isObject(stored) ? stored : {};
  } catch {
    return {};
  }
}

function reloadPrefs() {
  prefs = loadPrefs();
}

function setPref(key, value) {
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage failures
  }
}
