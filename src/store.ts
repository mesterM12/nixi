import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import { database, defaultDownloadDir } from "./config";
import type { Job, Settings } from "./types";
export class Store {
  db: DatabaseSync;
  private upsert;
  private deleteJob;
  private readSettings;
  private writeSettings;
  constructor(path = database) {
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);",
    );
    this.upsert = this.db.prepare(
      "INSERT INTO jobs(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    );
    this.deleteJob = this.db.prepare("DELETE FROM jobs WHERE id=?");
    this.readSettings = this.db.prepare("SELECT data FROM settings WHERE id=1");
    this.writeSettings = this.db.prepare(
      "INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    );
  }
  jobs(): Job[] {
    return (
      this.db.prepare("SELECT data FROM jobs").all() as { data: string }[]
    )
      .map((row) => JSON.parse(row.data))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  save(job: Job) {
    this.upsert.run(job.id, JSON.stringify(job));
  }
  remove(id: string) {
    this.deleteJob.run(id);
  }
  settings(): Settings {
    const row = this.readSettings.get() as { data: string } | undefined;
    return row
      ? JSON.parse(row.data)
      : {
          downloadDir: defaultDownloadDir,
          concurrency: 2,
          format: "video",
          quality: "best",
          playlist: false,
          cookiesBrowser: "none",
          subtitles: false,
        };
  }
  saveSettings(value: Settings) {
    this.writeSettings.run(JSON.stringify(value));
  }
  close() {
    this.db.close();
  }
}
