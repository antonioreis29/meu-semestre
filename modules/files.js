// Attachments live in IndexedDB: localStorage only holds a few MB of text, while
// IndexedDB stores Blobs as they are, with a far larger quota. A content keeps
// just { id, name, type, size } per file; the bytes are looked up here by id.
const FILES_DB = 'meu-semestre-files';
const FILES_STORE = 'files';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Types the browser can show in a tab. HTML and SVG are left out on purpose:
// opened from a blob URL they would run with this page's origin and storage.
const VIEWABLE = /^(image\/(png|jpe?g|gif|webp|bmp|avif)|application\/pdf|text\/plain|audio\/|video\/)/;

let filesDb = null;

function openFilesDb() {
  if (!filesDb) {
    filesDb = new Promise((resolve, reject) => {
      const request = indexedDB.open(FILES_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(FILES_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // A failed open is not cached, so the next attempt tries again.
    filesDb.catch(() => {
      filesDb = null;
    });
  }
  return filesDb;
}

/** Runs `work` in one transaction; resolves with the result of the request it returns, if any. */
async function filesTx(mode, work) {
  const db = await openFilesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, mode);
    const request = work(tx.objectStore(FILES_STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Stores `[id, blob]` pairs. */
function putFiles(entries) {
  return filesTx('readwrite', (store) => {
    entries.forEach(([id, blob]) => store.put(blob, id));
  });
}

function getFile(fileId) {
  return filesTx('readonly', (store) => store.get(fileId));
}

/** Metadata of every attachment, archived semesters included. */
function allFileMetas() {
  return [appState, ...appState.archive].flatMap((semester) => semester.contents.flatMap((content) => content.files));
}

/**
 * Ids of the files a content, an archived semester or a whole state refers to.
 * Defensive, since it also reads raw data straight from storage.
 */
function fileIdsIn(record) {
  const ids = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.files)) node.files.forEach((file) => typeof file?.id === 'string' && ids.push(file.id));
    if (Array.isArray(node.contents)) node.contents.forEach(visit);
    if (Array.isArray(node.archive)) node.archive.forEach(visit);
  };
  visit(record);
  return ids;
}

/** What is saved right now, which another tab may have changed ahead of this one. */
function storedFileIds() {
  try {
    return fileIdsIn(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return [];
  }
}

function getFileMeta(fileId) {
  return allFileMetas().find((file) => file.id === fileId);
}

// Files that no saved content points at yet but must not be pruned: those of
// deleted contents an "Desfazer" toast can still bring back, and those of a
// content being saved. Pruning skips them until they are released.
const heldFiles = new Set();

function holdFiles(fileIds) {
  fileIds.forEach((fileId) => heldFiles.add(fileId));
}

function releaseFiles(fileIds) {
  fileIds.forEach((fileId) => heldFiles.delete(fileId));
}

/**
 * Drops stored files that no content references any more. Called after anything
 * that removes contents or attachments, so no delete path has to track blobs.
 */
async function pruneFiles() {
  try {
    const keys = await filesTx('readonly', (store) => store.getAllKeys());
    // Read after the await, so a save that finished meanwhile counts as
    // referenced; storage too, for what another open tab just saved.
    const referenced = new Set([...fileIdsIn(appState), ...storedFileIds(), ...heldFiles]);
    const orphans = keys.filter((key) => !referenced.has(key));
    if (orphans.length) {
      await filesTx('readwrite', (store) => {
        orphans.forEach((key) => store.delete(key));
      });
    }
  } catch {
    // storage unavailable: nothing to clean up
  }
}

async function openFile(fileId) {
  const meta = getFileMeta(fileId);
  let blob = null;
  try {
    blob = await getFile(fileId);
  } catch {
    // reported below
  }

  if (!meta || !blob) {
    toast('Arquivo não encontrado');
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  if (VIEWABLE.test(meta.type)) anchor.target = '_blank';
  else anchor.download = meta.name;
  anchor.click();
  // The new tab loads the URL asynchronously; revoking at once would break it.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const type = head.match(/^data:([^;,]*)/)?.[1] || '';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

/**
 * Every stored attachment as `[id, dataUrl]`, for the JSON backup. Read one
 * by one, so a single unreadable file does not sink the rest; `missing`
 * counts those left out.
 */
async function exportFiles() {
  const entries = [];
  let missing = 0;
  const ids = new Set(allFileMetas().map((file) => file.id));
  for (const id of ids) {
    try {
      const blob = await getFile(id);
      if (blob) entries.push([id, await blobToDataUrl(blob)]);
      else missing += 1;
    } catch {
      missing += 1;
    }
  }
  return { entries, missing };
}

/**
 * Stores the attachments of a backup that the (already validated) state
 * refers to. Returns how many could not be decoded.
 */
async function importFiles(files, state) {
  const wanted = new Set(fileIdsIn(state));
  const blobs = [];
  let broken = 0;
  for (const [id, dataUrl] of Object.entries(files)) {
    if (!wanted.has(id)) continue;
    try {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw new TypeError('not a data URL');
      blobs.push([id, dataUrlToBlob(dataUrl)]);
    } catch {
      broken += 1;
    }
  }
  if (blobs.length) await putFiles(blobs);
  return broken;
}
