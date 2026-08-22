import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { PrismaService } from './database/prisma.service';
import { Public } from './auth/public.decorator';

type DatabaseStatus = 'up' | 'unavailable';

@Controller()
@Public()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiExcludeEndpoint()
  async getServiceIndex(): Promise<string> {
    const databaseStatus = await this.getDatabaseStatus();

    return renderServiceIndex(databaseStatus);
  }

  private async getDatabaseStatus(): Promise<DatabaseStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'unavailable';
    }
  }
}

function renderServiceIndex(databaseStatus: DatabaseStatus): string {
  const databaseOnline = databaseStatus === 'up';
  const renderedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="15" />
    <link rel="icon" href="data:," />
    <title>Hop &amp; Barley API</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #f5f2e9; background: radial-gradient(circle at top, #31412d, #121712 58%); }
      main { width: min(760px, 100%); border: 1px solid #52614a; border-radius: 24px; padding: clamp(24px, 5vw, 48px); background: rgba(20, 26, 19, .92); box-shadow: 0 28px 80px rgba(0, 0, 0, .38); }
      header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
      .eyebrow { margin: 0 0 10px; color: #d4ad61; font: 700 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(32px, 7vw, 58px); line-height: .98; letter-spacing: -.055em; }
      .status { display: inline-flex; align-items: center; gap: 9px; white-space: nowrap; color: #bfe7ad; }
      .status::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: #8bd46e; box-shadow: 0 0 18px #8bd46e; }
      .lede { max-width: 560px; margin: 22px 0 30px; color: #b8c0b4; font-size: 17px; line-height: 1.6; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .card { padding: 16px; border: 1px solid #3a4636; border-radius: 14px; background: #181f17; }
      .card span { display: block; margin-bottom: 8px; color: #8f9b8b; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
      .card strong { color: #eff4e9; }
      .card .warn { color: #ffbd75; }
      .terminal { margin: 24px 0; overflow: hidden; border: 1px solid #344031; border-radius: 14px; background: #0b0f0a; }
      .terminal-title { padding: 10px 14px; border-bottom: 1px solid #273025; color: #879083; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
      pre { margin: 0; padding: 18px; overflow-x: auto; color: #a9d895; font: 13px/1.8 ui-monospace, SFMono-Regular, Menlo, monospace; }
      nav { display: flex; flex-wrap: wrap; gap: 10px; }
      a { padding: 11px 14px; border-radius: 10px; color: #10150f; background: #d4ad61; font-weight: 750; text-decoration: none; }
      a.secondary { color: #dce7d7; background: #273125; }
      footer { margin-top: 20px; color: #748070; font-size: 12px; }
      @media (max-width: 620px) { header { display: block; } .status { margin-top: 18px; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <p class="eyebrow">Developer service console</p>
          <h1>Hop &amp; Barley API</h1>
        </div>
        <div class="status">Backend online</div>
      </header>
      <p class="lede">The local API is responding. Use Swagger to explore the contract, or open the versioned health and catalog endpoints directly.</p>
      <section class="grid" aria-label="Service status">
        <div class="card"><span>Backend</span><strong>online</strong></div>
        <div class="card"><span>PostgreSQL</span><strong class="${databaseOnline ? '' : 'warn'}">${databaseStatus}</strong></div>
        <div class="card"><span>API prefix</span><strong>/api/v1</strong></div>
      </section>
      <section class="terminal" aria-label="Safe backend status log">
        <div class="terminal-title">safe-status.log</div>
        <pre>[ok] NestJS process is responding
[${databaseOnline ? 'ok' : 'warn'}] PostgreSQL is ${databaseStatus}
[info] Swagger UI is available at /api/docs
[info] Raw local logs: pnpm local:logs</pre>
      </section>
      <nav aria-label="Backend links">
        <a href="/api/docs">Open Swagger UI</a>
        <a class="secondary" href="/api/v1/health/ready">Readiness</a>
        <a class="secondary" href="/api/v1/products">Products</a>
      </nav>
      <footer>Rendered ${renderedAt} · refreshes every 15 seconds · raw logs are intentionally not exposed</footer>
    </main>
  </body>
</html>`;
}
