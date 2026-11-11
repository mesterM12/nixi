import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export const cookieName = "nixi_test_session";
export const cookieValue = "fixture-only-cookie-token";
export function browserCookieFixtures(home: string) {
  const zen = join(
    home,
    "Library/Application Support/zen/Profiles/nixi.default",
  );
  mkdirSync(zen, { recursive: true });
  const db = new DatabaseSync(join(zen, "cookies.sqlite"));
  db.exec(
    "PRAGMA user_version=17; CREATE TABLE moz_cookies (host TEXT, name TEXT, value TEXT, path TEXT, expiry INTEGER, isSecure INTEGER, originAttributes TEXT)",
  );
  // Firefox schema 16+ stores expiry in milliseconds.
  db.prepare("INSERT INTO moz_cookies VALUES (?,?,?,?,?,?,?)").run(
    "127.0.0.1",
    cookieName,
    cookieValue,
    "/",
    Date.now() + 86400000,
    0,
    "",
  );
  db.close();
  const safari = join(
    home,
    "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies",
  );
  mkdirSync(join(safari, ".."), { recursive: true });
  const strings = ["127.0.0.1", cookieName, "/", cookieValue].map((value) =>
    Buffer.from(value + "\0"),
  );
  const record = Buffer.alloc(
    56 + strings.reduce((total, value) => total + value.length, 0),
  );
  record.writeUInt32LE(record.length, 0);
  let offset = 56;
  for (let i = 0; i < strings.length; i++) {
    record.writeUInt32LE(offset, 16 + i * 4);
    strings[i].copy(record, offset);
    offset += strings[i].length;
  }
  const macNow = Date.now() / 1000 - 978307200;
  record.writeDoubleLE(macNow + 86400, 40);
  record.writeDoubleLE(macNow, 48);
  const page = Buffer.alloc(16 + record.length);
  page.set([0, 0, 1, 0]);
  page.writeUInt32LE(1, 4);
  page.writeUInt32LE(16, 8);
  record.copy(page, 16);
  const header = Buffer.alloc(12);
  header.write("cook");
  header.writeUInt32BE(1, 4);
  header.writeUInt32BE(page.length, 8);
  writeFileSync(safari, Buffer.concat([header, page]), { mode: 0o600 });
  return { zen, safari };
}
export function hasFixtureCookie(request: Request) {
  return (request.headers.get("cookie") || "")
    .split(";")
    .some((value) => value.trim() === `${cookieName}=${cookieValue}`);
}
