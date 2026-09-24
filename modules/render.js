const NAV_ITEMS = [
  ['home', 'home', 'Início'],
  ['subjects', 'book', 'Matérias'],
  ['absences', 'absence', 'Faltas'],
  ['contents', 'notes', 'Conteúdo'],
  ['tasks', 'tasks', 'Tarefas'],
];

/** Address of each view, in Portuguese like everything else the user reads. */
const ROUTES = {
  home: 'inicio',
  subjects: 'materias',
  absences: 'faltas',
  contents: 'conteudos',
  tasks: 'tarefas',
};

/** The view a location hash points at; anything unknown or malformed (say "#%") opens Início. */
function routeFromHash(hash) {
  let slug = '';
  try {
    slug = decodeURIComponent(hash.slice(1));
  } catch {
    // not valid percent-encoding
  }
  return Object.keys(ROUTES).find((key) => ROUTES[key] === slug) || 'home';
}

const STATUS_ICON = {
  ok: 'check',
  warn: 'alert',
  bad: 'alert',
};

const TASK_KINDS = {
  tarefa: ['tasks', 'Tarefa'],
  prova: ['flag', 'Prova'],
  trabalho: ['briefcase', 'Trabalho'],
};

const TASK_GROUPS = [
  ['late', 'Atrasadas'],
  ['today', 'Hoje'],
  ['tomorrow', 'Amanhã'],
  ['week', 'Próximos 7 dias'],
  ['later', 'Mais adiante'],
  ['undated', 'Sem data'],
];

const BACKUP_NUDGE_DAYS = 14;

