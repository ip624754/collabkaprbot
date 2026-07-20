import { getBot } from '../src/bot/bot.js';
import { assertEnv, CFG } from '../src/lib/config.js';
import { timingSafeEq } from '../src/lib/adminWeb/common.js';
import logger from '../src/lib/logger.js';
import { safeLogError, telegramUpdateLogSummary } from '../src/lib/logPrivacy.js';

let botInitPromise = null;
let botFactory = getBot;

export function __setWebhookBotFactoryForTests(factory) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test_hook_forbidden');
  botFactory = typeof factory === 'function' ? factory : getBot;
  botInitPromise = null;
}

export function __resetWebhookTestHooks() {
  if (process.env.NODE_ENV !== 'test') throw new Error('test_hook_forbidden');
  botFactory = getBot;
  botInitPromise = null;
}

async function ensureBotInit(bot) {
  if (!botInitPromise) {
    botInitPromise = bot.init().catch((error) => {
      botInitPromise = null;
      throw error;
    });
  }
  await botInitPromise;
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    if (!CFG.WEBHOOK_SECRET_TOKEN) {
      res.status(500).json({ ok: false, error: 'webhook_secret_missing' });
      return;
    }

    const token = req.headers['x-telegram-bot-api-secret-token'];
    if (!token || !timingSafeEq(token, CFG.WEBHOOK_SECRET_TOKEN)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    assertEnv();

    const bot = botFactory();
    await ensureBotInit(bot);

    const update = req.body;
    if (!update) {
      res.status(400).json({ ok: false, error: 'no_body' });
      return;
    }

    const summary = telegramUpdateLogSummary(update);
    logger.info(summary, 'webhook.in');

    await bot.handleUpdate(update);

    logger.info({ update_id: summary.update_id, ms: Date.now() - startedAt }, 'webhook.ok');
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ ms: Date.now() - startedAt, err: safeLogError(error) }, 'webhook.error');
    res.status(500).json({ ok: false, error: 'internal' });
  }
}
