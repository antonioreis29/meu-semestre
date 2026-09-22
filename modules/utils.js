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

const today = () => new Date().toISOString().slice(0, 10);

const fmt = (dateValue) => {
  if (!dateValue) return '';
  return new Date(`${dateValue}T12:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
};

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / 1024 / 1024).toFixed(1)).toLocaleString('pt-BR')} MB`;
};

const used = (subject) =>
  appState.absences
    .filter((absence) => absence.sid === subject.id)
    .reduce((total, absence) => total + Number(absence.count || 0), 0);

const limit = (subject) => Math.max(1, Math.floor(subject.total * subject.max / 100));

const pct = (subject) => Math.min(1, used(subject) / limit(subject));

const subjectState = (subject) => {
  const value = pct(subject);

  if (value >= 1) return ['bad', 'Limite atingido'];
  if (value >= 0.75) return ['warn', 'Atenção'];
  return ['ok', 'Tranquilo'];
};

const ringColor = (subject) => {
  const value = pct(subject);
  if (value >= 1) return '#f2766c';
  if (value >= 0.75) return '#efb45c';
  return subject.color;
};

function toast(message) {
  const container = $('#toasts');
  if (!container) return;

  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = message;
  container.appendChild(element);
  setTimeout(() => element.remove(), 3100);
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

function numberAnimation() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-n]').forEach((element) => {
    const target = Number(element.dataset.n || 0);

    if (reduced) {
      element.textContent = target;
      return;
    }

    const startTime = performance.now();

    function step(currentTime) {
      const progress = Math.min(1, (currentTime - startTime) / 800);
      element.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}

function animateRings() {
  const rings = document.querySelectorAll('.fg[data-off]');
  const fill = () => rings.forEach((element) => {
    element.style.strokeDashoffset = element.dataset.off;
  });

  // The arc starts empty so it can sweep in; without animation, fill it at once
  // rather than waiting on frames that may never be scheduled.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fill();
    return;
  }

  requestAnimationFrame(() => requestAnimationFrame(fill));
}
