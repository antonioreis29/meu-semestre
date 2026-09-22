const NAV_ITEMS = [
  ['home', 'home', 'Início'],
  ['subjects', 'book', 'Matérias'],
  ['absences', 'absence', 'Faltas'],
  ['contents', 'notes', 'Conteúdo'],
  ['tasks', 'tasks', 'Tarefas'],
];

const STATUS_ICON = {
  ok: 'check',
  warn: 'alert',
  bad: 'alert',
};

function renderNav(currentView) {
  const nav = document.getElementById('nav');
  if (!nav) return;

  nav.innerHTML = NAV_ITEMS.map(
    ([key, iconName, label]) => `
      <button class="${currentView === key ? 'on' : ''}" data-v="${key}" ${currentView === key ? 'aria-current="page"' : ''} title="${label}">
        ${icon(iconName)}
        <span class="nav-label">${label}</span>
      </button>
    `
  ).join('');
}

function filtersMarkup(currentFilter) {
  return `
    <div class="filters" role="group" aria-label="Filtrar por matéria">
      <button class="chip ${currentFilter === 'all' ? 'on' : ''}" data-f="all">Todas</button>
      ${appState.subjects
        .map(
          (subject) =>
            `<button class="chip ${currentFilter === subject.id ? 'on' : ''}" data-f="${subject.id}">${esc(subject.name)}</button>`
        )
        .join('')}
    </div>
  `;
}

function statCard(value, label, iconName, tone, index) {
  // Second value fills the icon tile; the glyph is punched out of it in near-black,
  // which stays legible on every hue in a way a coloured glyph did not.
  const tones = {
    accent: ['rgba(124,140,255,.16)', '#8c9bff'],
    bad: ['rgba(242,118,108,.16)', '#f58278'],
    ok: ['rgba(70,211,165,.16)', '#4fd6aa'],
    warn: ['rgba(239,180,92,.16)', '#f0b862'],
  };
  const [bg, ink] = tones[tone] || tones.accent;

  return `
    <div class="card stat" style="--i:${index};--tone:${bg};--tone-ink:${ink}">
      <span class="stat-ico">${icon(iconName)}</span>
      <div class="stat-body">
        <b data-n="${value}">0</b>
        <span>${label}</span>
      </div>
    </div>
  `;
}

function subjectCard(subject, index) {
  const [stateKey, text] = subjectState(subject);

  return `
    <article class="card hov subj" style="--c:${subject.color};--i:${index}" data-a="open-subj" data-id="${subject.id}" tabindex="0" aria-label="Abrir ${esc(subject.name)}">
      <div class="row">
        ${ringHTML(subject)}
        <div>
          <h3 title="${esc(subject.name)}">${esc(subject.name)}</h3>
          <small>${esc(subject.prof || 'Sem professor')}</small>
          <span class="pill status-${stateKey}">${icon(STATUS_ICON[stateKey])}${text}</span>
        </div>
      </div>
      <div class="actions">
        <button class="chip" data-a="quick-abs" data-id="${subject.id}">${icon('plus')}Falta</button>
        <button class="chip" data-a="new-cont" data-id="${subject.id}">${icon('notes')}Conteúdo</button>
        <button class="chip chip-edit" data-a="edit-subj" data-id="${subject.id}" aria-label="Editar ${esc(subject.name)}" title="Editar matéria">${icon('edit')}</button>
      </div>
      <button class="x" data-a="del-subj" data-id="${subject.id}" aria-label="Excluir ${esc(subject.name)}">${icon('trash')}</button>
    </article>
  `;
}

