// Save text as a file from the Custom UI iframe. Sandboxed iframes may block downloads; callers get
// `false` and must offer another way (copy), never a false "downloaded" claim.
export function downloadText(filename, text, mime = 'application/json') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Read a chosen file as text (File.text where available, FileReader otherwise). */
export function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsText(file);
  });
}
