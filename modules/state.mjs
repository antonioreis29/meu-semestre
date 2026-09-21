export const KEY = 'meu-semestre-v1';
export const COLORS = [
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

export const DEFAULT_STATE = {
  subjects: [],
  absences: [],
  contents: [],
  tasks: [],
  theme: 'dark',
};

export let appState = loadState();

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(appState));
  } catch {
    // ignore storage failures
  }
}

export function getSubject(subjectId) {
  return appState.subjects.find((subject) => subject.id === subjectId);
}

export function getContent(contentId) {
  return appState.contents.find((content) => content.id === contentId);
}

export function getTask(taskId) {
  return appState.tasks.find((task) => task.id === taskId);
}

export function setState(nextState) {
  appState = nextState;
  saveState();
}

export function replaceState(nextState) {
  appState = { ...DEFAULT_STATE, ...nextState };
  saveState();
}

export function updateState(mutator) {
  appState = mutator(appState);
  saveState();
}