/** Pending first, then by due date; undated tasks sink to the end of each group. */
const sortTasks = (tasks) =>
  [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9').localeCompare(b.due || '9'));

// `showSubject` is off inside the subject panel, where the tag would only repeat its title.
function taskItem(task, index, showSubject = true) {
  const subject = getSubject(task.sid);
  const isLate = !task.done && task.due && task.due < today();

  return `
    <div class="item ${task.done ? 'done' : ''}" style="--c:${subject ? subject.color : 'var(--accent)'};--i:${index}">
      <button class="check ${task.done ? 'on' : ''}" data-a="tog-task" data-id="${task.id}" role="checkbox" aria-checked="${task.done ? 'true' : 'false'}" aria-label="Concluir ${esc(task.title)}">${icon('check')}</button>
      <div class="grow">
        <div class="t">
          <b>${esc(task.title)}</b>
          ${subject && showSubject ? `<span class="tag" style="--c:${subject.color}">${esc(subject.name)}</span>` : ''}
        </div>
        <p class="${isLate ? 'status-bad' : ''}"><span class="meta">${icon('clock')}${task.due ? `${isLate ? 'Atrasada · ' : ''}${fmt(task.due)}` : 'Sem data'}</span></p>
      </div>
      <button class="x" data-a="del-task" data-id="${task.id}" aria-label="Excluir tarefa">${icon('close')}</button>
    </div>
  `;
}

function attachmentsMarkup(files = []) {
  if (!files.length) return '';

  return `
    <div class="files">
      ${files
        .map(
          (file) => `
            <button class="file" data-a="open-file" data-id="${file.id}" title="Abrir ${esc(file.name)}">
              ${icon('clip')}<span>${esc(file.name)}</span><small>${fmtSize(file.size)}</small>
            </button>
          `
        )
        .join('')}
    </div>
  `;
}

function contentItem(content, index, showSubject = true) {
  const subject = getSubject(content.sid);
  if (!subject) return '';

  return `
    <div class="item ${content.done ? 'done' : ''}" style="--c:${subject.color};--i:${index}">
      <button class="check ${content.done ? 'on' : ''}" data-a="tog-cont" data-id="${content.id}" role="checkbox" aria-checked="${content.done ? 'true' : 'false'}" aria-label="Marcar como estudado">${icon('check')}</button>
      <div class="grow" data-a="edit-cont" data-id="${content.id}" style="cursor:pointer">
        <div class="t">
          ${showSubject ? `<span class="tag" style="--c:${subject.color}">${esc(subject.name)}</span>` : ''}
          <b>${esc(content.title)}</b>
        </div>
        ${content.notes ? `<p>${esc(content.notes)}</p>` : ''}
        ${attachmentsMarkup(content.files)}
      </div>
      <button class="x" data-a="del-cont" data-id="${content.id}" aria-label="Excluir conteúdo">${icon('close')}</button>
    </div>
  `;
}

function ringHTML(subject) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const visibility = circumference * (1 - pct(subject));

  return `
    <div class="ring" style="--c:${ringColor(subject)}">
      <svg viewBox="0 0 74 74" width="74" height="74" aria-hidden="true">
        <circle class="bg" cx="37" cy="37" r="${radius}"></circle>
        <circle class="fg" cx="37" cy="37" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" data-off="${visibility}"></circle>
      </svg>
      <span>${used(subject)}/${limit(subject)}</span>
    </div>
  `;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function todayLabel() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function renderHome() {
  const pendingTasks = appState.tasks.filter((task) => !task.done);
  const studiedContents = appState.contents.filter((content) => content.done).length;
  const riskySubjects = appState.subjects.filter((subject) => pct(subject) >= 0.75);
  const totalAbsences = appState.absences.reduce((total, absence) => total + Number(absence.count || 0), 0);
  const nextDeliveries = pendingTasks
    .filter((task) => task.due)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 4);

  return `
    <header class="top">
      <div>
        <span class="eyebrow">${icon('sparkle')}${todayLabel()}</span>
        <h1>${greeting()}</h1>
        <p class="sub">Aqui está o resumo do seu semestre.</p>
      </div>
    </header>

    <div class="stats">
      ${statCard(appState.subjects.length, 'Matérias', 'book', 'accent', 0)}
      ${statCard(totalAbsences, 'Faltas no total', 'absence', 'bad', 1)}
      ${statCard(studiedContents, 'Conteúdos vistos', 'notes', 'ok', 2)}
      ${statCard(pendingTasks.length, 'Tarefas pendentes', 'tasks', 'warn', 3)}
    </div>

    ${riskySubjects.length
      ? `<h2>Cuidado com as faltas</h2><div class="grid">${riskySubjects.map((subject, index) => subjectCard(subject, index)).join('')}</div>`
      : ''}

    <h2>Próximas entregas</h2>
    ${nextDeliveries.length
      ? `<div class="list">${nextDeliveries.map((task, index) => taskItem(task, index)).join('')}</div>`
      : createEmptyState('inbox', 'Nenhuma entrega com data', 'Que paz! Cadastre uma tarefa quando um prazo aparecer.')}
  `;
}

function renderSubjects() {
  return `
    <header class="top">
      <div>
        <h1>Matérias</h1>
        <p class="sub">Clique em uma matéria para ver tarefas e conteúdos, ou no lápis para editar.</p>
      </div>
      <button class="btn" data-a="new-subj">${icon('plus')}Nova matéria</button>
    </header>
    ${appState.subjects.length
      ? `<div class="grid">${appState.subjects.map((subject, index) => subjectCard(subject, index)).join('')}</div>`
      : createEmptyState('book', 'Nenhuma matéria ainda', 'Crie a primeira para começar a controlar faltas e conteúdos.')}
  `;
}

function needsSubjectState() {
  return createEmptyState(
    'book',
    'Cadastre uma matéria primeiro',
    'Vá até a aba <b>Matérias</b> e crie uma para liberar esta seção.'
  );
}