function taskBucket(task) {
  if (!task.due) return 'undated';
  const diff = dayDiff(task.due);
  if (diff < 0) return 'late';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

/** Pending first, then by due date; undated tasks sink to the end of each group. */
const sortTasks = (tasks) =>
  [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9').localeCompare(b.due || '9'));

function renderNav(currentView) {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const pending = appState.tasks.filter((task) => !task.done);
  const urgent = pending.some((task) => task.due && dayDiff(task.due) <= 0);

  nav.innerHTML = NAV_ITEMS.map(([key, iconName, label]) => {
    const on = currentView === key;
    const count = key === 'tasks' ? pending.length : 0;
    return `
      <a class="nav-item ${on ? 'on' : ''}" href="#${ROUTES[key]}" ${on ? 'aria-current="page"' : ''} title="${label}">
        ${icon(iconName)}
        <span class="nav-label">${label}</span>
        ${count ? `<span class="badge ${urgent ? 'hot' : ''}"><span class="sr-only">, </span>${count}<span class="sr-only"> pendentes</span></span>` : ''}
      </a>
    `;
  }).join('');
}

/** Last export under the sidebar button, and a nudge once it gets old. */
function renderBackupAge() {
  const label = $('#backup-age');
  const button = $('#export');
  if (!label || !button) return;

  const hasData = appState.subjects.length > 0;
  const at = prefs.backupAt;
  const stale = hasData && (!at || -dayDiff(isoDay(new Date(at))) >= BACKUP_NUDGE_DAYS);

  label.textContent = at ? `Último: ${ago(at)}` : hasData ? 'Nenhum backup ainda' : '';
  button.classList.toggle('nudge', stale);
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

function statCard({ value, label, iconName, tone, view, index }) {
  // The number is rendered final; numberAnimation counts it up only when the view enters.
  return `
    <a class="card stat hov tone-${tone}" href="#${ROUTES[view]}" style="--i:${index}">
      <span class="stat-ico">${icon(iconName)}</span>
      <span class="stat-body">
        <b data-n="${value}">${value}</b>
        <span>${label}</span>
      </span>
    </a>
  `;
}

function ringHTML(subject) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct(subject));

  return `
    <div class="ring" style="--c:${ringColor(subject)}">
      <svg viewBox="0 0 74 74" width="74" height="74" aria-hidden="true">
        <circle class="bg" cx="37" cy="37" r="${radius}"></circle>
        <circle class="fg" cx="37" cy="37" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" style="--len:${circumference}"></circle>
      </svg>
      <span>${used(subject)}/${limit(subject)}</span>
    </div>
  `;
}

/** "Aprovado · 7,5", "Final: precisa de 4"…, toned by the outcome; empty until a grade is in. */
function gradeMeta(subject) {
  const { label, tone } = gradeStatus(subject);
  if (!label) return '';
  return `<span class="${tone ? `status-${tone}` : ''}">${icon('grade')}${label}</span>`;
}

/** Tooltip of the one-click absence button, which counts every class of the day. */
function quickAbsenceTitle(subject) {
  return `Registrar ${plural(classesOn(subject) || 1, 'falta', 'faltas')} hoje`;
}

function subjectCard(subject, index) {
  const [stateKey] = subjectState(subject);
  const { contents, studied, pending } = tally(subject.id);

  return `
    <article class="card hov subj" style="--c:${subject.color};--i:${index}" data-a="open-subj" data-id="${subject.id}" tabindex="0" aria-label="Abrir ${esc(subject.name)}">
      <div class="row">
        ${ringHTML(subject)}
        <div>
          <h3 title="${esc(subject.name)}">${esc(subject.name)}</h3>
          <small>${esc(subject.prof || 'Sem professor')}</small>
          <span class="pill status-${stateKey}">${icon(STATUS_ICON[stateKey])}${absenceNote(subject)}</span>
        </div>
      </div>
      <div class="subj-meta">
        <span>${icon('notes')}${contents ? `${studied}/${contents} estudados` : 'Sem conteúdos'}</span>
        <span>${icon('tasks')}${pending ? plural(pending, 'pendente', 'pendentes') : 'Nada pendente'}</span>
        ${gradeMeta(subject)}
      </div>
      <div class="actions">
        <button class="chip" data-a="quick-abs" data-id="${subject.id}" title="${quickAbsenceTitle(subject)}">${icon('plus')}Falta</button>
        <button class="chip" data-a="new-cont" data-id="${subject.id}">${icon('notes')}Conteúdo</button>
        <button class="chip chip-edit" data-a="edit-subj" data-id="${subject.id}" aria-label="Editar ${esc(subject.name)}" title="Editar matéria">${icon('edit')}</button>
      </div>
      <button class="x" data-a="del-subj" data-id="${subject.id}" aria-label="Excluir ${esc(subject.name)}">${icon('trash')}</button>
    </article>
  `;
}

function dueLabel(task) {
  if (!task.due) return 'Sem data';
  const diff = dayDiff(task.due);
  if (!task.done && diff < 0) return diff === -1 ? 'Atrasada desde ontem' : `Atrasada há ${-diff} dias`;
  return relDay(task.due);
}

// `showSubject` is off inside the subject panel, where the tag would only repeat its title.
function taskItem(task, index, showSubject = true) {
  const subject = getSubject(task.sid);
  const diff = task.due ? dayDiff(task.due) : null;
  const tone = task.done || diff === null ? '' : diff < 0 ? 'status-bad' : diff === 0 ? 'status-warn' : '';
  const [kindIcon, kindLabel] = TASK_KINDS[task.kind] || TASK_KINDS.tarefa;

  return `
    <div class="item ${task.done ? 'done' : ''}" style="--c:${subject ? subject.color : 'var(--accent)'};--i:${index}">
      <button class="check ${task.done ? 'on' : ''}" data-a="tog-task" data-id="${task.id}" role="checkbox" aria-checked="${task.done ? 'true' : 'false'}" aria-label="Concluir ${esc(task.title)}">${icon('check')}</button>
      <div class="grow" data-a="edit-task" data-id="${task.id}" tabindex="0" role="button">
        <div class="t">
          ${task.kind !== 'tarefa' ? `<span class="kind kind-${task.kind}">${icon(kindIcon)}${kindLabel}</span>` : ''}
          <b>${esc(task.title)}</b>
          ${subject && showSubject ? `<span class="tag" style="--c:${subject.color}">${esc(subject.name)}</span>` : ''}
        </div>
        <p class="${tone}"><span class="meta" ${task.due ? `title="${fmtLong(task.due)}"` : ''}>${icon(tone === 'status-bad' ? 'alert' : 'clock')}${dueLabel(task)}</span></p>
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
      <div class="grow" data-a="edit-cont" data-id="${content.id}" tabindex="0">
        <div class="t">
          ${showSubject ? `<span class="tag" style="--c:${subject.color}">${esc(subject.name)}</span>` : ''}
          <b>${esc(content.title)}</b>
        </div>
        ${content.notes ? `<p class="notes">${linkify(esc(content.notes))}</p>` : ''}
        ${attachmentsMarkup(content.files)}
      </div>
      <button class="x" data-a="del-cont" data-id="${content.id}" aria-label="Excluir conteúdo">${icon('close')}</button>
    </div>
  `;
}

// Inside the subject panel the subject is known, so the date takes the title.
function absenceItem(absence, index, showSubject = true) {
  const subject = getSubject(absence.sid);
  if (!subject) return '';
  const count = Number(absence.count || 1);
  const day = `${WEEKDAYS[weekday(absence.date)]}, ${fmt(absence.date)}`;

  return `
    <div class="item" style="--c:${subject.color};--i:${index}">
      <div class="grow">
        <div class="t">
          <b>${showSubject ? esc(subject.name) : day}</b>
          <span class="tag" style="--c:${subject.color}">${plural(count, 'falta', 'faltas')}</span>
        </div>
        ${showSubject || absence.note
          ? `<p>${showSubject ? `<span class="meta" title="${fmtLong(absence.date)}">${icon('clock')}${day}</span>` : ''}${absence.note ? `${showSubject ? ' — ' : ''}${esc(absence.note)}` : ''}</p>`
          : ''}
      </div>
      <button class="x" data-a="del-abs" data-id="${absence.id}" aria-label="Excluir falta">${icon('close')}</button>
    </div>
  `;
}

function freqRow(subject, index) {
  const [stateKey] = subjectState(subject);

  return `
    <div class="freq-row" data-a="open-subj" data-id="${subject.id}" tabindex="0" style="--c:${subject.color};--bar:${ringColor(subject)};--i:${index}">
      <i class="dot"></i>
      <span class="freq-name">${esc(subject.name)}<small class="status-${stateKey}">${absenceNote(subject)}</small></span>
      <span class="bar" aria-hidden="true"><i style="width:${Math.round(pct(subject) * 100)}%"></i></span>
      <span class="freq-num" title="Faltas usadas / limite">${used(subject)}/${limit(subject)}</span>
      <button class="mini-btn" data-a="quick-abs" data-id="${subject.id}" aria-label="Registrar falta em ${esc(subject.name)}" title="${quickAbsenceTitle(subject)}">${icon('plus')}</button>
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
  const label = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  // Argila shows it in sentence case; ::first-letter does not apply to a flex eyebrow.
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const joinList = (parts) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0]);

/** What needs attention, in a sentence or two, so the numbers need no decoding. */
function homeSummary({ late, week, risky }) {
  if (!appState.subjects.length) return 'Faltas, conteúdos e prazos do semestre em um só lugar.';

  const classes = todaysSubjects().map((subject) => esc(subject.name));
  const lead = classes.length ? `Hoje tem aula de ${joinList(classes)}. ` : '';

  const parts = [];
  if (late) parts.push(plural(late, 'tarefa atrasada', 'tarefas atrasadas'));
  if (week) parts.push(`${plural(week, 'entrega', 'entregas')} nos próximos 7 dias`);
  if (risky) parts.push(`${plural(risky, 'matéria', 'matérias')} perto do limite de faltas`);
  return lead + (parts.length ? `Você tem ${joinList(parts)}.` : 'Tudo em dia por aqui.');
}

function welcomeCard() {
  return `
    <section class="card welcome">
      <h3>Comece por aqui</h3>
      <ol class="steps">
        <li><b>Cadastre suas matérias</b><span>com o total de aulas e o limite de faltas de cada uma.</span></li>
        <li><b>Registre faltas com um clique</b><span>o app avisa quando você estiver perto do limite.</span></li>
        <li><b>Anote conteúdos e prazos</b><span>com anexos, e encontre tudo depois com ${MOD_KEY} K.</span></li>
      </ol>
      <button class="btn" data-a="new-subj">${icon('plus')}Criar primeira matéria</button>
    </section>
  `;
}

function renderHome() {
  const pendingTasks = appState.tasks.filter((task) => !task.done);
  const dated = sortTasks(pendingTasks.filter((task) => task.due && dayDiff(task.due) <= 7));
  const late = dated.filter((task) => dayDiff(task.due) < 0).length;
  const risky = appState.subjects.filter((subject) => subjectState(subject)[0] !== 'ok').length;
  const studied = appState.contents.filter((content) => content.done).length;
  const totalAbsences = appState.absences.reduce((total, absence) => total + Number(absence.count || 0), 0);
  const bySeverity = [...appState.subjects].sort((a, b) => pct(b) - pct(a) || a.name.localeCompare(b.name));
  const hasSubjects = appState.subjects.length > 0;

  return `
    <header class="top">
      <div>
        <span class="eyebrow">${icon('sparkle')}${todayLabel()}</span>
        <h1>${greeting()}</h1>
        <p class="sub">${homeSummary({ late, week: dated.length - late, risky })}</p>
      </div>
      ${hasSubjects
        ? `<div class="top-actions">
            <button class="btn sec" data-a="new-abs">${icon('plus')}Registrar falta</button>
            <button class="btn" data-a="new-task">${icon('plus')}Nova tarefa</button>
          </div>`
        : ''}
    </header>

    <div class="stats">
      ${statCard({ value: appState.subjects.length, label: 'Matérias', iconName: 'book', tone: 'accent', view: 'subjects', index: 0 })}
      ${statCard({ value: totalAbsences, label: 'Faltas no total', iconName: 'absence', tone: 'bad', view: 'absences', index: 1 })}
      ${statCard({ value: studied, label: 'Conteúdos vistos', iconName: 'notes', tone: 'ok', view: 'contents', index: 2 })}
      ${statCard({ value: pendingTasks.length, label: 'Tarefas pendentes', iconName: 'tasks', tone: 'warn', view: 'tasks', index: 3 })}
    </div>

    ${hasSubjects
      ? `<div class="home-grid">
          <section>
            <div class="panel-head">
              <h2>Agenda</h2>
              <a class="link" href="#${ROUTES.tasks}">Ver tarefas${icon('arrow')}</a>
            </div>
            ${dated.length
              ? `<div class="list">${dated.slice(0, 6).map((task, index) => taskItem(task, index)).join('')}</div>`
              : createEmptyState('inbox', 'Nada para os próximos 7 dias', 'Que paz! Cadastre uma tarefa quando um prazo aparecer.')}
          </section>
          <section>
            <div class="panel-head">
              <h2>Frequência</h2>
              <a class="link" href="#${ROUTES.subjects}">Matérias${icon('arrow')}</a>
            </div>
            <div class="freq">${bySeverity.map((subject, index) => freqRow(subject, index)).join('')}</div>
          </section>
        </div>`
      : welcomeCard()}
  `;
}

function renderSubjects() {
  return `
    <header class="top">
      <div>
        <h1>Matérias</h1>
        <p class="sub">Clique em uma matéria para ver tarefas, conteúdos e faltas, ou no lápis para editar.</p>
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
    `Vá até a aba <a class="link" href="#${ROUTES.subjects}">Matérias</a> e crie uma para liberar esta seção.`
  );
}

