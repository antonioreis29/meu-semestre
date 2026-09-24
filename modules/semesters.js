// Semesters. The collections at the top of the state are the current semester;
// closing it moves them into `archive` (newest first) and starts an empty one,
// and reopening an archived semester swaps the two. Attachments stay stored
// while any semester, current or archived, refers to them.

let semesterDialog = null;

/** "2026.1" → "2026.2" → "2027.1"; any other name starts over from today's. */
function nextSemesterName(name) {
  const match = /^(\d{4})\.([12])$/.exec(name.trim());
  if (!match) return semesterName();
  return match[2] === '1' ? `${match[1]}.2` : `${Number(match[1]) + 1}.1`;
}

const hasSemesterData = (semester) => COLLECTIONS.some((key) => semester[key].length > 0);

/** "3 matérias", "12 tarefas"… for what a semester holds; empty ones are left out. */
function semesterParts(semester) {
  return [
    semester.subjects.length && plural(semester.subjects.length, 'matéria', 'matérias'),
    semester.tasks.length && plural(semester.tasks.length, 'tarefa', 'tarefas'),
    semester.contents.length && plural(semester.contents.length, 'conteúdo', 'conteúdos'),
    semester.absences.length && plural(semester.absences.length, 'registro de falta', 'registros de falta'),
  ].filter(Boolean);
}

function semesterSummary(semester) {
  const parts = semesterParts(semester);
  return parts.length ? joinList(parts) : 'Nada cadastrado ainda';
}

/** The current semester's name under the sidebar button. */
function renderSemesterLabel() {
  const label = $('#semester-name');
  if (label) label.textContent = appState.semester.name;
}

/**
 * Makes the archived semester `targetId` current, or a new empty one when it
 * is null. The semester being left goes to the archive unless it is empty.
 */
function switchSemester(targetId, message) {
  const previous = appState;
  updateState((current) => {
    const target = current.archive.find((entry) => entry.id === targetId);
    const archive = current.archive.filter((entry) => entry !== target);
    if (hasSemesterData(current)) {
      archive.unshift({
        id: uid(),
        name: current.semester.name,
        archivedAt: Date.now(),
        subjects: current.subjects,
        absences: current.absences,
        contents: current.contents,
        tasks: current.tasks,
      });
    }
    return {
      ...current,
      semester: { name: target ? target.name : nextSemesterName(current.semester.name) },
      subjects: target?.subjects || [],
      absences: target?.absences || [],
      contents: target?.contents || [],
      tasks: target?.tasks || [],
      archive,
    };
  });
  afterStateSwap();
  offerRestore(message, previous);
}

async function closeSemester() {
  const { name } = appState.semester;
  const next = nextSemesterName(name);
  const confirmed = await confirmDialog({
    title: `Encerrar ${esc(name)}?`,
    text: `Matérias, faltas, conteúdos e tarefas vão para o arquivo, e o app começa vazio para ${esc(next)}. Dá para reabrir quando quiser.`,
    okText: 'Encerrar',
    okIcon: 'archive',
    danger: false,
  });
  if (confirmed) switchSemester(null, `${name} arquivado. Bom semestre!`);
}

function reopenSemester(semesterId) {
  const target = appState.archive.find((entry) => entry.id === semesterId);
  if (!target) return;
  const left = hasSemesterData(appState) ? `; ${appState.semester.name} foi para o arquivo` : '';
  switchSemester(semesterId, `${target.name} reaberto${left}`);
}

async function deleteSemester(semesterId) {
  const target = appState.archive.find((entry) => entry.id === semesterId);
  if (!target) return;
  const confirmed = await confirmDialog({
    title: `Excluir ${esc(target.name)}?`,
    text: `Junto saem ${semesterSummary(target)}, com os anexos. Dá para desfazer logo em seguida.`,
  });
  if (confirmed) removeWithUndo(`${target.name} excluído`, { archive: (entry) => entry.id === semesterId });
}

function renameSemester(input) {
  const name = input.value.trim();
  if (!name) {
    input.value = appState.semester.name;
    return;
  }
  if (name === appState.semester.name) return;
  updateState((current) => ({ ...current, semester: { name } }));
  renderSemesterLabel();
  paintSemesterDialog();
}

const archivedOn = (timestamp) =>
  new Date(timestamp).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

function semestersDialog() {
  if (semesterDialog) return;

  const { overlay } = openOverlay(
    `
      <div class="modal semesters" role="dialog" aria-modal="true" aria-labelledby="sem-title">
        <div class="modal-head">
          <h3 id="sem-title">Semestres</h3>
          <button type="button" class="icon-btn" data-c aria-label="Fechar">${icon('close')}</button>
        </div>
        <label for="sem-name">Semestre atual</label>
        <input id="sem-name" autocomplete="off" spellcheck="false">
        <div class="sem-current"></div>
        <h4 class="modal-sub">Arquivados</h4>
        <div class="sem-archive"></div>
      </div>
    `,
    () => {
      semesterDialog = null;
    }
  );

  semesterDialog = overlay;
  const input = overlay.querySelector('#sem-name');
  input.value = appState.semester.name;
  input.addEventListener('change', () => renameSemester(input));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      renameSemester(input);
    }
  });

  paintSemesterDialog();
  overlay.querySelector('[data-c]').focus();
}

/** Redraws the dialog's lists; called on every refresh, like the subject panel. */
function paintSemesterDialog() {
  if (!semesterDialog) return;

  const input = semesterDialog.querySelector('#sem-name');
  if (document.activeElement !== input) input.value = appState.semester.name;
  // Buttons are redrawn below; focus on one of them would drop to the page.
  const hadFocus = semesterDialog.contains(document.activeElement) && document.activeElement !== input;

  semesterDialog.querySelector('.sem-current').innerHTML = `
    <p class="field-hint">${semesterSummary(appState)}</p>
    ${hasSemesterData(appState)
      ? `<button type="button" class="btn sec" data-a="sem-close">${icon('archive')}Encerrar e começar ${esc(nextSemesterName(appState.semester.name))}</button>`
      : ''}
  `;

  semesterDialog.querySelector('.sem-archive').innerHTML = appState.archive.length
    ? `<div class="list">${appState.archive
        .map(
          (entry) => `
            <div class="item sem-item">
              <div class="grow">
                <div class="t"><b>${esc(entry.name)}</b></div>
                <p>${semesterSummary(entry)}${entry.archivedAt ? ` · arquivado em ${archivedOn(entry.archivedAt)}` : ''}</p>
              </div>
              <button type="button" class="chip" data-a="sem-open" data-id="${entry.id}">Reabrir</button>
              <button type="button" class="x" data-a="sem-del" data-id="${entry.id}" aria-label="Excluir ${esc(entry.name)}">${icon('trash')}</button>
            </div>
          `
        )
        .join('')}</div>`
    : '<p class="sub">Ao encerrar um semestre, ele fica guardado aqui, com anexos e tudo, e pode ser reaberto.</p>';

  if (hadFocus && !semesterDialog.contains(document.activeElement)) semesterDialog.querySelector('[data-c]').focus();
}
