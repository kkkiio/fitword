import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

export type FitwordE2eMode = 'local' | 'faux' | 'real-llm';

export class FitwordE2eApp {
  readonly page: Page;
  private readonly testInfo: TestInfo;
  private child?: ChildProcess;
  private stdout = '';
  private stderr = '';
  private startPromise?: Promise<void>;
  private mode?: FitwordE2eMode;
  baseUrl = '';
  scenarioRoot = '';
  dbPath = '';

  constructor(page: Page, testInfo: TestInfo) {
    this.page = page;
    this.testInfo = testInfo;
  }

  async start(options: { mode?: FitwordE2eMode } = {}): Promise<void> {
    const mode = options.mode ?? 'local';
    if (this.startPromise) {
      if (this.mode !== mode) {
        throw new Error(`Fitword e2e app already started in ${this.mode} mode; cannot switch to ${mode}.`);
      }
      await this.startPromise;
      return;
    }

    this.mode = mode;
    this.startPromise = (async () => {
      const scenarioName = this.testInfo.titlePath
        .join(' ')
        .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
        .replaceAll(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 80);
      this.scenarioRoot = path.resolve(process.cwd(), '.tmp', 'e2e', `${this.testInfo.workerIndex}-${Date.now()}-${scenarioName}`);
      this.dbPath = path.join(this.scenarioRoot, 'fitword.db');
      await rm(this.scenarioRoot, { recursive: true, force: true });
      await mkdir(this.scenarioRoot, { recursive: true });

      const portServer = net.createServer();
      await new Promise<void>((resolve, reject) => {
        portServer.once('error', reject);
        portServer.listen(0, '127.0.0.1', () => resolve());
      });
      const address = portServer.address();
      await new Promise<void>((resolve, reject) => {
        portServer.close((error) => (error ? reject(error) : resolve()));
      });
      if (!address || typeof address === 'string') {
        throw new Error('Could not allocate an open TCP port.');
      }

      const port = address.port;
      this.baseUrl = `http://127.0.0.1:${port}`;
      const childEnv = {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        FITWORD_DATA_DIR: this.scenarioRoot,
        FITWORD_DB: this.dbPath,
        ...(mode === 'local'
          ? { FITWORD_LLM_PROVIDER: 'openai-compatible', OPENAI_API_KEY: '', OPENAI_BASE_URL: '', OPENAI_MODEL: '' }
          : {}),
        ...(mode === 'faux' ? { FITWORD_LLM_PROVIDER: 'faux', OPENAI_API_KEY: '', OPENAI_BASE_URL: '', OPENAI_MODEL: '' } : {}),
        ...(mode === 'real-llm' ? { FITWORD_LLM_PROVIDER: 'openai-compatible' } : {}),
      };
      const child = spawn(process.execPath, [path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'src/server/index.ts'], {
        cwd: process.cwd(),
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      child.stdout?.on('data', (chunk) => {
        this.stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        this.stderr += String(chunk);
      });

      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`Fitword server exited before health check. stdout=${this.stdout} stderr=${this.stderr}`);
        }
        try {
          const response = await fetch(`${this.baseUrl}/api/health`);
          if (response.ok) {
            return;
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out waiting for Fitword server. stdout=${this.stdout} stderr=${this.stderr}`);
    })();

    await this.startPromise;
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return;
    }

    const child = this.child;
    if (this.scenarioRoot) {
      await mkdir(this.scenarioRoot, { recursive: true });
      await Promise.all([
        this.stdout ? writeFile(path.join(this.scenarioRoot, 'server.stdout.log'), this.stdout, 'utf8') : Promise.resolve(),
        this.stderr ? writeFile(path.join(this.scenarioRoot, 'server.stderr.log'), this.stderr, 'utf8') : Promise.resolve(),
      ]);
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 2_000);
      timer.unref?.();
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }
}