function renderAbsences(currentFilter) {
  if (!appState.subjects.length) return needsSubjectState();

  const list = appState.absences
    .filter((absence) => currentFilter === 'all' || absence.sid === currentFilter)
    .sort((a, b) => b.date.localeCompare(a.date));
  const subject = getSubject(currentFilter);

  return `
    <header class="top">
      <div>
        <h1>Faltas</h1>
        <p class="sub">${subject ? `${esc(subject.name)}: ${used(subject)} de ${limit(subject)} permitidas. ${absenceNote(subject)}.` : 'Histórico e controle de limite.'}</p>
      </div>
      <button class="btn" data-a="new-abs">${icon('plus')}Registrar falta</button>
    </header>
    ${filtersMarkup(currentFilter)}
    ${list.length
      ? `<div class="list">${list.map((absence, index) => absenceItem(absence, index)).join('')}</div>`
      : createEmptyState('check', 'Nenhuma falta registrada', 'Continue assim — sua frequência está em dia.')}
  `;
}

/** The "Mostrar concluídas" switch under a list, with the done items when open. */
function doneToggle(items, showDone, noun, renderItem) {
  if (!items.length) return '';
  return `
    <button class="more-toggle" data-a="toggle-done" aria-expanded="${showDone}">${icon('chevron')}${showDone ? 'Ocultar' : 'Mostrar'} ${noun} (${items.length})</button>
    ${showDone ? `<div class="list">${items.map(renderItem).join('')}</div>` : ''}
  `;
}

