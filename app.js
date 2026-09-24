let view = routeFromHash(location.hash);
let filter = 'all';
let showDone = false;

// Open dialogs as { close, overlay }, topmost last. Forms can open on top of
// the subject panel, and Escape must dismiss only the one in front.
const dialogStack = [];

// The subject panel stays open while forms stack on top of it, so it is
// re-rendered on every refresh, like the view behind it.
let detail = null;

// The latest "Desfazer" still on screen, for Ctrl+Z.
let pendingUndo = null;

// Day and greeting the screen was last drawn for; see refreshIfStale.
let drawnFor = '';

const clockStamp = () => `${today()} ${greeting()}`;

/** `enter` as in renderApp: true when a view opens, 'list' for a new filter. */
function refreshView({ enter = false } = {}) {
  renderApp({ view, filter, showDone, enter });
  renderDetail();
  paintSemesterDialog();
  drawnFor = clockStamp();
}

/**
 * "Hoje", "Atrasada" and the greeting are worked out when drawing, so a tab
 * left open overnight (or past noon) redraws once they would read differently.
 */
function refreshIfStale() {
  if (!document.hidden && clockStamp() !== drawnFor) refreshView();
}

function onRoute() {
  view = routeFromHash(location.hash);
  filter = 'all';
  showDone = false;
  refreshView({ enter: true });
  window.scrollTo(0, 0);
}

/** After the whole state was swapped (import, semesters, their undo), the filter may name a subject that is gone. */
function afterStateSwap() {
  filter = 'all';
  showDone = false;
  refreshView({ enter: true });
}

function navigate(target) {
  const hash = `#${ROUTES[target]}`;
  if (location.hash === hash || (!location.hash && target === 'home')) onRoute();
  else location.hash = hash;
}

/** The subject the current filter points at, to preselect it in new forms. */
function filterSubject() {
  return getSubject(filter) ? filter : '';
}

function subOptions(selected = '') {
  return appState.subjects
    .map(
      (subject) =>
        `<option value="${subject.id}" ${subject.id === selected ? 'selected' : ''}>${esc(subject.name)}</option>`
    )
    .join('');
}

/**
 * Only the front layer takes focus and clicks: the page behind an open dialog
 * or the mobile sheet, and every dialog under the top one, are inert. Toasts
 * stay live, so "Desfazer" still works with a dialog open.
 */
function syncInert() {
  const sheet = $('#sheet');
  const shell = $('.shell');
  if (shell) shell.inert = dialogStack.length > 0 || Boolean(sheet && !sheet.hidden);
  dialogStack.forEach(({ overlay }, index) => {
    overlay.inert = index < dialogStack.length - 1;
  });
}

/**
 * Mounts an overlay with the dismiss behaviour every dialog shares: backdrop
 * click, any `[data-c]` button and Escape (handled in `handleKeys`). Focus
 * goes back to whatever opened it.
 */
function openOverlay(html, onClose = null, className = '') {
  closeSheet();
  const opener = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = `overlay ${className}`.trim();
  overlay.innerHTML = html;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => {
    const position = dialogStack.findIndex((dialog) => dialog.close === close);
    if (position === -1) return;

    dialogStack.splice(position, 1);
    if (!dialogStack.length) document.body.style.overflow = '';
    overlay.inert = true;
    overlay.style.animation = 'fade .2s reverse forwards';
    setTimeout(() => overlay.remove(), 200);
    syncInert();
    onClose?.();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };

  dialogStack.push({ close, overlay });
  syncInert();

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-c]')) close();
  });

  return { close, overlay };
}

/**
 * Builds a modal dialog.
 * `options.onDelete`, when given, renders a destructive action in the footer.
 */
