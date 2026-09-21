let view = 'home';
let filter = 'all';

function refreshView() {
  renderApp({ view, filter });
}

function applyTheme() {
  document.documentElement.dataset.theme = 'dark';
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
 * Builds a modal dialog.
 * `options.onDelete`, when given, renders a destructive action in the footer.
 */
function modal(title, body, onOk, options = {}) {
  const { okText = 'Salvar', onDelete = null } = options;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <form class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <h3>${title}</h3>
      ${body}
      <div class="foot">
        ${onDelete ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${icon('trash')}Excluir</button>` : ''}
        <button type="button" class="btn sec" data-c>Cancelar</button>
        <button class="btn">${okText}</button>
      </div>
    </form>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    overlay.style.animation = 'fade .2s reverse forwards';
    setTimeout(() => overlay.remove(), 200);
  };

  function onKeydown(event) {
    if (event.key === 'Escape') close();
  }

  document.addEventListener('keydown', onKeydown);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-c]')) close();
  });

  overlay.querySelectorAll('.colors i').forEach((colorItem) => {
    colorItem.addEventListener('click', () => {
      overlay.querySelectorAll('.colors i').forEach((item) => item.classList.remove('on'));
      colorItem.classList.add('on');
    });
  });

  const form = overlay.querySelector('form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const selectedColor = overlay.querySelector('.colors i.on');
    if (selectedColor) {
      data.color = selectedColor.style.getPropertyValue('--c');
    }
    onOk(data, close);
  });

  if (onDelete) {
    overlay.querySelector('[data-del]').addEventListener('click', () => onDelete(close));
  }

  const firstInput = overlay.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();

  return { close, overlay };
}

function deleteSubject(subjectId) {
  updateState((current) => ({
    ...current,
    subjects: current.subjects.filter((item) => item.id !== subjectId),
    absences: current.absences.filter((item) => item.sid !== subjectId),
    contents: current.contents.filter((item) => item.sid !== subjectId),
    tasks: current.tasks.filter((item) => item.sid !== subjectId),
  }));
  refreshView();
  toast('Matéria excluída');
}

function subjectForm(subject = {}) {
  const isNew = !subject.id;
  const currentColor = subject.color || COLORS[appState.subjects.length % COLORS.length];

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
      <label>Cor</label>
      <div class="colors">${COLORS.map((color) => `<i style="--c:${color}" class="${color === currentColor ? 'on' : ''}"></i>`).join('')}</div>
    `,
    (data, closeDialog) => {
      const payload = {
        ...data,
        total: Number(data.total),
        max: Number(data.max),
      };

      if (isNew) {
        updateState((current) => ({
          ...current,
          subjects: [...current.subjects, { id: uid(), ...payload }],
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
        : (closeDialog) => {
            if (!confirm('Excluir a matéria e tudo ligado a ela?')) return;
            closeDialog();
            deleteSubject(subject.id);
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

  updateState((current) => ({
    ...current,
    absences: [...current.absences, { id: uid(), ...payload, count: Number(payload.count || 1) }],
  }));

  closeDialog();
  refreshView();

  // Recomputed after the update so the warning reflects the new total.
  const ratio = used(subject) / limit(subject);
  if (ratio >= 1) {
    toast(`${subject.name}: limite de faltas atingido`);
  } else if (ratio >= 0.75) {
    toast(`Atenção: ${subject.name} está perto do limite`);
  } else {
    toast('Falta registrada');
  }
}

function absForm(subjectId = undefined) {
  if (!appState.subjects.length) {
    toast('Crie uma matéria primeiro');
    return;
  }

  const selectedId = subjectId || appState.subjects[0].id;

  modal(
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
          <input name="count" type="number" min="1" value="1" required>
        </div>
      </div>
      <label>Observação</label>
      <input name="note" placeholder="Opcional">
    `,
    (data, closeDialog) => addAbsence(data, closeDialog),
    { okText: 'Registrar' }
  );
}

function contentForm(content = {}, subjectId = '') {
  if (!appState.subjects.length) {
    toast('Crie uma matéria primeiro');
    return;
  }

  const isNew = !content.id;
  const selectedId = content.sid || subjectId || appState.subjects[0].id;

  modal(
    isNew ? 'Novo conteúdo' : 'Editar conteúdo',
    `
      <label>Matéria</label>
      <select name="sid">${subOptions(selectedId)}</select>
      <label>Título / tópico</label>
      <input name="title" required value="${esc(content.title)}" placeholder="Ex.: Integrais por partes">
      <label>Anotações</label>
      <textarea name="notes" placeholder="Resumo, links, fórmulas...">${esc(content.notes)}</textarea>
    `,
    (data, closeDialog) => {
      if (isNew) {
        updateState((current) => ({
          ...current,
          contents: [...current.contents, { id: uid(), done: false, ...data }],
        }));
      } else {
        updateState((current) => ({
          ...current,
          contents: current.contents.map((item) => (item.id === content.id ? { ...item, ...data } : item)),
        }));
      }
      closeDialog();
      refreshView();
      toast('Conteúdo salvo');
    }
  );
}

function taskForm() {
  modal(
    'Nova tarefa',
    `
      <label>Título</label>
      <input name="title" required placeholder="Ex.: Prova 1 de Física">
      <div class="two">
        <div>
          <label>Matéria</label>
          <select name="sid"><option value="">—</option>${subOptions()}</select>
        </div>
        <div>
          <label>Data</label>
          <input name="due" type="date">
        </div>
      </div>
    `,
    (data, closeDialog) => {
      updateState((current) => ({
        ...current,
        tasks: [...current.tasks, { id: uid(), done: false, ...data }],
      }));
      closeDialog();
      refreshView();
      toast('Tarefa criada');
    },
    { okText: 'Criar' }
  );
}

function handleActions(event) {
  const trigger = event.target.closest('[data-f]');
  if (trigger) {
    filter = trigger.dataset.f;
    refreshView();
    return;
  }

  const navButton = event.target.closest('[data-v]');
  if (navButton) {
    view = navButton.dataset.v;
    filter = 'all';
    refreshView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const actionButton = event.target.closest('[data-a]');
  if (!actionButton) return;

  const { a, id } = actionButton.dataset;

  const actions = {
    'new-subj': () => subjectForm(),
    'edit-subj': () => subjectForm(getSubject(id)),
    'del-subj': () => {
      const subject = getSubject(id);
      if (!subject) return;
      if (!confirm(`Excluir a matéria "${subject.name}" e todo o conteúdo relacionado?`)) return;
      deleteSubject(id);
    },
    'quick-abs': () => addAbsence({ sid: id, date: today(), count: 1, note: '' }, () => {}),
    'new-abs': () => absForm(filter !== 'all' ? filter : undefined),
    'del-abs': () => {
      removeItemWithAnimation(actionButton, () => {
        updateState((current) => ({
          ...current,
          absences: current.absences.filter((item) => item.id !== id),
        }));
        refreshView();
      });
    },
    'new-cont': () => contentForm({}, id),
    'edit-cont': () => contentForm(getContent(id)),
    'tog-cont': () => {
      updateState((current) => ({
        ...current,
        contents: current.contents.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
      }));
      refreshView();
      if (getContent(id)?.done) toast('Conteúdo concluído');
    },
    'del-cont': () => {
      removeItemWithAnimation(actionButton, () => {
        updateState((current) => ({
          ...current,
          contents: current.contents.filter((item) => item.id !== id),
        }));
        refreshView();
      });
    },
    'new-task': () => taskForm(),
    'tog-task': () => {
      updateState((current) => ({
        ...current,
        tasks: current.tasks.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
      }));
      refreshView();
      if (getTask(id)?.done) toast('Tarefa concluída');
    },
    'del-task': () => {
      removeItemWithAnimation(actionButton, () => {
        updateState((current) => ({
          ...current,
          tasks: current.tasks.filter((item) => item.id !== id),
        }));
        refreshView();
      });
    },
  };

  if (actions[a]) {
    // Chips live inside a clickable card; keep the card handler from firing too.
    event.stopPropagation();
    actions[a]();
  }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'meu-semestre-backup.json';
  anchor.click();
  URL.revokeObjectURL(url);
  toast('Backup baixado');
}

function importBackup() {
  $('#file')?.click();
}

function bindSheet() {
  const sheet = $('#sheet');
  const moreButton = $('#more');
  if (!sheet || !moreButton) return;

  const openSheet = () => {
    sheet.hidden = false;
    moreButton.setAttribute('aria-expanded', 'true');
  };

  const closeSheet = () => {
    sheet.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
  };

  moreButton.addEventListener('click', openSheet);

  sheet.addEventListener('click', (event) => {
    const item = event.target.closest('[data-sheet]');
    if (item) {
      closeSheet();
      if (item.dataset.sheet === 'export') exportBackup();
      else importBackup();
      return;
    }
    if (event.target === sheet) closeSheet();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sheet.hidden) closeSheet();
  });
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn');
    if (button) addRipple(event, button);

    handleActions(event);
  });

  $('#export')?.addEventListener('click', exportBackup);
  $('#import')?.addEventListener('click', importBackup);

  $('#file')?.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        replaceState({ ...DEFAULT_STATE, ...parsed });
        applyTheme();
        refreshView();
        toast('Backup importado');
      } catch {
        toast('Arquivo inválido');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  bindSheet();
}

applyTheme();
bindEvents();
refreshView();
