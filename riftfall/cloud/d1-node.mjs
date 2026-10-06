// Imita la interfaz de Cloudflare D1 con el SQLite que trae Node (para los tests y el servidor local).

import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }
  async first(col) {
    const row = this.db.prepare(this.sql).get(...this.args) ?? null;
    return row && col ? row[col] : row;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  runSync() {
    return this.db.prepare(this.sql).run(...this.args);
  }
}

export function createD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  return {
    prepare: (sql) => new Statement(db, sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map((st) => st.runSync());
        db.exec('COMMIT');
        return out.map((r) => ({ success: true, meta: { changes: Number(r.changes) } }));
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql) {
      db.exec(sql);
    },
    close: () => db.close()
  };
}
