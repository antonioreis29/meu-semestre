// Tasks as an iCalendar (.ics) file, which Google Agenda, Outlook and phone
// calendars import. Each dated pending task becomes an all-day event whose UID
// is the task id, so importing again updates the events instead of doubling them.

const ICS_ENCODER = new TextEncoder();

/** Escapes a TEXT value (RFC 5545 §3.3.11). */
const icsText = (value) =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/[,;]/g, (char) => `\\${char}`);

/** Folds a content line at 75 octets, never inside a UTF-8 character (§3.1). */
function icsFold(line) {
  const chunks = [];
  let chunk = '';
  let size = 0;
  for (const char of line) {
    const bytes = ICS_ENCODER.encode(char).length;
    if (size + bytes > 75) {
      chunks.push(chunk);
      chunk = ' ';
      size = 1;
    }
    chunk += char;
    size += bytes;
  }
  chunks.push(chunk);
  return chunks.join('\r\n');
}

/** YYYY-MM-DD as an iCalendar DATE, `offset` days later. */
function icsDate(dateValue, offset = 0) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10).replace(/-/g, '');
}

/** The calendar file for `tasks`; `now` stamps when it was made. */
function buildIcs(tasks, now = new Date()) {
  const stamp = `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meu Semestre//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Meu Semestre',
  ];

  for (const task of tasks) {
    const subject = getSubject(task.sid);
    const kind = task.kind !== 'tarefa' ? `${(TASK_KINDS[task.kind] || TASK_KINDS.tarefa)[1]}: ` : '';
    const where = subject ? ` (${subject.name})` : '';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${task.id}@meu-semestre`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(task.due)}`,
      `DTEND;VALUE=DATE:${icsDate(task.due, 1)}`,
      `SUMMARY:${icsText(kind + task.title + where)}`,
      ...(subject ? [`CATEGORIES:${icsText(subject.name)}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

function exportCalendar() {
  const tasks = sortTasks(appState.tasks.filter((task) => task.due && !task.done));
  if (!tasks.length) {
    toast('Nenhuma tarefa pendente com data para exportar');
    return;
  }
  downloadBlob(new Blob([buildIcs(tasks)], { type: 'text/calendar' }), `meu-semestre-agenda-${today()}.ics`);
  toast(`${plural(tasks.length, 'tarefa exportada', 'tarefas exportadas')}: abra o arquivo na sua agenda`);
}
