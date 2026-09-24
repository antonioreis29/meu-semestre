// Command palette: one box to find any subject, task or content, or to run any
// action, without leaving the keyboard. The corpus is built once per opening
// and filtered in memory on each keystroke; nothing is indexed ahead of time.

const PALETTE_GROUPS = ['Matérias', 'Tarefas', 'Conteúdos', 'Ações'];
const PALETTE_PER_GROUP = 8;

let paletteClose = null;

function paletteActions() {
  const hasSubjects = appState.subjects.length > 0;

  return [
    { icon: 'plus', label: 'Nova tarefa', hint: 'Tarefa, prova ou trabalho', run: () => taskForm() },
    hasSubjects && { icon: 'plus', label: 'Registrar falta', hint: 'Hoje, em qualquer matéria', run: () => absForm() },
    hasSubjects && { icon: 'plus', label: 'Novo conteúdo', hint: 'Anotações e anexos', run: () => contentForm() },
    { icon: 'plus', label: 'Nova matéria', run: () => subjectForm() },
    ...NAV_ITEMS.map(([key, iconName, label], index) => ({
      icon: iconName,
      label: `Ir para ${label}`,
      key: String(index + 1),
      run: () => navigate(key),
    })),
    { icon: 'theme', label: 'Aparência', hint: 'Aurora, Argila, Argila noturno ou automático', run: themePicker },
    // Only listed when searched for, to keep the default list short.
    ...THEMES.map((theme) => ({
      icon: 'theme',
      label: `Tema ${theme.name}`,
      hint: theme.hint,
      searchOnly: true,
      run: () => setTheme(theme.id),
    })),
    { icon: 'download', label: 'Exportar backup', hint: 'Dados e anexos em um arquivo JSON', run: exportBackup },
    { icon: 'upload', label: 'Importar backup', run: importBackup },
    { icon: 'keyboard', label: 'Atalhos de teclado', key: '?', run: shortcutsHelp },
  ]
    .filter(Boolean)
    .map((action) => ({ ...action, group: 'Ações' }));
}

function paletteRecords() {
  const subjects = appState.subjects.map((subject) => ({
    group: 'Matérias',
    icon: 'book',
    color: subject.color,
    label: subject.name,
    hint: [subject.prof, absenceNote(subject)].filter(Boolean).join(' · '),
    run: () => subjectDetail(subject.id),
  }));

  const tasks = sortTasks(appState.tasks).map((task) => {
    const subject = getSubject(task.sid);
    return {
      group: 'Tarefas',
      icon: task.done ? 'check' : (TASK_KINDS[task.kind] || TASK_KINDS.tarefa)[0],
      color: subject?.color,
      label: task.title,
      hint: [subject?.name, task.done ? 'Concluída' : dueLabel(task)].filter(Boolean).join(' · '),
      run: () => taskForm(task),
    };
  });

  const contents = appState.contents.map((content) => {
    const subject = getSubject(content.sid);
    return {
      group: 'Conteúdos',
      icon: 'notes',
      color: subject?.color,
      label: content.title,
      hint: [subject?.name, content.notes?.split('\n')[0]].filter(Boolean).join(' · '),
      // Notes and attachment names are searchable, not only the title.
      extra: [content.notes, ...(content.files || []).map((file) => file.name)].join(' '),
      run: () => contentForm(content),
    };
  });

  return [...subjects, ...tasks, ...contents];
}

/** Keeps each group in a fixed order and ranks inside it: prefix, then substring, then elsewhere. */
function searchPalette(items, query) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return items.filter((item) => item.group === 'Ações' && !item.searchOnly);

  const phrase = terms.join(' ');
  const rank = (item) => {
    if (item.plainLabel.startsWith(phrase)) return 0;
    if (item.plainLabel.includes(phrase)) return 1;
    return terms.every((term) => item.plainLabel.includes(term)) ? 2 : 3;
  };

  const matches = items
    .filter((item) => terms.every((term) => item.plainText.includes(term)))
    .map((item) => [rank(item), item]);

  return PALETTE_GROUPS.flatMap((group) =>
    matches
      .filter(([, item]) => item.group === group)
      .sort((a, b) => a[0] - b[0])
      .slice(0, PALETTE_PER_GROUP)
      .map(([, item]) => item)
  );
}

/** Marks where each term sits in the label; skipped if accents changed the length. */
function highlight(label, terms) {
  const plain = norm(label);
  if (plain.length !== label.length) return esc(label);

  const ranges = terms
    .map((term) => [plain.indexOf(term), term.length])
    .filter(([start]) => start >= 0)
    .sort((a, b) => a[0] - b[0]);

  let html = '';
  let cursor = 0;
  for (const [start, length] of ranges) {
    if (start < cursor) continue;
    html += `${esc(label.slice(cursor, start))}<mark>${esc(label.slice(start, start + length))}</mark>`;
    cursor = start + length;
  }
  return html + esc(label.slice(cursor));
}

