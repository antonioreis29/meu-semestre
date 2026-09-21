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
];

const DEFAULT_STATE = {
  subjects: [],
  absences: [],
  contents: [],
  tasks: [],
  theme: 'dark',
};

let appState = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
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

function getSubject(subjectId) {
  return appState.subjects.find((subject) => subject.id === subjectId);
}

function getContent(contentId) {
  return appState.contents.find((content) => content.id === contentId);
}

function getTask(taskId) {
  return appState.tasks.find((task) => task.id === taskId);
}

function setState(nextState) {
  appState = nextState;
  saveState();
}

function replaceState(nextState) {
  appState = { ...DEFAULT_STATE, ...nextState };
  saveState();
}

function updateState(mutator) {
  appState = mutator(appState);
  saveState();
}