/** Contents still to study first; the order within each part is kept. */
const sortContents = (contents) => [...contents].sort((a, b) => Number(a.done) - Number(b.done));

function renderContents(currentFilter, showDone) {
  if (!appState.subjects.length) return needsSubjectState();

  const inFilter = appState.contents.filter((content) => currentFilter === 'all' || content.sid === currentFilter);
  const list = inFilter.filter((content) => !content.done);
  const studied = inFilter.filter((content) => content.done);

  return `
    <header class="top">
      <div>
        <h1>Conteúdo</h1>
        <p class="sub">Tópicos, resumos e o que já foi estudado. Links nas anotações ficam clicáveis.</p>
      </div>
      <button class="btn" data-a="new-cont">${icon('plus')}Novo conteúdo</button>
    </header>
    ${filtersMarkup(currentFilter)}
    ${list.length
      ? `<div class="list">${list.map((content, index) => contentItem(content, index)).join('')}</div>`
      : studied.length
        ? createEmptyState('check', 'Tudo estudado', 'Nenhum conteúdo pendente por aqui.')
        : createEmptyState('notes', 'Nada por aqui ainda', 'Anote o que aprendeu para revisar antes das provas.')}
    ${doneToggle(studied, showDone, 'estudados', (content, index) => contentItem(content, index))}
  `;
}