function renderAbsences(currentFilter) {
  if (!appState.subjects.length) return needsSubjectState();

  const list = appState.absences
    .filter((absence) => currentFilter === 'all' || absence.sid === currentFilter)
    .sort((a, b) => b.date.localeCompare(a.date));

  return `
    <header class="top">
      <div>
        <h1>Faltas</h1>
        <p class="sub">Histórico e controle de limite.</p>
      </div>
      <button class="btn" data-a="new-abs">${icon('plus')}Registrar falta</button>
    </header>
    ${filtersMarkup(currentFilter)}
    ${list.length
      ? `<div class="list">${list
          .map((absence, index) => {
            const subject = getSubject(absence.sid);
            if (!subject) return '';
            return `
              <div class="item" style="--c:${subject.color};--i:${index}" data-id="${absence.id}">
                <div class="grow">
                  <div class="t">
                    <b>${esc(subject.name)}</b>
                    <span class="tag" style="--c:${subject.color}">${absence.count} falta${absence.count > 1 ? 's' : ''}</span>
                  </div>
                  <p><span class="meta">${icon('clock')}${fmt(absence.date)}</span>${absence.note ? ` — ${esc(absence.note)}` : ''}</p>
                </div>
                <button class="x" data-a="del-abs" data-id="${absence.id}" aria-label="Excluir falta">${icon('close')}</button>
              </div>
            `;
          })
          .join('')}</div>`
      : createEmptyState('check', 'Nenhuma falta registrada', 'Continue assim — sua frequência está em dia.')}
  `;
}

function renderContents(currentFilter) {
  if (!appState.subjects.length) return needsSubjectState();

  const list = appState.contents.filter((content) => currentFilter === 'all' || content.sid === currentFilter);

  return `
    <header class="top">
      <div>
        <h1>Conteúdo</h1>
        <p class="sub">Tópicos, resumos e o que já foi estudado.</p>
      </div>
      <button class="btn" data-a="new-cont">${icon('plus')}Novo conteúdo</button>
    </header>
    ${filtersMarkup(currentFilter)}
    ${list.length
      ? `<div class="list">${list.map((content, index) => contentItem(content, index)).join('')}</div>`
      : createEmptyState('notes', 'Nada por aqui ainda', 'Anote o que aprendeu para revisar antes das provas.')}
  `;
}

function renderTasks() {
  const list = sortTasks(appState.tasks);

  return `
    <header class="top">
      <div>
        <h1>Tarefas e provas</h1>
        <p class="sub">Nunca perca um prazo.</p>
      </div>
      <button class="btn" data-a="new-task">${icon('plus')}Nova tarefa</button>
    </header>
    ${list.length
      ? `<div class="list">${list.map((task, index) => taskItem(task, index)).join('')}</div>`
      : createEmptyState('tasks', 'Sem tarefas', 'Aproveite a folga — ou adiante algo do próximo mês.')}
  `;
}

/** Inner markup of the subject panel opened from a subject card. */
function renderSubjectDetail(subject) {
  const [stateKey, text] = subjectState(subject);
  const tasks = sortTasks(appState.tasks.filter((task) => task.sid === subject.id));
  const contents = appState.contents.filter((content) => content.sid === subject.id);

  return `
    <header class="detail-head">
      ${ringHTML(subject)}
      <div class="grow">
        <h3>${esc(subject.name)}</h3>
        <small>${esc(subject.prof || 'Sem professor')}</small>
        <span class="pill status-${stateKey}">${icon(STATUS_ICON[stateKey])}${text}</span>
      </div>
      <div class="detail-tools">
        <button class="icon-btn" data-a="edit-subj" data-id="${subject.id}" aria-label="Editar matéria" title="Editar matéria">${icon('edit')}</button>
        <button class="icon-btn" data-c aria-label="Fechar" title="Fechar">${icon('close')}</button>
      </div>
    </header>

    <section class="detail-sec">
      <div class="detail-sec-head">
        <h4>${icon('tasks')}Tarefas<span class="count">${tasks.length}</span></h4>
        <button class="chip" data-a="new-task" data-id="${subject.id}">${icon('plus')}Nova tarefa</button>
      </div>
      ${tasks.length
        ? `<div class="list">${tasks.map((task, index) => taskItem(task, index, false)).join('')}</div>`
        : createEmptyState('tasks', 'Nenhuma tarefa', 'Provas e trabalhos desta matéria aparecem aqui.')}
    </section>

    <section class="detail-sec">
      <div class="detail-sec-head">
        <h4>${icon('notes')}Conteúdos<span class="count">${contents.length}</span></h4>
        <button class="chip" data-a="new-cont" data-id="${subject.id}">${icon('plus')}Novo conteúdo</button>
      </div>
      ${contents.length
        ? `<div class="list">${contents.map((content, index) => contentItem(content, index, false)).join('')}</div>`
        : createEmptyState('notes', 'Nenhum conteúdo', 'Anote os tópicos desta matéria para revisar depois.')}
    </section>
  `;
}

function renderApp({ view, filter }) {
  renderNav(view);

  const contentMap = {
    home: renderHome,
    subjects: renderSubjects,
    absences: () => renderAbsences(filter),
    contents: () => renderContents(filter),
    tasks: renderTasks,
  };

  const main = document.getElementById('main');
  if (main) {
    main.innerHTML = `<div class="view">${contentMap[view]?.() || ''}</div>`;
  }

  animateRings();
  numberAnimation();
}
