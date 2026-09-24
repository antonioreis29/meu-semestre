// Unit tests for the pure parts of the app: dates, attendance, the grading rule,
// validation and migrations, undo, search, routing and the calendar file.
// Run with `node --test` from the project folder (Node 20+), no install needed.
//
// The app is classic scripts sharing one global scope, so they are loaded the
// same way here, into this realm, over small stand-ins for the browser APIs
// they touch while loading. Storage is in memory: nothing real is read or written.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const memory = new Map();
const storage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

const media = { matches: false, addEventListener() {} };
const browser = {
  window: globalThis,
  localStorage: storage,
  document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } },
  matchMedia: () => media,
};
for (const [name, value] of Object.entries(browser)) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const SCRIPTS = [
  'modules/state.js',
  'modules/utils.js',
  'modules/files.js',
  'modules/theme.js',
  'modules/render.js',
  'modules/palette.js',
  'modules/calendar.js',
  'modules/semesters.js',
];
for (const file of SCRIPTS) {
  const url = new URL(`../${file}`, import.meta.url);
  vm.runInThisContext(readFileSync(url, 'utf8'), { filename: url.pathname });
}

/** A binding from the app's global scope (top-level const/let are not on globalThis). */
const app = (name) => vm.runInThisContext(name);
const setState = (state) => vm.runInThisContext('(state) => { appState = state; }')(state);

const {
  sanitizeState,
  parseBackup,
  migrate,
  emptyState,
  takeRecords,
  putBackRecords,
  isoDay,
  dayDiff,
  taskBucket,
  limit,
  absenceNote,
  subjectState,
  gradeStatus,
  classesOn,
  esc,
  linkify,
  uid,
  routeFromHash,
  searchPalette,
  norm,
  buildIcs,
  icsFold,
  nextSemesterName,
  fileIdsIn,
} = Object.fromEntries(
  [
    'sanitizeState',
    'parseBackup',
    'migrate',
    'emptyState',
    'takeRecords',
    'putBackRecords',
    'isoDay',
    'dayDiff',
    'taskBucket',
    'limit',
    'absenceNote',
    'subjectState',
    'gradeStatus',
    'classesOn',
    'esc',
    'linkify',
    'uid',
    'routeFromHash',
    'searchPalette',
    'norm',
    'buildIcs',
    'icsFold',
    'nextSemesterName',
    'fileIdsIn',
  ].map((name) => [name, app(name)])
);

const SCHEMA_VERSION = app('SCHEMA_VERSION');

/** YYYY-MM-DD `offset` days from today, in local time like the app. */
const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return isoDay(date);
};

const subject = (fields = {}) => ({
  id: 'calc',
  name: 'Cálculo',
  prof: '',
  total: 60,
  max: 25,
  color: '#6c5ce7',
  schedule: [0, 0, 0, 0, 0, 0, 0],
  grades: { p1: null, p2: null, final: null },
  ...fields,
});

const stateWith = (fields = {}) => ({ ...emptyState(), subjects: [subject()], ...fields });

beforeEach(() => {
  memory.clear();
  setState(emptyState());
});

// ---------- Dates ----------

test('dayDiff counts whole local days from today', () => {
  assert.equal(dayDiff(day(0)), 0);
  assert.equal(dayDiff(day(1)), 1);
  assert.equal(dayDiff(day(-3)), -3);
  assert.equal(dayDiff(day(40)), 40);
});

test('taskBucket groups tasks by how soon they are due', () => {
  assert.equal(taskBucket({ due: '' }), 'undated');
  assert.equal(taskBucket({ due: day(-1) }), 'late');
  assert.equal(taskBucket({ due: day(0) }), 'today');
  assert.equal(taskBucket({ due: day(1) }), 'tomorrow');
  assert.equal(taskBucket({ due: day(7) }), 'week');
  assert.equal(taskBucket({ due: day(8) }), 'later');
});

// ---------- Attendance ----------

test('limit is the allowed share of classes, never below one', () => {
  assert.equal(limit(subject({ total: 60, max: 25 })), 15);
  assert.equal(limit(subject({ total: 2, max: 25 })), 1);
});

