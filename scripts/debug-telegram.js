
import 'dotenv/config';
import { Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;

console.log('Testing Telegram Token:', token ? token.substring(0, 10) + '...' : 'MISSING');

if (!token) {
    console.error('No token found!');
    process.exit(1);
}

const bot = new Telegraf(token);

bot.telegram.getMe().then((botInfo) => {
    console.log('Success! Bot info:', botInfo);
    process.exit(0);
}).catch((err) => {
    console.error('Failed to get bot info:', err);
    process.exit(1);
});
