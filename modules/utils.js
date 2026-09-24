const $ = (selector, root = document) => root.querySelector(selector);

/** 16 hex digits from the platform CSPRNG. Ids from older versions (7 base-36 letters) stay valid. */
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

/** References a symbol from the inline sprite in index.html. */
const icon = (name, className = '') =>
  `<svg class="ico ${className}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// ---------- Dates ----------

/**
 * YYYY-MM-DD in local time. toISOString() alone is UTC, which in Brazil
 * turned "today" into tomorrow after 21h: absences got the wrong default
 * date and tasks due today showed as late.
 */
const isoDay = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const today = () => isoDay();

/** Whole days from today to `dateValue` (negative in the past); DST cannot skew it. */
const dayDiff = (dateValue) => {
  const toDays = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  return toDays(dateValue) - toDays(today());
};

const fmt = (dateValue) => {
  if (!dateValue) return '';
  return new Date(`${dateValue}T12:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
};

const fmtLong = (dateValue) =>
  new Date(`${dateValue}T12:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Weekday of a YYYY-MM-DD, 0 for Sunday; noon keeps DST shifts from moving the day. */
const weekday = (dateValue) => new Date(`${dateValue}T12:00`).getDay();

/** "Hoje", "Amanhã", "Sexta" within the week, else the short date. */
function relDay(dateValue) {
  const diff = dayDiff(dateValue);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff > 1 && diff < 7) return WEEKDAYS[weekday(dateValue)];
  return fmt(dateValue);
}

/** "hoje", "ontem", "há 3 dias" for a past timestamp. */
function ago(timestamp) {
  const days = -dayDiff(isoDay(new Date(timestamp)));
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / 1024 / 1024).toFixed(1)).toLocaleString('pt-BR')} MB`;
};

// ---------- Attendance ----------

/** Share of the absence limit from which a subject asks for attention. */
const WARN_RATIO = 0.75;

const used = (subject) => tally(subject.id).absences;

const limit = (subject) => Math.max(1, Math.floor(subject.total * subject.max / 100));

const pct = (subject) => Math.min(1, used(subject) / limit(subject));

const subjectState = (subject) => {
  const value = pct(subject);

  if (value >= 1) return ['bad', 'Limite atingido'];
  if (value >= WARN_RATIO) return ['warn', 'Atenção'];
  return ['ok', 'Tranquilo'];
};

/** Theme tokens, not hex values, so the ring follows the active theme. */
const ringColor = (subject) => ({ bad: 'var(--bad)', warn: 'var(--warn)' })[subjectState(subject)[0]] || subject.color;

/** What a student actually wants to know: how many more they can miss. */
function absenceNote(subject) {
  const left = limit(subject) - used(subject);
  if (left > 1) return `Pode faltar mais ${left}`;
  if (left === 1) return 'Só mais 1 falta';
  if (left === 0) return 'Limite atingido';
  return `${plural(-left, 'falta', 'faltas')} acima do limite`;
}

/** Classes the subject has on that day by its weekly schedule; 0 when none is set. */
const classesOn = (subject, dateValue = today()) => subject.schedule?.[weekday(dateValue)] || 0;

/** Subjects with class today, in schedule order. */
const todaysSubjects = () => appState.subjects.filter((subject) => classesOn(subject) > 0);

// ---------- Grades ----------

// The average of P1 and P2 passes outright at PASS_AVERAGE. Below it the
// student sits the final exam, and then (average + final) / 2 must reach
// FINAL_AVERAGE, which is the same as scoring 2 × FINAL_AVERAGE − average on it.
const PASS_AVERAGE = 7;
const FINAL_AVERAGE = 5;

/** Up to two decimals, the precision grades are typed in: 5,75 stays 5,75. */
const fmtScore = (value) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Exact comparison, no rounding (6,95 is below 7); the epsilon only absorbs float noise. */
const reaches = (value, mark) => value >= mark - 1e-9;

/**
 * Where a subject stands on grades. `key` is one of 'none', 'partial',
 * 'passed', 'final', 'passed-final' or 'failed'; `tone` colours it; `label`
 * is the short form for cards and `detail` the sentence for the panel.
 * `average` (of P1 and P2) is null until both are in.
 */