test('absenceNote and subjectState follow the absences taken', () => {
  const absences = (count) => [{ id: 'a1', sid: 'calc', date: day(0), count, note: '' }];

  setState(stateWith({ absences: absences(10) }));
  assert.equal(absenceNote(subject()), 'Pode faltar mais 5');
  assert.equal(subjectState(subject())[0], 'ok');

  setState(stateWith({ absences: absences(12) }));
  assert.equal(subjectState(subject())[0], 'warn');

  setState(stateWith({ absences: absences(14) }));
  assert.equal(absenceNote(subject()), 'Só mais 1 falta');

  setState(stateWith({ absences: absences(15) }));
  assert.equal(absenceNote(subject()), 'Limite atingido');
  assert.equal(subjectState(subject())[0], 'bad');

  setState(stateWith({ absences: absences(17) }));
  assert.equal(absenceNote(subject()), '2 faltas acima do limite');
});

test('classesOn reads the weekly schedule for that weekday', () => {
  const monday = '2026-09-21';
  const wednesday = '2026-09-23';
  const scheduled = subject({ schedule: [0, 2, 0, 3, 0, 0, 0] });
  assert.equal(classesOn(scheduled, monday), 2);
  assert.equal(classesOn(scheduled, wednesday), 3);
  assert.equal(classesOn(subject(), monday), 0);
});

// ---------- Grades ----------

const graded = (p1, p2, final = null) => gradeStatus(subject({ grades: { p1, p2, final } }));

test('gradeStatus: (P1 + P2) / 2 of 7 or more passes outright', () => {
  assert.equal(graded(null, null).key, 'none');

  const passed = graded(7, 7);
  assert.equal(passed.key, 'passed');
  assert.equal(passed.tone, 'ok');
  assert.equal(passed.average, 7);
  assert.equal(passed.label, 'Aprovado · 7');

  assert.equal(graded(10, 4).key, 'passed');
  // Compared exactly, with no rounding: 6,95 is below 7.
  assert.equal(graded(7, 6.9).key, 'final');
  assert.equal(graded(7, 6.9).detail, 'Média 6,95, abaixo de 7: vai para a prova final e precisa de 3,05 nela para fechar média 5.');
  // A final taken anyway does not undo a direct pass.
  assert.equal(graded(8, 8, 2).key, 'passed');
});

test('gradeStatus: with one grade in, says what the other needs', () => {
  const partial = graded(6, null);
  assert.equal(partial.key, 'partial');
  assert.equal(partial.label, 'P1 6');
  assert.equal(partial.detail, 'Precisa de 8 na P2 para passar direto.');
  assert.match(graded(3, null).detail, /Nem com 10 na P2/);
  assert.equal(graded(null, 9).detail, 'Precisa de 5 na P1 para passar direto.');
});

test('gradeStatus: below 7 goes to the final, where (average + final) / 2 must reach 5', () => {
  const pending = graded(6, 5);
  assert.equal(pending.key, 'final');
  assert.equal(pending.tone, 'warn');
  assert.equal(pending.average, 5.5);
  assert.equal(pending.label, 'Final: precisa de 4,5');

  const passed = graded(6, 5, 4.5);
  assert.equal(passed.key, 'passed-final');
  assert.equal(passed.detail, 'Aprovado na final: (5,5 + 4,5) ÷ 2 = 5.');

  const failed = graded(6, 5, 4);
  assert.equal(failed.key, 'failed');
  assert.equal(failed.tone, 'bad');
  assert.equal(failed.label, 'Reprovado');

  assert.equal(graded(0, 0).label, 'Final: precisa de 10');
});

// ---------- Validation ----------