function renderTasks(currentFilter, showDone) {
  const inFilter = appState.tasks.filter((task) => currentFilter === 'all' || task.sid === currentFilter);
  const pending = sortTasks(inFilter.filter((task) => !task.done));
  const done = inFilter.filter((task) => task.done).sort((a, b) => (b.due || '').localeCompare(a.due || ''));

  const groups = new Map(TASK_GROUPS.map(([key]) => [key, []]));
  pending.forEach((task) => groups.get(taskBucket(task)).push(task));

  // One running index across groups keeps the entry stagger continuous.
  let index = 0;
  const sections = TASK_GROUPS.filter(([key]) => groups.get(key).length)
    .map(
      ([key, title]) => `
        <section class="group group-${key}">
          <h2>${title}<span class="count">${groups.get(key).length}</span></h2>
          <div class="list">${groups.get(key).map((task) => taskItem(task, index++)).join('')}</div>
        </section>
      `
    )
    .join('');

  const canExport = appState.tasks.some((task) => task.due && !task.done);

  return `
    <header class="top">
      <div>
        <h1>Tarefas e provas</h1>
        <p class="sub">Agrupadas por prazo. Clique em uma para editar.</p>
      </div>
      <div class="top-actions">
        ${canExport ? `<button class="btn sec" data-a="export-ics" title="Baixar as tarefas com data para o Google Agenda, Outlook ou celular">${icon('calendar')}Exportar agenda</button>` : ''}
        <button class="btn" data-a="new-task">${icon('plus')}Nova tarefa</button>
      </div>
    </header>
    ${appState.subjects.length ? filtersMarkup(currentFilter) : ''}
    ${pending.length
      ? `<div class="groups">${sections}</div>`
      : done.length
        ? createEmptyState('check', 'Tudo entregue', 'Nenhuma tarefa pendente por aqui.')
        : createEmptyState('tasks', 'Sem tarefas', 'Aproveite a folga — ou adiante algo do próximo mês.')}
    ${doneToggle(done, showDone, 'concluídas', (task, doneIndex) => taskItem(task, doneIndex))}
  `;
}

function detailSection(iconName, title, count, action, body) {
  return `
    <section class="detail-sec">
      <div class="detail-sec-head">
        <h4>${icon(iconName)}${title}<span class="count">${count}</span></h4>
        ${action}
      </div>
      ${body}
    </section>
  `;
}

const GRADE_FIELDS = [
  ['p1', 'P1', 'Nota da P1'],
  ['p2', 'P2', 'Nota da P2'],
  ['final', 'Final', 'Nota da prova final'],
];

