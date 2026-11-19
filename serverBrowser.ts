import fs from 'fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type {
  BrowserAutomationSnapshot,
  BrowserSearchResultItem,
  BrowserStepReceipt,
} from './src/types/assistant.ts';

export interface BrowserExecuteRequest {
  action:
    | 'search'
    | 'navigate'
    | 'open_result'
    | 'scroll'
    | 'back'
    | 'forward'
    | 'new_tab'
    | 'close_tab'
    | 'switch_tab'
    | 'click_text'
    | 'read_page'
    | 'stop_automation';
  engine?: 'google' | 'youtube' | 'bing' | 'duckduckgo';
  query?: string;
  url?: string;
  resultIndex?: number;
  direction?: 'down' | 'up' | 'top' | 'bottom';
  targetText?: string;
  confirmedSensitive?: boolean;
}

function findChromiumExecutable(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  try {
    const fallback = chromium.executablePath();
    if (fallback && fs.existsSync(fallback)) return fallback;
  } catch {
    // ignore
  }
  return undefined;
}

export class ServerBrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Page[] = [];
  private activeTabIndex = 0;
  private abortController: AbortController | null = null;
  private snapshot: BrowserAutomationSnapshot = {
    active: false,
    engine: 'playwright',
    status: 'idle',
    currentUrl: 'about:blank',
    pageTitle: 'Standby',
    tabCount: 0,
    activeTabIndex: 0,
    tabs: [],
    results: [],
    steps: [],
    updatedAt: new Date().toISOString(),
  };

  private pushStep(step: string, ok: boolean, detail: string): void {
    const entry: BrowserStepReceipt = {
      step,
      ok,
      detail,
      timestamp: new Date().toISOString(),
    };
    this.snapshot.steps = [entry, ...this.snapshot.steps].slice(0, 12);
    this.snapshot.updatedAt = entry.timestamp;
  }

  public getSnapshot(): BrowserAutomationSnapshot {
    return { ...this.snapshot };
  }

  public async abort(): Promise<BrowserAutomationSnapshot> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.snapshot.status = 'aborted';
    this.snapshot.sensitivePrompt = undefined;
    this.pushStep('abort', true, 'Browser automation stopped immediately by user command.');
    await this.refreshTabsState();
    return this.getSnapshot();
  }

  private async ensurePage(): Promise<Page> {
    if (!this.browser || !this.browser.isConnected()) {
      const executablePath = findChromiumExecutable();
      this.browser = await chromium.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1366, height: 840 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
      });
      this.pages = [];
      this.activeTabIndex = 0;
    }

    this.pages = this.pages.filter((p) => !p.isClosed());
    if (this.pages.length === 0) {
      const page = await this.context!.newPage();
      page.setDefaultTimeout(14000);
      this.pages.push(page);
      this.activeTabIndex = 0;
    }
    if (this.activeTabIndex >= this.pages.length) {
      this.activeTabIndex = this.pages.length - 1;
    }
    return this.pages[this.activeTabIndex];
  }

  private async refreshTabsState(): Promise<void> {
    this.pages = this.pages.filter((p) => !p.isClosed());
    const tabs: Array<{ index: number; title: string; url: string }> = [];
    for (let i = 0; i < this.pages.length; i += 1) {
      const p = this.pages[i];
      try {
        const title = (await p.title()) || 'Untitled Tab';
        const url = p.url() || 'about:blank';
        tabs.push({ index: i, title, url });
      } catch {
        tabs.push({ index: i, title: 'Tab', url: 'about:blank' });
      }
    }
    const active = tabs[this.activeTabIndex];
    this.snapshot.tabs = tabs;
    this.snapshot.tabCount = tabs.length;
    this.snapshot.activeTabIndex = this.activeTabIndex;
    this.snapshot.active = tabs.length > 0;
    this.snapshot.currentUrl = active?.url || 'about:blank';
    this.snapshot.pageTitle = active?.title || 'Standby';
    this.snapshot.updatedAt = new Date().toISOString();
  }

  private async dismissConsentIfPresent(page: Page): Promise<void> {
    const consentSelectors = [
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'button:has-text("Reject all")',
      'button[aria-label*="Accept" i]',
      '#L2AGLb',
    ];
    for (const sel of consentSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 700 })) {
          await btn.click({ timeout: 1500 });
          await page.waitForTimeout(300);
          return;
        }
      } catch {
        // ignore missing consent button
      }
    }
  }

  private async detectCaptchaOrBlock(page: Page): Promise<boolean> {
    try {
      const url = page.url().toLowerCase();
      if (url.includes('/sorry/') || url.includes('captcha')) return true;
      const bodyText = await page.evaluate(() =>
        (document.body?.innerText || '').slice(0, 1500).toLowerCase()
      );
      return (
        bodyText.includes('unusual traffic from your computer') ||
        bodyText.includes('verify you are human') ||
        bodyText.includes('i am not a robot') ||
        bodyText.includes('complete the security check')
      );
    } catch {
      return false;
    }
  }

  private async extractVisibleResults(
    page: Page,
    engineHint?: string
  ): Promise<{ results: BrowserSearchResultItem[]; summary: string }> {
    const url = page.url().toLowerCase();
    const isYoutube = engineHint === 'youtube' || url.includes('youtube.com');

    if (isYoutube) {
      const items = await page.evaluate(() => {
        const out: Array<{ title: string; url: string; snippet?: string }> = [];
        const links = Array.from(
          document.querySelectorAll('a#video-title, ytd-video-renderer a#video-title-link, a[href*="/watch?v="]')
        ) as HTMLAnchorElement[];
        const seen = new Set<string>();
        for (const a of links) {
          const href = a.href || '';
          const title = (a.getAttribute('title') || a.textContent || '').trim();
          if (!href.includes('/watch?v=') || !title || title.length < 2) continue;
          const cleanUrl = href.split('&pp=')[0];
          if (seen.has(cleanUrl)) continue;
          seen.add(cleanUrl);
          out.push({ title: title.slice(0, 140), url: cleanUrl });
          if (out.length >= 6) break;
        }
        return out;
      });
      const numbered = items.map((r, i) => ({ index: i + 1, ...r }));
      const summary =
        numbered.length > 0
          ? `Found ${numbered.length} YouTube results. Top video: ${numbered[0].title}`
          : await this.extractPageSummaryText(page);
      return { results: numbered, summary };
    }

    const items = await page.evaluate(() => {
      const out: Array<{ title: string; url: string; snippet?: string }> = [];
      const seen = new Set<string>();

      // Google / Bing / DuckDuckGo organic result links
      const candidates = Array.from(
        document.querySelectorAll(
          'div.g a:has(h3), a:has(h3), li.b_algo h2 a, .result__a, article[data-testid="result"] a[data-testid="result-title-a"], main a[href^="http"]'
        )
      ) as HTMLAnchorElement[];

      for (const a of candidates) {
        const href = a.href || '';
        if (
          !href.startsWith('http') ||
          href.includes('google.com/search') ||
          href.includes('accounts.google.') ||
          href.includes('policies.google.') ||
          href.includes('support.google.') ||
          href.includes('duckduckgo.com/')
        ) {
          continue;
        }
        const h3 = a.querySelector('h3');
        const rawTitle = (h3?.textContent || a.textContent || '').trim();
        if (!rawTitle || rawTitle.length < 3 || seen.has(href)) continue;
        seen.add(href);
        const parent = a.closest('div.g, li.b_algo, .result, article') || a.parentElement;
        const snippet = (parent?.textContent || '')
          .replace(rawTitle, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
        out.push({
          title: rawTitle.slice(0, 140),
          url: href,
          snippet: snippet || undefined,
        });
        if (out.length >= 6) break;
      }
      return out;
    });

    const numbered = items.map((r, i) => ({ index: i + 1, ...r }));
    const summary =
      numbered.length > 0
        ? `Found ${numbered.length} results. Top result: ${numbered[0].title}`
        : await this.extractPageSummaryText(page);
    return { results: numbered, summary };
  }

  private async extractPageSummaryText(page: Page): Promise<string> {
    try {
      const text = await page.evaluate(() => {
        const title = document.title || '';
        const body = (document.body?.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500);
        return title ? `${title} — ${body}` : body;
      });
      return text || 'Page loaded.';
    } catch {
      return 'Page loaded.';
    }
  }

  public async execute(
    req: BrowserExecuteRequest
  ): Promise<{ ok: boolean; spokenMessage: string; snapshot: BrowserAutomationSnapshot }> {
    if (req.action === 'stop_automation') {
      const snap = await this.abort();
      return {
        ok: true,
        spokenMessage: 'Browser automation stopped.',
        snapshot: snap,
      };
    }

    if (this.abortController) {
      this.abortController.abort();
    }
    const ctrl = new AbortController();
    this.abortController = ctrl;

    this.snapshot.status = 'running';
    this.snapshot.error = undefined;
    this.snapshot.sensitivePrompt = undefined;
    this.snapshot.steps = [];

    const checkAborted = () => {
      if (ctrl.signal.aborted) {
        throw new Error('AUTOMATION_ABORTED');
      }
    };

    try {
      const page = await this.ensurePage();
      checkAborted();

      if (req.action === 'search') {
        const engine = req.engine || 'google';
        const query = (req.query || '').trim();
        if (!query) {
          this.snapshot.status = 'failed';
          return {
            ok: false,
            spokenMessage: 'Please tell me what you want to search for.',
            snapshot: this.getSnapshot(),
          };
        }

        const engineConfig: Record<
          string,
          { url: string; selectors: string[]; name: string }
        > = {
          google: {
            url: 'https://www.google.com',
            selectors: ['textarea[name="q"]', 'input[name="q"]', '[role="combobox"]'],
            name: 'Google',
          },
          youtube: {
            url: 'https://www.youtube.com',
            selectors: [
              'input[name="search_query"]',
              'input#search',
              'input[placeholder*="Search" i]',
            ],
            name: 'YouTube',
          },
          duckduckgo: {
            url: 'https://duckduckgo.com',
            selectors: ['input[name="q"]', '#searchbox_input'],
            name: 'DuckDuckGo',
          },
          bing: {
            url: 'https://www.bing.com',
            selectors: ['textarea[name="q"]', 'input[name="q"]', '#sb_form_q'],
            name: 'Bing',
          },
        };

        const runEngineSearch = async (targetEngine: 'google' | 'youtube' | 'bing' | 'duckduckgo') => {
          const cfg = engineConfig[targetEngine];
          this.pushStep('open', true, `Opening ${cfg.name}...`);
          await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 14000 });
          checkAborted();
          await this.dismissConsentIfPresent(page);
          checkAborted();

          if (await this.detectCaptchaOrBlock(page)) {
            return { captchaBlocked: true, searchSubmitted: false };
          }

          let boxFound = false;
          for (const sel of cfg.selectors) {
            try {
              const loc = page.locator(sel).first();
              if (await loc.isVisible({ timeout: 2200 })) {
                await loc.click({ timeout: 2000 });
                this.pushStep('focus_search', true, `Focused search input on ${cfg.name}`);
                await loc.fill('');
                await loc.type(query, { delay: 18 });
                this.pushStep('type_query', true, `Typed "${query}"`);
                await Promise.all([
                  page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {}),
                  loc.press('Enter'),
                ]);
                boxFound = true;
                this.pushStep('submit', true, 'Pressed Enter and waited for results');
                break;
              }
            } catch {
              // try next selector
            }
          }

          // Fallback URL navigation only if the input selector couldn't be interacted with on this page
          if (!boxFound) {
            const directUrl =
              targetEngine === 'youtube'
                ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
                : targetEngine === 'duckduckgo'
                ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
                : targetEngine === 'bing'
                ? `https://www.bing.com/search?q=${encodeURIComponent(query)}`
                : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 14000 });
            this.pushStep('fallback_submit', true, `Loaded ${cfg.name} search URL directly`);
          }

          await page.waitForTimeout(1100);
          checkAborted();
          if (await this.detectCaptchaOrBlock(page)) {
            return { captchaBlocked: true, searchSubmitted: true };
          }
          return { captchaBlocked: false, searchSubmitted: true };
        };

        let searchOutcome = await runEngineSearch(engine);

        // If Google blocks server datacenter IP with a CAPTCHA, we NEVER bypass the CAPTCHA —
        // we disclose it transparently or fall back cleanly to DuckDuckGo HTML if web search was intended.
        let usedEngine: string = engineConfig[engine].name;
        let captchaNotice = '';
        if (searchOutcome.captchaBlocked && engine === 'google') {
          this.pushStep(
            'security_notice',
            false,
            'Google presented a human verification challenge (not bypassed). Trying DuckDuckGo web search for verifiable results.'
          );
          captchaNotice =
            'Google showed a verification CAPTCHA, which I will not bypass, so I searched DuckDuckGo instead. ';
          searchOutcome = await runEngineSearch('duckduckgo');
          usedEngine = 'DuckDuckGo';
        } else if (searchOutcome.captchaBlocked) {
          this.snapshot.status = 'failed';
          this.snapshot.error = `${usedEngine} requested a CAPTCHA / human check. Automation stopped for security.`;
          await this.refreshTabsState();
          return {
            ok: false,
            spokenMessage: `${usedEngine} asked for a CAPTCHA verification, so I stopped without bypassing security.`,
            snapshot: this.getSnapshot(),
          };
        }

        const { results, summary } = await this.extractVisibleResults(page, engine);
        this.snapshot.results = results;
        this.snapshot.pageSummary = summary;
        await this.refreshTabsState();

        if (results.length === 0) {
          this.pushStep('verify_results', false, `No organic links extracted on ${usedEngine}`);
          this.snapshot.status = 'completed';
          return {
            ok: true,
            spokenMessage: `${captchaNotice}Opened ${usedEngine} and searched for ${query}, though no clickable result links were exposed to headless view.`,
            snapshot: this.getSnapshot(),
          };
        }

        this.snapshot.status = 'completed';
        this.pushStep('verify_results', true, `Verified ${results.length} results on ${usedEngine}`);
        const topTitles = results
          .slice(0, 3)
          .map((r, i) => `${i + 1}: ${r.title}`)
          .join('. ');
        return {
          ok: true,
          spokenMessage: `${captchaNotice}Searched ${usedEngine} for ${query}. Top results: ${topTitles}`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'navigate' && req.url) {
        this.pushStep('navigate', true, `Navigating to ${req.url}`);
        await page.goto(req.url, { waitUntil: 'domcontentloaded', timeout: 14000 });
        await this.dismissConsentIfPresent(page);
        if (await this.detectCaptchaOrBlock(page)) {
          this.snapshot.status = 'failed';
          this.snapshot.error = 'CAPTCHA / human verification detected; stopped cleanly.';
          await this.refreshTabsState();
          return {
            ok: false,
            spokenMessage: 'That page presented a CAPTCHA verification check, so I stopped.',
            snapshot: this.getSnapshot(),
          };
        }
        const summary = await this.extractPageSummaryText(page);
        this.snapshot.pageSummary = summary;
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Opened ${this.snapshot.pageTitle}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'open_result') {
        const idx = Math.max(1, req.resultIndex || 1);
        const match = this.snapshot.results[idx - 1];
        if (!match) {
          this.snapshot.status = 'failed';
          this.snapshot.error = `Result #${idx} is not available in the current search list.`;
          return {
            ok: false,
            spokenMessage: `I could not find result number ${idx}. Run a search first.`,
            snapshot: this.getSnapshot(),
          };
        }
        this.pushStep('open_result', true, `Opening result #${idx}: ${match.title}`);
        await page.goto(match.url, { waitUntil: 'domcontentloaded', timeout: 14000 });
        const summary = await this.extractPageSummaryText(page);
        this.snapshot.pageSummary = summary;
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Opened result ${idx}: ${match.title}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'click_text' && req.targetText) {
        const label = req.targetText.trim();
        const isSensitiveLabel =
          /\b(?:pay|checkout|purchase|buy\s+now|submit\s+order|confirm\s+payment|sign\s+in|log\s*in|delete\s+account)\b/i.test(
            label
          );
        const pageHasSensitiveInputs = await page
          .locator('input[type="password"], input[autocomplete*="cc-" i]')
          .count()
          .catch(() => 0);

        if ((isSensitiveLabel || pageHasSensitiveInputs > 0) && !req.confirmedSensitive) {
          this.snapshot.status = 'awaiting_confirmation';
          this.snapshot.sensitivePrompt = {
            id: `sens_${Date.now()}`,
            reason:
              pageHasSensitiveInputs > 0
                ? 'This page contains password or payment fields.'
                : 'This button may trigger a login, purchase, or irreversible submission.',
            targetDescription: label,
          };
          this.pushStep('security_gate', true, `Paused before sensitive action "${label}"`);
          return {
            ok: false,
            spokenMessage: `Security check: please confirm on screen before I click "${label}".`,
            snapshot: this.getSnapshot(),
          };
        }

        const locator = page
          .locator(
            `a:has-text("${label.replace(/"/g, '\\"')}"), button:has-text("${label.replace(
              /"/g,
              '\\"'
            )}")`
          )
          .first();
        if (!(await locator.isVisible({ timeout: 2500 }).catch(() => false))) {
          this.snapshot.status = 'failed';
          this.snapshot.error = `Could not locate clickable button or link matching "${label}".`;
          return {
            ok: false,
            spokenMessage: `I could not find "${label}" on the current page.`,
            snapshot: this.getSnapshot(),
          };
        }

        await locator.click({ timeout: 4000 });
        await page.waitForTimeout(800);
        this.pushStep('click', true, `Clicked "${label}"`);
        this.snapshot.pageSummary = await this.extractPageSummaryText(page);
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Clicked ${label}. Current page: ${this.snapshot.pageTitle}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'scroll') {
        const dir = req.direction || 'down';
        await page.evaluate((d) => {
          if (d === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
          else if (d === 'bottom')
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          else if (d === 'up') window.scrollBy({ top: -640, behavior: 'smooth' });
          else window.scrollBy({ top: 640, behavior: 'smooth' });
        }, dir);
        this.pushStep('scroll', true, `Scrolled ${dir}`);
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Scrolled ${dir}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'back') {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
        this.pushStep('back', true, 'Navigated back');
        this.snapshot.pageSummary = await this.extractPageSummaryText(page);
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Went back to ${this.snapshot.pageTitle}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'forward') {
        await page.goForward({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
        this.pushStep('forward', true, 'Navigated forward');
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Moved forward to ${this.snapshot.pageTitle}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'new_tab') {
        const nextPage = await this.context!.newPage();
        nextPage.setDefaultTimeout(14000);
        if (req.url) {
          await nextPage.goto(req.url, { waitUntil: 'domcontentloaded', timeout: 14000 });
        }
        this.pages.push(nextPage);
        this.activeTabIndex = this.pages.length - 1;
        this.pushStep('new_tab', true, `Opened tab #${this.activeTabIndex + 1}`);
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Opened new tab #${this.activeTabIndex + 1}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'close_tab') {
        if (this.pages.length > 0) {
          const closing = this.pages[this.activeTabIndex];
          await closing.close().catch(() => {});
          this.pages.splice(this.activeTabIndex, 1);
          this.activeTabIndex = Math.max(0, Math.min(this.activeTabIndex, this.pages.length - 1));
        }
        this.pushStep('close_tab', true, 'Closed active tab');
        this.snapshot.status = this.pages.length > 0 ? 'completed' : 'idle';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage:
            this.pages.length > 0
              ? `Closed tab. Active tab is now ${this.snapshot.pageTitle}.`
              : 'Closed the browser tab.',
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'switch_tab') {
        if (this.pages.length <= 1) {
          return {
            ok: false,
            spokenMessage: 'Only one tab is open right now.',
            snapshot: this.getSnapshot(),
          };
        }
        this.activeTabIndex = (this.activeTabIndex + 1) % this.pages.length;
        this.pushStep('switch_tab', true, `Switched to tab #${this.activeTabIndex + 1}`);
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        return {
          ok: true,
          spokenMessage: `Switched to tab ${this.activeTabIndex + 1}: ${this.snapshot.pageTitle}.`,
          snapshot: this.getSnapshot(),
        };
      }

      if (req.action === 'read_page') {
        const summary = await this.extractPageSummaryText(page);
        this.snapshot.pageSummary = summary;
        this.snapshot.status = 'completed';
        await this.refreshTabsState();
        this.pushStep('read_page', true, `Read page "${this.snapshot.pageTitle}"`);
        return {
          ok: true,
          spokenMessage: summary,
          snapshot: this.getSnapshot(),
        };
      }

      return {
        ok: false,
        spokenMessage: 'Unsupported browser automation action.',
        snapshot: this.getSnapshot(),
      };
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTOMATION_ABORTED') {
        this.snapshot.status = 'aborted';
        return {
          ok: false,
          spokenMessage: 'Browser automation aborted.',
          snapshot: this.getSnapshot(),
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.snapshot.status = 'failed';
      this.snapshot.error = msg.slice(0, 220);
      this.pushStep('error', false, this.snapshot.error);
      await this.refreshTabsState().catch(() => {});
      return {
        ok: false,
        spokenMessage: `Browser automation failed: ${this.snapshot.error}`,
        snapshot: this.getSnapshot(),
      };
    } finally {
      if (this.abortController === ctrl) {
        this.abortController = null;
      }
    }
  }
}