test('sanitizeState fills defaults and drops only what cannot be repaired', () => {
  const { state, dropped } = sanitizeState({
    theme: 'aurora',
    subjects: [
      { id: 'calc', name: '  ', total: 'x', max: 500, color: 'red"><img src=x onerror=alert(1)>' },
      { id: 'calc', name: 'Duplicada' },
      { id: 'bad id!', name: 'Id inválido' },
    ],
    absences: [
      { id: 'a1', sid: 'calc', date: '2026-03-02', count: '2' },
      { id: 'a2', sid: 'nope', date: '2026-03-02' },
      { id: 'a3', sid: 'calc', date: 'ontem' },
    ],
    contents: [{ id: 'c1', sid: 'calc', title: '', notes: 'x'.repeat(50000), files: [{ id: 'f1', name: 'a.pdf', size: 10 }, { id: 1 }] }],
    tasks: [{ id: 't1', title: 'P1', kind: 'exame', sid: 'gone', due: '31/12' }],
  });

  assert.equal(state.version, SCHEMA_VERSION);
  assert.equal('theme' in state, false);
  assert.deepEqual(state.subjects, [subject({ name: 'Sem nome', total: 60, max: 25 })]);
  assert.deepEqual(
    sanitizeState({ subjects: [subject({ grades: { p1: '7.5', p2: 11, final: 'x' } })] }).state.subjects[0].grades,
    { p1: 7.5, p2: null, final: null }
  );
  assert.deepEqual(state.absences, [{ id: 'a1', sid: 'calc', date: '2026-03-02', count: 2, note: '' }]);
  assert.equal(state.contents[0].title, 'Sem título');
  assert.equal(state.contents[0].notes.length, 50000, 'long notes are kept whole');
  assert.deepEqual(state.contents[0].files, [{ id: 'f1', name: 'a.pdf', type: '', size: 10 }]);
  assert.deepEqual(state.tasks, [{ id: 't1', title: 'P1', kind: 'tarefa', sid: '', due: '', done: false }]);
  // duplicate subject, bad id, orphan absence, undated absence, broken file
  assert.equal(dropped, 5);
});

test('sanitizeState cleans archived semesters with their own subjects', () => {
  const { state } = sanitizeState({
    archive: [
      { id: 's1', name: '2025.2', archivedAt: 1, subjects: [subject()], tasks: [{ id: 't1', sid: 'calc', title: 'P1' }] },
      { name: 'sem id' },
    ],
  });
  assert.equal(state.archive.length, 1);
  assert.equal(state.archive[0].tasks[0].sid, 'calc');
});

test('parseBackup rejects files that are not backups or come from a newer version', () => {
  assert.ok(parseBackup(null).error);
  assert.ok(parseBackup({ foo: 1 }).error);
  assert.ok(parseBackup([]).error);
  assert.ok(parseBackup({ version: SCHEMA_VERSION + 1, subjects: [] }).error);

  const backup = parseBackup({ subjects: [subject()], files: { f1: 'data:,' } });
  assert.equal(backup.error, undefined);
  assert.equal(backup.state.subjects.length, 1);
  assert.deepEqual(Object.keys(backup.files), ['f1']);
});

test('migrate lifts unversioned data to the current version', () => {
  assert.equal(migrate({ subjects: [] }).version, SCHEMA_VERSION);
  assert.throws(() => migrate({ version: SCHEMA_VERSION + 1 }));
});

test('loadState sets unreadable data aside instead of losing it', () => {
  memory.set('meu-semestre-v1', '{not json');
  const state = app('loadState')();
  assert.deepEqual(state.subjects, []);
  const aside = [...memory.keys()].find((key) => key.startsWith('meu-semestre-v1-ilegivel-'));
  assert.equal(memory.get(aside), '{not json');
});

// ---------- Undo ----------

test('takeRecords and putBackRecords restore records in their old places', () => {
  const tasks = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id, kind: 'tarefa', sid: '', due: '', done: false }));
  setState({ ...emptyState(), tasks });

  const taken = takeRecords({ tasks: (task) => task.id === 'b' || task.id === 'd' });
  assert.deepEqual(app('appState').tasks.map((task) => task.id), ['a', 'c']);

  putBackRecords(taken);
  assert.deepEqual(app('appState').tasks.map((task) => task.id), ['a', 'b', 'c', 'd']);
  assert.ok(memory.get('meu-semestre-v1').includes('"d"'), 'saved to storage');
});

