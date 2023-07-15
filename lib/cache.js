import fs from 'node:fs';

const HOUR = 3600 * 1000;

// Remembers which URLs were fine and when. Only level "ok" results are stored.
export class ResultCache {
  constructor(file, { ttlHours = 24, now = Date.now } = {}) {
    this.file = file;
    this.ttl = ttlHours * HOUR;
    this.now = now;
    this.entries = new Map();
    this.dirty = false;
    this.load();
  }

  load() {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return; // no cache yet, or an unreadable one: start empty
    }
    if (data === null || typeof data !== 'object' || data.version !== 1 || typeof data.entries !== 'object' || data.entries === null) return;
    for (const [url, entry] of Object.entries(data.entries)) {
      if (entry && typeof entry.checkedAt === 'number' && typeof entry.status === 'number') this.entries.set(url, entry);
    }
  }

  // The cached result for url, or undefined when there is none or it is too old.
  get(url) {
    const entry = this.entries.get(url);
    if (entry === undefined || this.now() - entry.checkedAt > this.ttl) return undefined;
    return { url, level: 'ok', status: entry.status, cached: true };
  }

  set(url, result) {
    if (result.level !== 'ok') {
      if (this.entries.delete(url)) this.dirty = true;
      return;
    }
    this.entries.set(url, { status: result.status, checkedAt: this.now() });
    this.dirty = true;
  }

  // Write the cache back (without entries that have expired).
  save() {
    if (!this.dirty) return;
    const entries = {};
    for (const [url, entry] of this.entries) {
      if (this.now() - entry.checkedAt <= this.ttl) entries[url] = entry;
    }
    fs.writeFileSync(this.file, JSON.stringify({ version: 1, entries }, null, 2) + '\n');
    this.dirty = false;
  }
}