/** P1, P2 and final typed right in the panel; each saves when the field is left. */
function gradesSection(subject, status) {
  const fields = GRADE_FIELDS.map(
    ([key, label, name]) => `
      <label class="grade-field">
        <span>${label}</span>
        <input type="number" min="0" max="10" step="0.01" inputmode="decimal" placeholder="—" autocomplete="off"
          data-grade="${key}" data-id="${subject.id}" value="${subject.grades[key] ?? ''}" aria-label="${name}">
      </label>
    `
  ).join('');

  return `
    <section class="detail-sec">
      <div class="detail-sec-head">
        <h4>${icon('grade')}Notas</h4>
      </div>
      <div class="grades">
        ${fields}
        <div class="grade-avg">
          <span>Média</span>
          <b>${status.average === null ? '—' : fmtScore(status.average)}</b>
        </div>
      </div>
      <p class="grade-note" aria-live="polite"><span class="${status.tone ? `status-${status.tone}` : ''}">${status.detail}</span></p>
    </section>
  `;
}

/** Inner markup of the subject panel opened from a subject card. */
function renderSubjectDetail(subject) {
  const [stateKey] = subjectState(subject);
  const grade = gradeStatus(subject);
  const tasks = sortTasks(appState.tasks.filter((task) => task.sid === subject.id));
  const contents = sortContents(appState.contents.filter((content) => content.sid === subject.id));
  const absences = appState.absences
    .filter((absence) => absence.sid === subject.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return `
    <header class="detail-head">
      ${ringHTML(subject)}
      <div class="grow">
        <h3>${esc(subject.name)}</h3>
        <small>${esc(subject.prof || 'Sem professor')}</small>
        <div class="pills">
          <span class="pill status-${stateKey}">${icon(STATUS_ICON[stateKey])}${absenceNote(subject)}</span>
          ${grade.tone ? `<span class="pill status-${grade.tone}">${icon('grade')}${grade.label}</span>` : ''}
        </div>
      </div>
      <div class="detail-tools">
        <button class="icon-btn" data-a="edit-subj" data-id="${subject.id}" aria-label="Editar matéria" title="Editar matéria">${icon('edit')}</button>
        <button class="icon-btn" data-c aria-label="Fechar" title="Fechar">${icon('close')}</button>
      </div>
    </header>

    ${gradesSection(subject, grade)}

    ${detailSection(
      'tasks',
      'Tarefas',
      tasks.length,
      `<button class="chip" data-a="new-task" data-id="${subject.id}">${icon('plus')}Nova tarefa</button>`,
      tasks.length
        ? `<div class="list">${tasks.map((task, index) => taskItem(task, index, false)).join('')}</div>`
        : createEmptyState('tasks', 'Nenhuma tarefa', 'Provas e trabalhos desta matéria aparecem aqui.')
    )}

    ${detailSection(
      'notes',
      'Conteúdos',
      contents.length,
      `<button class="chip" data-a="new-cont" data-id="${subject.id}">${icon('plus')}Novo conteúdo</button>`,
      contents.length
        ? `<div class="list">${contents.map((content, index) => contentItem(content, index, false)).join('')}</div>`
        : createEmptyState('notes', 'Nenhum conteúdo', 'Anote os tópicos desta matéria para revisar depois.')
    )}

    ${detailSection(
      'absence',
      'Faltas',
      used(subject),
      `<button class="chip" data-a="quick-abs" data-id="${subject.id}" title="${quickAbsenceTitle(subject)}">${icon('plus')}Falta hoje</button>`,
      absences.length
        ? `<div class="list">${absences.map((absence, index) => absenceItem(absence, index, false)).join('')}</div>`
        : createEmptyState('check', 'Nenhuma falta', `Limite desta matéria: ${plural(limit(subject), 'falta', 'faltas')}.`)
    )}
  `;
}

/**
 * `enter` picks the entry motion: true for a newly opened view, 'list' when
 * only the list changed (a filter), false for a refresh after an action.
 */
function renderApp({ view, filter, showDone, enter }) {
  renderNav(view);
  renderBackupAge();
  renderSemesterLabel();

  const contentMap = {
    home: renderHome,
    subjects: renderSubjects,
    absences: () => renderAbsences(filter),
    contents: () => renderContents(filter, showDone),
    tasks: () => renderTasks(filter, showDone),
  };

  const main = document.getElementById('main');
  if (!main) return;

  const motion = enter === 'list' ? 'enter-list' : enter ? 'enter' : '';
  main.innerHTML = `<div class="view ${motion}">${contentMap[view]?.() || ''}</div>`;
  if (enter === true) numberAnimation(main);
}