function togglePalette() {
  if (paletteClose) paletteClose();
  else openPalette();
}

function openPalette() {
  if (paletteClose) return;

  const items = [...paletteRecords(), ...paletteActions()].map((item) => ({
    ...item,
    plainLabel: norm(item.label),
    plainText: norm(`${item.label} ${item.hint || ''} ${item.extra || ''} ${item.group}`),
  }));

  const { close, overlay } = openOverlay(
    `
      <div class="modal palette" role="dialog" aria-modal="true" aria-label="Buscar">
        <div class="palette-field">
          ${icon('search')}
          <input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"
            autocomplete="off" spellcheck="false" placeholder="Buscar matérias, tarefas, conteúdos ou ações…">
          <kbd>Esc</kbd>
        </div>
        <div class="palette-list" id="palette-list" role="listbox" aria-label="Resultados"></div>
        <div class="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </div>
    `,
    () => {
      paletteClose = null;
    },
    'top'
  );

  paletteClose = close;

  const input = overlay.querySelector('input');
  const list = overlay.querySelector('.palette-list');
  let results = [];
  let active = 0;

  const paintActive = () => {
    list.querySelectorAll('.palette-opt').forEach((option) => {
      const on = Number(option.dataset.i) === active;
      option.classList.toggle('on', on);
      option.setAttribute('aria-selected', String(on));
      if (on) option.scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', results.length ? `po-${active}` : '');
  };

  const paint = () => {
    const terms = norm(input.value).split(/\s+/).filter(Boolean);
    results = searchPalette(items, input.value);
    active = 0;

    if (!results.length) {
      list.innerHTML = `<div class="palette-empty">Nada encontrado para “${esc(input.value.trim())}”.</div>`;
      paintActive();
      return;
    }

    let lastGroup = '';
    list.innerHTML = results
      .map((item, index) => {
        const header = item.group !== lastGroup ? `<div class="palette-group" role="presentation">${item.group}</div>` : '';
        lastGroup = item.group;
        return `
          ${header}
          <div class="palette-opt" id="po-${index}" role="option" data-i="${index}" aria-selected="false">
            <span class="opt-ico" ${item.color ? `style="--c:${item.color}"` : ''}>${icon(item.icon)}</span>
            <span class="opt-text">
              <b>${highlight(item.label, terms)}</b>
              ${item.hint ? `<small>${esc(item.hint)}</small>` : ''}
            </span>
            ${item.key ? `<kbd>${item.key}</kbd>` : ''}
          </div>
        `;
      })
      .join('');
    paintActive();
  };

  const run = (item) => {
    if (!item) return;
    close();
    item.run();
  };

  input.addEventListener('input', paint);

  input.addEventListener('keydown', (event) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step && results.length) {
      event.preventDefault();
      active = (active + step + results.length) % results.length;
      paintActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(results[active]);
    }
  });

  list.addEventListener('click', (event) => {
    const option = event.target.closest('[data-i]');
    if (option) run(results[Number(option.dataset.i)]);
  });

  list.addEventListener('mousemove', (event) => {
    const option = event.target.closest('[data-i]');
    if (option && Number(option.dataset.i) !== active) {
      active = Number(option.dataset.i);
      paintActive();
    }
  });

  paint();
  input.focus();
}

const SHORTCUTS = [
  [[MOD_KEY, 'K'], 'Buscar e executar ações'],
  [['/'], 'Buscar'],
  [['N'], 'Criar um item na tela atual'],
  [['1', '–', '5'], 'Ir para Início, Matérias, Faltas, Conteúdo, Tarefas'],
  [['T'], 'Alternar o tema'],
  [[MOD_KEY, 'Z'], 'Desfazer a última exclusão'],
  [['?'], 'Mostrar estes atalhos'],
  [['Esc'], 'Fechar a janela aberta'],
];

function shortcutsHelp() {
  const { overlay } = openOverlay(`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="keys-title">
      <div class="modal-head">
        <h3 id="keys-title">Atalhos de teclado</h3>
        <button type="button" class="icon-btn" data-c aria-label="Fechar">${icon('close')}</button>
      </div>
      <dl class="keys">
        ${SHORTCUTS.map(
          ([keys, text]) => `
            <div>
              <dt>${keys.map((key) => (key === '–' ? '<span>–</span>' : `<kbd>${key}</kbd>`)).join('')}</dt>
              <dd>${text}</dd>
            </div>
          `
        ).join('')}
      </dl>
    </div>
  `);
  overlay.querySelector('[data-c]').focus();
}