function modal(title, body, onOk, options = {}) {
  const { okText = 'Salvar', onDelete = null } = options;

  const { close, overlay } = openOverlay(`
    <form class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <h3>${title}</h3>
      ${body}
      <div class="foot">
        ${onDelete ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${icon('trash')}Excluir</button>` : ''}
        <button type="button" class="btn sec" data-c>Cancelar</button>
        <button class="btn">${okText}</button>
      </div>
    </form>
  `);

  const form = overlay.querySelector('form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onOk(Object.fromEntries(new FormData(form)), close);
  });

  if (onDelete) {
    overlay.querySelector('[data-del]').addEventListener('click', () => onDelete(close));
  }

  const firstInput = overlay.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();

  return { close, overlay };
}

/**
 * An in-app confirm(): themed, non-blocking, and resolves to true or false.
 * `title` and `text` are markup: escape what comes from the user.
 */
function confirmDialog({ title, text, okText = 'Excluir', okIcon = 'trash', danger = true }) {
  return new Promise((resolve) => {
    let answered = false;

    const { close, overlay } = openOverlay(
      `
        <div class="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
          <h3 id="confirm-title">${title}</h3>
          <p class="sub" id="confirm-text">${text}</p>
          <div class="foot">
            <button type="button" class="btn sec" data-c>Cancelar</button>
            <button type="button" class="btn ${danger ? 'danger' : ''}" data-ok>${icon(okIcon)}${okText}</button>
          </div>
        </div>
      `,
      () => {
        if (!answered) resolve(false);
      }
    );

    const okButton = overlay.querySelector('[data-ok]');
    okButton.addEventListener('click', () => {
      answered = true;
      close();
      resolve(true);
    });
    okButton.focus();
  });
}

/**
 * Shows `message` with a "Desfazer" button that runs `undo`. `settle` runs
 * once the chance is gone, whether it was taken or not.
 */
function offerUndo(message, undo, settle = () => {}) {
  const entry = {};
  entry.dismiss = toast(message, {
    action: 'Desfazer',
    onAction: undo,
    onClose: () => {
      if (pendingUndo === entry) pendingUndo = null;
      settle();
    },
  });
  entry.run = () => {
    undo();
    entry.dismiss?.();
  };
  pendingUndo = entry;
}

/** Deletes at once and lets the user take it back, instead of asking first. */
function removeWithUndo(message, tests) {
  const taken = takeRecords(tests);
  if (!taken.length) return;

  // Attachments of removed contents (or semesters) must survive pruning while undo is possible.
  const fileIds = taken.flatMap(([, , record]) => fileIdsIn(record));
  holdFiles(fileIds);
  refreshView();

  offerUndo(
    message,
    () => {
      putBackRecords(taken);
      refreshView();
    },
    () => {
      releaseFiles(fileIds);
      pruneFiles();
    }
  );
}

/**
 * Undo for changes that replace the whole state (an import, a semester
 * switch): puts `previous` back. Its attachments are held until the chance is gone.
 */
function offerRestore(message, previous) {
  const fileIds = fileIdsIn(previous);
  holdFiles(fileIds);
  offerUndo(
    message,
    () => {
      replaceState(previous);
      afterStateSwap();
    },
    () => {
      releaseFiles(fileIds);
      pruneFiles();
    }
  );
}

/** Opens the panel listing a subject's tasks, contents and absences. */
function subjectDetail(subjectId) {
  if (!getSubject(subjectId)) return;

  const { close, overlay } = openOverlay(
    '<div class="modal wide detail" role="dialog" aria-modal="true" tabindex="-1"></div>',
    () => {
      detail = null;
    }
  );

  detail = { id: subjectId, close, overlay };
  renderDetail(true);
  overlay.querySelector('.detail').focus();
}

function renderDetail(enter = false) {
  if (!detail) return;

  const subject = getSubject(detail.id);
  if (!subject) {
    // Deleted from the edit form stacked on top.
    detail.close();
    return;
  }

  const panel = detail.overlay.querySelector('.detail');
  const scrollTop = panel.scrollTop;
  // Re-rendering replaces the focused control; hand focus to its replacement.
  const focused = panel.contains(document.activeElement) ? document.activeElement.closest('[data-a], [data-grade]') : null;

  panel.setAttribute('aria-label', subject.name);
  panel.style.setProperty('--c', subject.color);
  // Items sweep in when the panel opens, not on each refresh behind a form.
  panel.classList.toggle('enter', enter);
  panel.innerHTML = renderSubjectDetail(subject);
  panel.scrollTop = scrollTop;

  if (focused) {
    const { a, id, grade } = focused.dataset;
    const twin = panel.querySelector(grade ? `[data-grade="${grade}"]` : `[data-a="${a}"][data-id="${id}"]`);
    // A grade being typed is not saved until the field is left; keep it.
    if (grade && twin) twin.value = focused.value;
    (twin || panel).focus();
  }
}

/** Saves the grade typed in a panel field (P1, P2 or final); blank clears it. */
function saveGrade(input) {
  const { grade, id } = input.dataset;
  const subject = getSubject(id);
  if (!subject) return;

  const value = input.value.trim() === '' ? null : Math.round(Number(input.value) * 100) / 100;
  if (input.validity.badInput || (value !== null && !(value >= 0 && value <= 10))) {
    toast(input.validity.badInput ? 'Digite a nota como número, de 0 a 10' : 'A nota vai de 0 a 10');
    input.value = subject.grades[grade] ?? '';
    return;
  }
  if (value === subject.grades[grade]) return;

  updateState((current) => ({
    ...current,
    subjects: current.subjects.map((item) =>
      item.id === id ? { ...item, grades: { ...item.grades, [grade]: value } } : item
    ),
  }));
  // Drawn once focus has moved on (Tab to the next grade), so it lands on
  // that field's replacement instead of being lost with the old markup.
  requestAnimationFrame(() => refreshView());
}

async function deleteSubject(subjectId) {
  const subject = getSubject(subjectId);
  if (!subject) return false;

  const { absences, contents } = tally(subjectId);
  const tasks = appState.tasks.filter((task) => task.sid === subjectId).length;
  const parts = [
    absences && plural(absences, 'falta', 'faltas'),
    contents && plural(contents, 'conteúdo', 'conteúdos'),
    tasks && plural(tasks, 'tarefa', 'tarefas'),
  ].filter(Boolean);

  const confirmed = await confirmDialog({
    title: `Excluir “${esc(subject.name)}”?`,
    text: `${parts.length ? `Junto saem ${joinList(parts)}. ` : ''}Dá para desfazer logo em seguida.`,
  });
  if (!confirmed) return false;

  removeWithUndo('Matéria excluída', {
    subjects: (item) => item.id === subjectId,
    absences: (item) => item.sid === subjectId,
    contents: (item) => item.sid === subjectId,
    tasks: (item) => item.sid === subjectId,
  });
  return true;
}

/** Monday first, as Brazilian calendars print the week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function subjectForm(subject = {}) {
  const isNew = !subject.id;
  const currentColor = subject.color || COLORS[appState.subjects.length % COLORS.length];
  const schedule = subject.schedule || [];

  modal(
    isNew ? 'Nova matéria' : 'Editar matéria',
    `
      <label>Nome</label>
      <input name="name" required value="${esc(subject.name)}" placeholder="Ex.: Cálculo II">
      <label>Professor(a)</label>
      <input name="prof" value="${esc(subject.prof)}" placeholder="Opcional">
      <div class="two">
        <div>
          <label>Total de aulas</label>
          <input name="total" type="number" min="1" required value="${subject.total || 60}">
        </div>
        <div>
          <label>Máx. de faltas (%)</label>
          <input name="max" type="number" min="1" max="100" required value="${subject.max || 25}">
        </div>
      </div>
      <label>Aulas por dia da semana</label>
      <div class="week">
        ${WEEK_ORDER.map(
          (day) => `
            <label class="week-day">
              <span aria-hidden="true">${WEEKDAYS[day].slice(0, 3)}</span>
              <input name="day-${day}" type="number" min="0" max="24" inputmode="numeric" placeholder="0" value="${schedule[day] || ''}" aria-label="Aulas de ${WEEKDAYS[day].toLowerCase()}">
            </label>
          `
        ).join('')}
      </div>
      <p class="field-hint">Opcional. Com a grade, “Falta hoje” conta todas as aulas do dia e o Início mostra as aulas de hoje.</p>
      <label>Cor</label>
      <div class="colors" role="radiogroup" aria-label="Cor">
        ${COLORS.map(
          (color, index) =>
            `<label title="${COLOR_NAMES[index]}"><input type="radio" name="color" value="${color}" aria-label="${COLOR_NAMES[index]}" ${color === currentColor ? 'checked' : ''}><i style="--c:${color}"></i></label>`
        ).join('')}
      </div>
    `,
    (data, closeDialog) => {
      const name = data.name.trim();
      if (!name) {
        toast('Dê um nome à matéria');
        return;
      }

      const payload = {
        name,
        prof: data.prof.trim(),
        total: Number(data.total),
        max: Number(data.max),
        schedule: Array.from({ length: 7 }, (_, day) => Math.round(Number(data[`day-${day}`]) || 0)),
        // No swatch is checked when the subject kept a colour from outside the palette.
        ...(data.color ? { color: data.color } : {}),
      };

      if (isNew) {
        updateState((current) => ({
          ...current,
          subjects: [...current.subjects, { id: uid(), color: currentColor, grades: { p1: null, p2: null, final: null }, ...payload }],
        }));
        toast('Matéria criada');
      } else {
        updateState((current) => ({
          ...current,
          subjects: current.subjects.map((item) => (item.id === subject.id ? { ...item, ...payload } : item)),
        }));
        toast('Matéria atualizada');
      }

      closeDialog();
      refreshView();
    },
    {
      onDelete: isNew
        ? null
        : async (closeDialog) => {
            if (await deleteSubject(subject.id)) closeDialog();
          },
    }
  );
}

function addAbsence(payload, closeDialog) {
  const subject = getSubject(payload.sid);
  if (!subject) {
    toast('Selecione uma matéria válida');
    return;
  }

  const id = uid();
  const count = Number(payload.count || 1);
  updateState((current) => ({
    ...current,
    absences: [...current.absences, { id, ...payload, count }],
  }));

  closeDialog();
  refreshView();

  // Worked out after the update, so the warning reflects the new total.
  const [stateKey] = subjectState(subject);
  const message =
    {
      bad: `${subject.name}: limite de faltas atingido`,
      warn: `Atenção: ${subject.name} está perto do limite`,
    }[stateKey] || (count > 1 ? `${count} faltas registradas` : 'Falta registrada');

  // One click registers an absence, so one click takes it back.
  offerUndo(message, () => {
    takeRecords({ absences: (item) => item.id === id });
    refreshView();
  });
}

function absForm(subjectId = undefined) {
  if (!appState.subjects.length) {
    toast('Crie uma matéria primeiro');
    return;
  }

  const selectedId = subjectId || appState.subjects[0].id;

  const { overlay } = modal(
    'Registrar falta',
    `
      <label>Matéria</label>
      <select name="sid">${subOptions(selectedId)}</select>
      <div class="two">
        <div>
          <label>Data</label>
          <input name="date" type="date" value="${today()}" required>
        </div>
        <div>
          <label>Quantidade</label>
          <input name="count" type="number" min="1" value="${classesOn(getSubject(selectedId)) || 1}" required>
        </div>
      </div>
      <label>Observação</label>
      <input name="note" placeholder="Opcional">
    `,
    (data, closeDialog) => addAbsence(data, closeDialog),
    { okText: 'Registrar' }
  );

  // The quantity follows the schedule of the chosen subject and day, until typed over.
  const form = overlay.querySelector('form');
  const count = form.elements.namedItem('count');
  let typed = false;
  count.addEventListener('input', () => {
    typed = true;
  });
  form.addEventListener('change', (event) => {
    if (typed || event.target === count) return;
    const subject = getSubject(form.elements.namedItem('sid').value);
    const date = form.elements.namedItem('date').value;
    if (subject && date) count.value = classesOn(subject, date) || 1;
  });
}

/** Name for a pasted file: clipboard images all arrive as "image.png". */
function pastedName(file) {
  if (file.name && file.name !== 'image.png') return file.name;
  const time = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  const extension = file.type.split('/')[1]?.split('+')[0] || 'png';
  return `captura-${today()}-${time}.${extension}`;
}

function contentForm(content = {}, subjectId = '') {
  if (!appState.subjects.length) {
    toast('Crie uma matéria primeiro');
    return;
  }

  const isNew = !content.id;
  const selectedId = content.sid || subjectId || appState.subjects[0].id;

  // Attachment edits stay local until Save, so Cancel leaves storage untouched.
  const files = [...(content.files || [])];
  const added = new Map();
  let saving = false;

  const { overlay } = modal(
    isNew ? 'Novo conteúdo' : 'Editar conteúdo',
    `
      <label>Matéria</label>
      <select name="sid">${subOptions(selectedId)}</select>
      <label>Título / tópico</label>
      <input name="title" required value="${esc(content.title)}" placeholder="Ex.: Integrais por partes">
      <label>Anotações</label>
      <textarea name="notes" placeholder="Resumo, links, fórmulas...">${esc(content.notes)}</textarea>
      <label>Anexos</label>
      <div class="attach">
        <div class="attach-list"></div>
        <div class="attach-row">
          <button type="button" class="chip" data-add-file>${icon('clip')}Anexar arquivos</button>
          <span class="attach-hint">ou arraste para cá, ou cole um print com ${MOD_KEY}+V</span>
        </div>
        <input type="file" multiple hidden data-file-input>
      </div>
    `,
    async (data, closeDialog) => {
      if (saving) return;
      saving = true;

      // Held until the content that points at them is saved, so a prune
      // running in between does not take the new files for orphans.
      const addedIds = [...added.keys()];
      holdFiles(addedIds);

      // Bytes go in first, so the content never points at a file that is not stored.
      if (added.size) {
        try {
          await putFiles([...added]);
        } catch {
          releaseFiles(addedIds);
          saving = false;
          toast('Não foi possível salvar os anexos neste navegador');
          return;
        }
      }

      const payload = { ...data, files };
      if (isNew) {
        updateState((current) => ({
          ...current,
          contents: [...current.contents, { id: uid(), done: false, ...payload }],
        }));
      } else {
        updateState((current) => ({
          ...current,
          contents: current.contents.map((item) => (item.id === content.id ? { ...item, ...payload } : item)),
        }));
      }
      releaseFiles(addedIds);
      closeDialog();
      refreshView();
      toast('Conteúdo salvo');
      pruneFiles();
    },
    {
      onDelete: isNew
        ? null
        : (closeDialog) => {
            closeDialog();
            removeWithUndo('Conteúdo excluído', { contents: (item) => item.id === content.id });
          },
    }
  );

  const zone = overlay.querySelector('.attach');
  const list = overlay.querySelector('.attach-list');
  const input = overlay.querySelector('[data-file-input]');

  const paintFiles = () => {
    list.innerHTML = files
      .map(
        (file) => `
          <div class="file-row">
            ${icon('clip')}
            <span title="${esc(file.name)}">${esc(file.name)}</span>
            <small>${fmtSize(file.size)}</small>
            <button type="button" class="x" data-rm-file="${file.id}" aria-label="Remover ${esc(file.name)}">${icon('close')}</button>
          </div>
        `
      )
      .join('');
  };

  /** Queues files from the picker, a drop or a paste; returns how many were taken. */
  const addFiles = (incoming, nameOf = (file) => file.name) => {
    let count = 0;
    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) {
        toast(`"${nameOf(file)}" passa de ${fmtSize(MAX_FILE_SIZE)} e não foi anexado`);
        continue;
      }
      const id = uid();
      files.push({ id, name: nameOf(file), type: file.type, size: file.size });
      added.set(id, file);
      count += 1;
    }
    paintFiles();
    return count;
  };

  overlay.querySelector('[data-add-file]').addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';
  });

  // Files dropped anywhere on the dialog land in the list.
  overlay.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    zone.classList.add('drop');
  });

  overlay.addEventListener('dragleave', (event) => {
    if (!overlay.contains(event.relatedTarget)) zone.classList.remove('drop');
  });

  overlay.addEventListener('drop', (event) => {
    zone.classList.remove('drop');
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  });

  // A pasted screenshot becomes an attachment; pasted text behaves as usual.
  overlay.addEventListener('paste', (event) => {
    const clipboard = event.clipboardData;
    const pasted = [...(clipboard?.files || [])];
    if (!pasted.length) return;
    // Word and Excel put a picture of the copied text next to the text itself;
    // in a text field, the text is what was meant.
    if (event.target.closest?.('input, textarea') && clipboard.types.includes('text/plain')) return;
    event.preventDefault();
    if (addFiles(pasted, pastedName)) toast('Imagem colada como anexo');
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rm-file]');
    if (!button) return;
    const fileId = button.dataset.rmFile;
    files.splice(files.findIndex((file) => file.id === fileId), 1);
    added.delete(fileId);
    paintFiles();
  });

  paintFiles();
}

function taskForm(task = {}, subjectId = '') {
  const isNew = !task.id;
  const kind = task.kind || 'tarefa';

  modal(
    isNew ? 'Nova tarefa' : 'Editar tarefa',
    `
      <label>Título</label>
      <input name="title" required value="${esc(task.title)}" placeholder="Ex.: Prova 1 de Física">
      <label>Tipo</label>
      <div class="seg" role="radiogroup" aria-label="Tipo">
        ${Object.entries(TASK_KINDS)
          .map(
            ([value, [iconName, label]]) =>
              `<label><input type="radio" name="kind" value="${value}" ${value === kind ? 'checked' : ''}><span>${icon(iconName)}${label}</span></label>`
          )
          .join('')}
      </div>
      <div class="two">
        <div>
          <label>Matéria</label>
          <select name="sid"><option value="">—</option>${subOptions(isNew ? subjectId : task.sid)}</select>
        </div>
        <div>
          <label>Data</label>
          <input name="due" type="date" value="${task.due || ''}">
        </div>
      </div>
    `,
    (data, closeDialog) => {
      const payload = { title: data.title, kind: data.kind, sid: data.sid, due: data.due };

      if (isNew) {
        updateState((current) => ({
          ...current,
          tasks: [...current.tasks, { id: uid(), done: false, ...payload }],
        }));
      } else {
        updateState((current) => ({
          ...current,
          tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, ...payload } : item)),
        }));
      }
      closeDialog();
      refreshView();
      toast(isNew ? 'Tarefa criada' : 'Tarefa atualizada');
    },
    {
      okText: isNew ? 'Criar' : 'Salvar',
      onDelete: isNew
        ? null
        : (closeDialog) => {
            closeDialog();
            removeWithUndo('Tarefa excluída', { tasks: (item) => item.id === task.id });
          },
    }
  );
}

function toggleDone(key, itemId, doneMessage) {
  updateState((current) => ({
    ...current,
    [key]: current[key].map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
  }));
  refreshView();
  if (appState[key].find((item) => item.id === itemId)?.done) toast(doneMessage);
}

/** One click registers every class the subject has today, or one without a schedule. */
function quickAbsence(subjectId) {
  const subject = getSubject(subjectId);
  if (!subject) return;
  addAbsence({ sid: subjectId, date: today(), count: classesOn(subject) || 1, note: '' }, () => {});
}

/** What N creates on each view. */
const NEW_IN_VIEW = {
  home: () => taskForm(),
  subjects: () => subjectForm(),
  absences: () => absForm(filterSubject() || undefined),
  contents: () => contentForm({}, filterSubject()),
  tasks: () => taskForm({}, filterSubject()),
};

function handleActions(event) {
  const trigger = event.target.closest('[data-f]');
  if (trigger) {
    filter = trigger.dataset.f;
    refreshView({ enter: 'list' });
    return;
  }

  const actionButton = event.target.closest('[data-a]');
  if (!actionButton) return;

  const { a, id } = actionButton.dataset;

  const actions = {
    palette: () => openPalette(),
    theme: () => themePicker(),
    semesters: () => semestersDialog(),
    'sem-close': () => closeSemester(),
    'sem-open': () => reopenSemester(id),
    'sem-del': () => deleteSemester(id),
    'export-ics': () => exportCalendar(),
    'toggle-done': () => {
      showDone = !showDone;
      refreshView();
    },
    'new-subj': () => subjectForm(),
    'open-subj': () => subjectDetail(id),
    'edit-subj': () => subjectForm(getSubject(id)),
    'del-subj': () => deleteSubject(id),
    'quick-abs': () => quickAbsence(id),
    'new-abs': () => absForm(filterSubject() || undefined),
    'del-abs': () => {
      removeItemWithAnimation(actionButton, () => {
        removeWithUndo('Falta excluída', { absences: (item) => item.id === id });
      });
    },
    'new-cont': () => contentForm({}, id || filterSubject()),
    'edit-cont': () => {
      const content = getContent(id);
      if (content) contentForm(content);
    },
    'tog-cont': () => toggleDone('contents', id, 'Conteúdo concluído'),
    'del-cont': () => {
      removeItemWithAnimation(actionButton, () => {
        removeWithUndo('Conteúdo excluído', { contents: (item) => item.id === id });
      });
    },
    'open-file': () => openFile(id),
    'new-task': () => taskForm({}, id || filterSubject()),
    'edit-task': () => {
      const task = getTask(id);
      if (task) taskForm(task);
    },
    'tog-task': () => toggleDone('tasks', id, 'Tarefa concluída'),
    'del-task': () => {
      removeItemWithAnimation(actionButton, () => {
        removeWithUndo('Tarefa excluída', { tasks: (item) => item.id === id });
      });
    },
  };

  if (actions[a]) {
    // Chips live inside a clickable card; keep the card handler from firing too.
    event.stopPropagation();
    actions[a]();
  }
}

// ---------- Backup ----------

/** Past this much in attachments, exporting asks first: the file gets big and slow to build. */
const BIG_BACKUP = 50 * 1024 * 1024;

async function exportBackup() {
  const attached = allFileMetas().reduce((total, file) => total + file.size, 0);
  if (attached > BIG_BACKUP) {
    const confirmed = await confirmDialog({
      title: 'Backup grande',
      text: `Os anexos somam ${fmtSize(attached)}, então o arquivo terá cerca de ${fmtSize(Math.round((attached * 4) / 3))} e pode demorar para ser gerado.`,
      okText: 'Exportar',
      okIcon: 'download',
      danger: false,
    });
    if (!confirmed) return;
  }

  // Attachments travel inside the backup as data URLs, so a restore is complete.
  const { entries, missing } = await exportFiles();

  // Assembled from parts instead of one JSON.stringify of everything: with
  // large attachments, that single string (indented, too) is what runs out of memory.
  const parts = [JSON.stringify(appState).slice(0, -1)];
  if (entries.length) {
    parts.push(',"files":{');
    entries.forEach(([id, dataUrl], index) => parts.push(`${index ? ',' : ''}${JSON.stringify(id)}:`, JSON.stringify(dataUrl)));
    parts.push('}');
  }
  parts.push('}');
  downloadBlob(new Blob(parts, { type: 'application/json' }), `meu-semestre-backup-${today()}.json`);

  setPref('backupAt', Date.now());
  renderBackupAge();
  toast(
    missing
      ? `Backup baixado, mas ${plural(missing, 'anexo não pôde ser lido', 'anexos não puderam ser lidos')}`
      : 'Backup baixado'
  );
}

function importBackup() {
  $('#file')?.click();
}

/** "O backup traz 3 matérias e 12 tarefas, mais 1 semestre arquivado." */
function backupSummary(state) {
  const parts = semesterParts(state);
  if (state.archive.length) parts.push(plural(state.archive.length, 'semestre arquivado', 'semestres arquivados'));
  return parts.length ? `O backup traz ${joinList(parts)}.` : 'O backup está vazio.';
}

/**
 * Validates the file, asks before replacing data already here, stores its
 * attachments and switches over, with a "Desfazer" back to what was here.
 */
async function importBackupFile(file) {
  let parsed = null;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    // reported as not a backup
  }

  const backup = parseBackup(parsed);
  if (backup.error) {
    toast(backup.error);
    return;
  }
  const { state, files, dropped } = backup;

  if (hasData(appState)) {
    const confirmed = await confirmDialog({
      title: 'Substituir os dados atuais?',
      text: `${backupSummary(state)} Tudo o que está neste navegador agora será trocado por ele; dá para desfazer logo em seguida.`,
      okText: 'Substituir',
      okIcon: 'upload',
    });
    if (!confirmed) return;
  }

  // Stored before the state switches over, so no restored content points at a missing file.
  let broken = 0;
  let filesSaved = true;
  try {
    broken = await importFiles(files, state);
  } catch {
    filesSaved = false;
  }

  const previous = appState;
  replaceState(state);
  afterStateSwap();

  const notes = [
    dropped && plural(dropped, 'registro inválido ignorado', 'registros inválidos ignorados'),
    broken && plural(broken, 'anexo corrompido ignorado', 'anexos corrompidos ignorados'),
    !filesSaved && 'os anexos não puderam ser salvos',
  ].filter(Boolean);
  const message = `Backup importado${notes.length ? `: ${joinList(notes)}` : ''}`;

  if (hasData(previous)) {
    offerRestore(message, previous);
  } else {
    toast(message);
    pruneFiles();
  }
}

// ---------- Mobile sheet ----------

function openSheet() {
  const sheet = $('#sheet');
  if (!sheet) return;
  sheet.hidden = false;
  $('#more')?.setAttribute('aria-expanded', 'true');
  syncInert();
  sheet.querySelector('.sheet-item')?.focus();
}

function closeSheet() {
  const sheet = $('#sheet');
  if (!sheet || sheet.hidden) return;
  const hadFocus = sheet.contains(document.activeElement);
  sheet.hidden = true;
  $('#more')?.setAttribute('aria-expanded', 'false');
  syncInert();
  if (hadFocus) $('#more')?.focus({ preventScroll: true });
}

function bindSheet() {
  $('#more')?.addEventListener('click', openSheet);

  $('#sheet')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-sheet]');
    if (item) {
      closeSheet();
      const run = {
        theme: themePicker,
        semesters: semestersDialog,
        export: exportBackup,
        import: importBackup,
      }[item.dataset.sheet];
      run?.();
      return;
    }
    if (event.target === event.currentTarget) closeSheet();
  });
}

// ---------- Keyboard ----------

const isTyping = (target) => target.closest?.('input, textarea, select, [contenteditable="true"]');

function handleKeys(event) {
  const { key } = event;
  const mod = event.ctrlKey || event.metaKey;

  if (mod && !event.altKey && key.toLowerCase() === 'k') {
    event.preventDefault();
    togglePalette();
    return;
  }

  if (key === 'Escape') {
    const sheet = $('#sheet');
    if (sheet && !sheet.hidden) {
      closeSheet();
      return;
    }
    if (dialogStack.length) {
      dialogStack[dialogStack.length - 1].close();
      return;
    }
  }

  if (key === 'Enter' && event.target.matches?.('[data-grade]')) {
    saveGrade(event.target);
    return;
  }

  // Clickable cards and rows are focusable; let Enter and Space open them too.
  if ((key === 'Enter' || key === ' ') && event.target.matches?.('[data-a][tabindex="0"]')) {
    event.preventDefault();
    event.target.click();
    return;
  }

  if (isTyping(event.target)) return;

  if (mod && !event.shiftKey && key.toLowerCase() === 'z' && pendingUndo) {
    event.preventDefault();
    pendingUndo.run();
    return;
  }

  // Single-key shortcuts act on the page only, never behind an open dialog.
  if (mod || event.altKey || dialogStack.length) return;

  if (key === '/') {
    event.preventDefault();
    openPalette();
  } else if (key === '?') {
    event.preventDefault();
    shortcutsHelp();
  } else if (key === 'n' || key === 'N') {
    event.preventDefault();
    NEW_IN_VIEW[view]?.();
  } else if (key === 't' || key === 'T') {
    cycleTheme();
  } else if (/^[1-5]$/.test(key)) {
    navigate(NAV_ITEMS[Number(key) - 1][0]);
  }
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn');
    if (button) addRipple(event, button);

    // Links (views, notes) do their own thing; a link inside a content must
    // not also open that content's editor.
    if (event.target.closest('a[href]')) return;

    handleActions(event);
  });

  document.addEventListener('keydown', handleKeys);
  window.addEventListener('hashchange', onRoute);

  // Grades in the subject panel save when the field is left (or on Enter).
  document.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-grade]')) saveGrade(event.target);
  });

  // Another tab saved: take its data (or theme) here too, instead of
  // overwriting it with this tab's copy on the next save.
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === KEY || event.key === null) {
      reloadState();
      refreshView();
    }
    if (event.key === PREFS_KEY || event.key === null) {
      reloadPrefs();
      applyTheme();
      paintThemePicker();
      renderBackupAge();
    }
  });

  document.addEventListener('visibilitychange', refreshIfStale);
  setInterval(refreshIfStale, 60 * 1000);

  // A file dropped outside the attachment area would make the browser leave
  // the app to show it.
  const holdFileDrop = (event) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  };
  window.addEventListener('dragover', holdFileDrop);
  window.addEventListener('drop', holdFileDrop);

  $('#export')?.addEventListener('click', exportBackup);
  $('#import')?.addEventListener('click', importBackup);

  $('#file')?.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (file) importBackupFile(file);
  });

  bindSheet();
}

document.querySelectorAll('[data-mod-key]').forEach((element) => {
  element.textContent = `${MOD_KEY} K`;
});

applyTheme();
bindEvents();
refreshView({ enter: true });
pruneFiles();
