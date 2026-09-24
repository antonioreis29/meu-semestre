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

function allFileMetas() {
  return appState.contents.flatMap((content) => content.files || []);
}

function getFileMeta(fileId) {
  return allFileMetas().find((file) => file.id === fileId);
}

// Files of deleted contents that an "Desfazer" toast can still bring back.
// Pruning skips them until the toast is gone.
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
    // Read after the await, so a save that finished meanwhile counts as referenced.
    const referenced = new Set([...allFileMetas().map((file) => file.id), ...heldFiles]);
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

/** Every referenced file as a data URL, keyed by id, for the JSON backup. */
async function exportFiles() {
  const files = {};
  for (const meta of allFileMetas()) {
    const blob = await getFile(meta.id);
    if (blob) files[meta.id] = await blobToDataUrl(blob);
  }
  return files;
}

function importFiles(files) {
  return putFiles(Object.entries(files).map(([id, dataUrl]) => [id, dataUrlToBlob(dataUrl)]));
}
