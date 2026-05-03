import { setTelegramBots } from '../services/notification.service.js';
import { createBot } from './telegram.handler.js';

export function registerTelegramWebhookHandlers({
    app,
    tokens = [],
    createBotFn = createBot,
    logger,
    botStore = []
}) {
    const registrations = [];
    const telegramTokens = tokens.filter(Boolean);

    if (!app || telegramTokens.length === 0) {
        setTelegramBots(botStore);
        return registrations;
    }

    logger?.info?.(`Configuring ${telegramTokens.length} Telegram bot(s) in webhook mode...`);

    telegramTokens.forEach((token, index) => {
        try {
            const bot = createBotFn(token);
            if (!bot) return;

            const webhookPath = `/telegram-webhook-${index}`;

            // Mount before notFound/error middleware so Telegram requests are
            // handled by Telegraf instead of dying as generic 404s.
            app.use(bot.webhookCallback(webhookPath));

            botStore.push(bot);
            registrations.push({ bot, index, webhookPath });

            logger?.info?.(`Telegram Bot #${index + 1} webhook handler mounted at ${webhookPath}`);
        } catch (error) {
            logger?.error?.(`Telegram Bot #${index + 1} setup error`, error);
        }
    });

    setTelegramBots(botStore);
    return registrations;
}

export function activateTelegramWebhookRegistrations({
    registrations = [],
    externalBaseUrl = '',
    logger
}) {
    return registrations.map(({ bot, index, webhookPath }) => {
        const botLabel = `Telegram Bot #${index + 1}`;
        const webhookUrl = externalBaseUrl ? `${externalBaseUrl}${webhookPath}` : null;

        if (!webhookUrl) {
            logger?.warn?.(
                `${botLabel} webhook URL unavailable; set EXTERNAL_BASE_URL (or RENDER_EXTERNAL_URL) so Telegram can reach the bot`
            );
            return Promise.resolve(false);
        }

        return bot.telegram.setWebhook(webhookUrl)
            .then(() => {
                logger?.info?.(`✅ ${botLabel} webhook set at ${webhookPath}`);
                return true;
            })
            .catch((error) => {
                logger?.error?.(`${botLabel} webhook setup failed`, error);
                return false;
            });
    });
}

export default {
    activateTelegramWebhookRegistrations,
    registerTelegramWebhookHandlers
};
