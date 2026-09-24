// Theme choice, applied to <html data-theme>. The inline script in index.html
// sets the saved one before the first paint; this file keeps it in sync.
const THEMES = [
  { id: 'aurora', name: 'Aurora', hint: 'Escuro, com vidro e brilho', bar: '#070a12' },
  { id: 'argila', name: 'Argila', hint: 'Claro, papel e terracota', bar: '#faf9f5' },
  { id: 'argila-escuro', name: 'Argila noturno', hint: 'Os mesmos tons, para a noite', bar: '#262624' },
  { id: 'auto', name: 'Automático', hint: 'Argila claro ou noturno, como o sistema' },
];

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

let themeDialog = null;

function themeChoice() {
  return THEMES.some((theme) => theme.id === prefs.theme) ? prefs.theme : 'aurora';
}

function resolveTheme(choice = themeChoice()) {
  if (choice === 'auto') return darkScheme.matches ? 'argila-escuro' : 'argila';
  return choice;
}

function applyTheme() {
  const root = document.documentElement;
  const id = resolveTheme();

  if (root.dataset.theme !== id) {
    root.classList.add('theme-swap');
    root.dataset.theme = id;
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-swap')));
  }

  $('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((theme) => theme.id === id).bar);
}

function setTheme(choice) {
  setPref('theme', choice);
  // A cross-fade where the browser supports it; elsewhere the swap is instant.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduced) document.startViewTransition(applyTheme);
  else applyTheme();
  paintThemePicker();
}

/** Steps through the three looks; bound to the T key. */
function cycleTheme() {
  const order = ['aurora', 'argila', 'argila-escuro'];
  const next = order[(order.indexOf(resolveTheme()) + 1) % order.length];
  setTheme(next);
  toast(`Tema: ${THEMES.find((theme) => theme.id === next).name}`);
}

darkScheme.addEventListener('change', () => {
  if (themeChoice() === 'auto') applyTheme();
});

function miniPreview(themeId) {
  return `
    <span class="mini" data-theme="${themeId}">
      <i class="mini-side"></i>
      <i class="mini-main"><i class="mini-title"></i><i class="mini-card"></i><i class="mini-card"></i><i class="mini-btn-fill"></i></i>
    </span>
  `;
}

function themePicker() {
  if (themeDialog) return;

  const { overlay } = openOverlay(
    `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="theme-title">
        <div class="modal-head">
          <h3 id="theme-title">Aparência</h3>
          <button type="button" class="icon-btn" data-c aria-label="Fechar">${icon('close')}</button>
        </div>
        <p class="sub">A escolha fica salva neste navegador.</p>
        <div class="themes" role="radiogroup" aria-label="Tema">
          ${THEMES.map(
            (theme) => `
              <button type="button" class="theme-opt" role="radio" data-theme-pick="${theme.id}">
                <span class="theme-preview">${theme.id === 'auto' ? miniPreview('argila') + miniPreview('argila-escuro') : miniPreview(theme.id)}</span>
                <span class="theme-name"><b>${theme.name}</b><small>${theme.hint}</small></span>
              </button>
            `
          ).join('')}
        </div>
        <p class="dialog-hint">Dica: a tecla <kbd>T</kbd> alterna os temas de qualquer tela.</p>
      </div>
    `,
    () => {
      themeDialog = null;
    }
  );

  themeDialog = overlay;
  const group = overlay.querySelector('.themes');

  group.addEventListener('click', (event) => {
    const option = event.target.closest('[data-theme-pick]');
    if (option) setTheme(option.dataset.themePick);
  });

  // Radio-group keys: arrows move the choice, like native radios.
  group.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const options = [...group.querySelectorAll('[data-theme-pick]')];
    const next = options[(options.indexOf(document.activeElement) + step + options.length) % options.length];
    next.focus();
    setTheme(next.dataset.themePick);
  });

  paintThemePicker();
  overlay.querySelector('[aria-checked="true"]')?.focus();
}

function paintThemePicker() {
  if (!themeDialog) return;
  const choice = themeChoice();
  themeDialog.querySelectorAll('[data-theme-pick]').forEach((option) => {
    const on = option.dataset.themePick === choice;
    option.setAttribute('aria-checked', String(on));
    option.tabIndex = on ? 0 : -1;
  });
}
