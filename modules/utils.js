const $ = (selector, root = document) => root.querySelector(selector);

const uid = () => Math.random().toString(36).slice(2, 9);

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

/** "Hoje", "Amanhã", "Sexta" within the week, else the short date. */
function relDay(dateValue) {
  const diff = dayDiff(dateValue);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff > 1 && diff < 7) return WEEKDAYS[new Date(`${dateValue}T12:00`).getDay()];
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

const used = (subject) => tally(subject.id).absences;

const limit = (subject) => Math.max(1, Math.floor(subject.total * subject.max / 100));

const pct = (subject) => Math.min(1, used(subject) / limit(subject));

const subjectState = (subject) => {
  const value = pct(subject);

  if (value >= 1) return ['bad', 'Limite atingido'];
  if (value >= 0.75) return ['warn', 'Atenção'];
  return ['ok', 'Tranquilo'];
};

/** Theme tokens, not hex values, so the ring follows the active theme. */
const ringColor = (subject) => {
  const value = pct(subject);
  if (value >= 1) return 'var(--bad)';
  if (value >= 0.75) return 'var(--warn)';
  return subject.color;
};

/** What a student actually wants to know: how many more they can miss. */
function absenceNote(subject) {
  const left = limit(subject) - used(subject);
  if (left > 1) return `Pode faltar mais ${left}`;
  if (left === 1) return 'Só mais 1 falta';
  if (left === 0) return 'Limite atingido';
  return `${plural(-left, 'falta', 'faltas')} acima do limite`;
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
 * stays longer; `onClose` runs once, however the toast goes away. Returns a
 * function that dismisses it early.
 */
function toast(message, { action = '', onAction = null, onClose = null } = {}) {
  const container = $('#toasts');
  if (!container) return null;

  const life = action ? 6000 : 3100;
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