// ---------- Text & ids ----------

test('esc and linkify never let markup through', () => {
  assert.equal(esc('<b a="1">\'&'), '&lt;b a=&quot;1&quot;&gt;&#39;&amp;');
  const html = linkify(esc('veja https://ex.com/a?b=1&c=2. "https://x.com/"onmouseover=1'));
  assert.match(html, /<a href="https:\/\/ex\.com\/a\?b=1&amp;c=2"/);
  assert.match(html, /<\/a>\. /, 'trailing punctuation stays outside the link');
  assert.doesNotMatch(html, /"onmouseover/);
  assert.equal(linkify(esc('javascript:alert(1)')), 'javascript:alert(1)');
});

test('uid makes 16 hex digits that pass validation', () => {
  const ids = new Set(Array.from({ length: 1000 }, uid));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{16}$/);
});

test('norm drops accents and case', () => {
  assert.equal(norm('Cálculo AÇÃO'), 'calculo acao');
});

// ---------- Routing & search ----------

test('routeFromHash tolerates malformed and unknown hashes', () => {
  assert.equal(routeFromHash('#tarefas'), 'tasks');
  assert.equal(routeFromHash('#materias'), 'subjects');
  assert.equal(routeFromHash(''), 'home');
  assert.equal(routeFromHash('#%'), 'home');
  assert.equal(routeFromHash('#%E0%A4%A'), 'home');
  assert.equal(routeFromHash('#nada'), 'home');
});

test('searchPalette ranks label prefixes first and keeps group order', () => {
  const item = (group, label) => ({ group, label, plainLabel: norm(label), plainText: norm(`${label} ${group}`) });
  const items = [
    item('Tarefas', 'Lista de cálculo'),
    item('Matérias', 'Física'),
    item('Tarefas', 'Cálculo: prova 1'),
    item('Matérias', 'Cálculo II'),
    item('Ações', 'Nova tarefa'),
  ];
  const labels = searchPalette(items, 'calc').map((result) => result.label);
  assert.deepEqual(labels, ['Cálculo II', 'Cálculo: prova 1', 'Lista de cálculo']);
  assert.deepEqual(searchPalette(items, '').map((result) => result.label), ['Nova tarefa']);
});

// ---------- Calendar ----------

test('buildIcs writes one all-day event per task, escaped and folded', () => {
  setState(stateWith());
  const ics = buildIcs(
    [{ id: 't1', title: 'Prova; parte 1, com vírgula', kind: 'prova', sid: 'calc', due: '2026-12-31', done: false }],
    new Date(Date.UTC(2026, 8, 24, 12, 0, 0))
  );
  const lines = ics.split('\r\n');
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(lines.includes('UID:t1@meu-semestre'));
  assert.ok(lines.includes('DTSTAMP:20260924T120000Z'));
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261231'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20270101'), 'ends the next day, across the year');
  assert.ok(lines.includes('SUMMARY:Prova: Prova\\; parte 1\\, com vírgula (Cálculo)'));
});

test('icsFold keeps lines within 75 octets without splitting characters', () => {
  const folded = icsFold(`SUMMARY:${'á'.repeat(100)}`);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), `SUMMARY:${'á'.repeat(100)}`);
});

// ---------- Semesters & files ----------

test('nextSemesterName steps through halves of the year', () => {
  assert.equal(nextSemesterName('2026.1'), '2026.2');
  assert.equal(nextSemesterName('2026.2'), '2027.1');
  assert.match(nextSemesterName('Meu semestre'), /^\d{4}\.[12]$/);
});

test('fileIdsIn finds attachments in contents, semesters and whole states', () => {
  const content = { files: [{ id: 'f1' }, { id: 2 }] };
  const state = { contents: [content], archive: [{ contents: [{ files: [{ id: 'f2' }] }] }] };
  assert.deepEqual(fileIdsIn(content), ['f1']);
  assert.deepEqual(fileIdsIn(state), ['f1', 'f2']);
  assert.deepEqual(fileIdsIn(null), []);
});