function gradeStatus(subject) {
  const { p1, p2, final } = subject.grades;

  if (p1 === null && p2 === null) {
    return {
      key: 'none',
      tone: '',
      label: '',
      detail: `Lance a P1 e a P2 quando saírem. Média ${PASS_AVERAGE} aprova direto; abaixo disso, a prova final decide, com média ${FINAL_AVERAGE}.`,
      average: null,
    };
  }

  if (p1 === null || p2 === null) {
    const [known, missing] = p1 === null ? [p2, 'P1'] : [p1, 'P2'];
    const need = 2 * PASS_AVERAGE - known;
    return {
      key: 'partial',
      tone: '',
      label: `${missing === 'P2' ? 'P1' : 'P2'} ${fmtScore(known)}`,
      detail:
        need <= 10
          ? `Precisa de ${fmtScore(need)} na ${missing} para passar direto.`
          : `Nem com 10 na ${missing} a média chega a ${PASS_AVERAGE}: a prova final vai decidir.`,
      average: null,
    };
  }

  const average = (p1 + p2) / 2;
  if (reaches(average, PASS_AVERAGE)) {
    return {
      key: 'passed',
      tone: 'ok',
      label: `Aprovado · ${fmtScore(average)}`,
      detail: `Aprovado direto, com média ${fmtScore(average)}.`,
      average,
    };
  }

  const need = 2 * FINAL_AVERAGE - average;
  if (final === null) {
    return {
      key: 'final',
      tone: 'warn',
      label: `Final: precisa de ${fmtScore(need)}`,
      detail: `Média ${fmtScore(average)}, abaixo de ${PASS_AVERAGE}: vai para a prova final e precisa de ${fmtScore(need)} nela para fechar média ${FINAL_AVERAGE}.`,
      average,
    };
  }

  const finalAverage = (average + final) / 2;
  const sum = `(${fmtScore(average)} + ${fmtScore(final)}) ÷ 2 = ${fmtScore(finalAverage)}`;
  return reaches(finalAverage, FINAL_AVERAGE)
    ? { key: 'passed-final', tone: 'ok', label: 'Aprovado na final', detail: `Aprovado na final: ${sum}.`, average }
    : { key: 'failed', tone: 'bad', label: 'Reprovado', detail: `Reprovado: ${sum}, abaixo de ${FINAL_AVERAGE}.`, average };
}

// ---------- Text ----------

/** Lowercase without accents, so "calculo" finds "Cálculo". */
const norm = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Turns http(s) URLs in already-escaped text into links. Running after esc()
 * keeps it safe: the match cannot contain a raw quote or tag, and only the
 * two web schemes are ever linked.
 */
const linkify = (escaped) =>
  escaped.replace(/\bhttps?:\/\/[^\s<]+/g, (match) => {
    const url = match.replace(/(?:[.,;:!?)\]]|&quot;|&#39;)+$/, '');
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${match.slice(url.length)}`;
  });

// ---------- Feedback ----------

/**
 * Shows a toast. With `action`, it carries a button (e.g. "Desfazer") and
 * stays longer; `life` overrides how long. `onClose` runs once, however the
 * toast goes away. Returns a function that dismisses it early.
 */
function toast(message, { action = '', onAction = null, onClose = null, life = action ? 6000 : 3100 } = {}) {
  const container = $('#toasts');
  if (!container) return null;

  const element = document.createElement('div');
  element.className = 'toast';
  element.style.setProperty('--life', `${life}ms`);

  const text = document.createElement('span');
  text.textContent = message;
  element.append(text);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    element.remove();
    onClose?.();
  };
  element.finish = finish;

  if (action) {
    const button = document.createElement('button');
    button.className = 'toast-action';
    button.textContent = action;
    button.addEventListener('click', () => {
      onAction?.();
      finish();
    });
    element.append(button);
  }

  container.append(element);
  // A burst of actions should not stack a wall of toasts.
  while (container.children.length > 4) container.firstElementChild.finish?.();
  setTimeout(finish, life);
  return finish;
}

/** Saves `blob` as a download named `name`. */
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function addRipple(event, button) {
  const ripple = document.createElement('span');
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.2;

  ripple.className = 'ripple';
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px;`;
  button.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

function removeItemWithAnimation(element, callback) {
  const item = element.closest('.item') || element;
  item.classList.add('removing');
  setTimeout(callback, 330);
}

function createEmptyState(iconName, title, text = '') {
  return `
    <div class="empty">
      <div class="empty-ico">${icon(iconName)}</div>
      <b>${title}</b>
      ${text ? `<p>${text}</p>` : ''}
    </div>
  `;
}

/** Counts the stat numbers up from zero; only called when a view enters. */
function numberAnimation(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  root.querySelectorAll('[data-n]').forEach((element) => {
    const target = Number(element.dataset.n || 0);
    if (!target) return;

    const startTime = performance.now();
    element.textContent = '0';

    function step(currentTime) {
      const progress = Math.min(1, (currentTime - startTime) / 800);
      element.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}
