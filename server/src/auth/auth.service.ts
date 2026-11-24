import { BadRequestException, Injectable, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Request, Response } from 'express';

type User = { id: number; username: string; salt: string; password_hash: string };

@Injectable()
export class AuthService implements OnModuleDestroy {
  readonly db: DatabaseSync;

  constructor() {
    const path = process.env.WATERSHED_DB_PATH === ':memory:' ? ':memory:' : resolve(process.env.WATERSHED_DB_PATH || 'data/watershed.sqlite');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
        salt TEXT NOT NULL, password_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, geometry TEXT NOT NULL, results TEXT NOT NULL,
        area_km2 REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`);
  }

  onModuleDestroy() { this.db.close(); }

  private credentials(body: unknown) {
    if (!body || typeof body !== 'object' || !('username' in body) || !('password' in body)
      || typeof body.username !== 'string' || typeof body.password !== 'string'
      || !/^[a-zA-Z0-9_.-]{3,64}$/.test(body.username)
      || body.password.length < 8 || body.password.length > 256) {
      throw new BadRequestException('Username must be 3–64 letters, numbers, dots, underscores or hyphens; password must be 8–256 characters.');
    }
    return { username: body.username, password: body.password };
  }

  register(body: unknown, res: Response) {
    const { username, password } = this.credentials(body);
    if (this.db.prepare('SELECT id FROM users WHERE username = ?').get(username))
      throw new BadRequestException('Username is already in use.');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    const result = this.db.prepare('INSERT INTO users (username, salt, password_hash) VALUES (?, ?, ?)').run(username, salt, hash);
    this.startSession(Number(result.lastInsertRowid), res);
    return { username };
  }

  login(body: unknown, res: Response) {
    const { username, password } = this.credentials(body);
    const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
    if (!user || !timingSafeEqual(scryptSync(password, user.salt, 64), Buffer.from(user.password_hash, 'hex')))
      throw new UnauthorizedException('Invalid username or password.');
    this.startSession(user.id, res);
    return { username };
  }

  private startSession(userId: number, res: Response) {
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(this.hashToken(token), userId, expires);
    res.cookie('watershed_session', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', expires: new Date(expires) });
  }

  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }

  private token(req: Request) {
    return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('watershed_session='))?.slice('watershed_session='.length);
  }

  current(req: Request): { id: number; username: string } | null {
    const token = this.token(req);
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    return (this.db.prepare('SELECT users.id, users.username FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > ?')
      .get(this.hashToken(token), Date.now()) as { id: number; username: string } | undefined) ?? null;
  }

  requireUser(req: Request) {
    const user = this.current(req);
    if (!user) throw new UnauthorizedException('Please sign in.');
    return user;
  }

  logout(req: Request, res: Response) {
    const token = this.token(req);
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(this.hashToken(token));
    res.clearCookie('watershed_session', { path: '/' });
    return { success: true };
  }
}
