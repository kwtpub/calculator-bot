const TelegramApi = require('node-telegram-bot-api');
const core = require('./app/core/botCore');
const helpers = require('./app/util/helpers');

const token = '5337124438:AAE04oWHASaPccC_ewRzhcxXtGwc3qTZ8_E';
const bot = new TelegramApi(token, { polling: true });

core.loadState();

// --- Временные переменные ожидания для каждого чата ---
const waiting = {};
const msgWait = {};
const waitingPushAdmin = {};
const stopbot = {};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatState = core.getChatState(chatId);
    if (!Array.isArray(chatState.admins)) chatState.admins = [934931129, 722365458, 7031413034, 5040590272, 1653318632];
    const isAdmin = chatState.admins.includes(userId);
    const text = msg.text;
    if (!text) return;

    if (!waiting[chatId]) waiting[chatId] = {};
    if (!msgWait[chatId]) msgWait[chatId] = null;
    if (!waitingPushAdmin[chatId]) waitingPushAdmin[chatId] = false;
    if (!stopbot[chatId]) stopbot[chatId] = false;

    let normalizedMessage = text.split(' ')[0].toLowerCase();
    if (normalizedMessage.includes('@')) {
        normalizedMessage = normalizedMessage.split('@')[0];
    }

    if (stopbot[chatId] && normalizedMessage !== '/start') return;

    const num = parseFloat(text);
    if (!isNaN(num) && msgWait[chatId]) {
        let processed = false;
        if (waiting[chatId].deposit) {
            if (typeof chatState.deposit !== 'number') chatState.deposit = 0;
            chatState.deposit += num;
            bot.sendMessage(chatId, `Депозит увеличен на ${helpers.formatUSD(num, chatState.buyRate)}. Текущий депозит: ${helpers.formatUSD(chatState.deposit, chatState.buyRate)}`);
            helpers.logTransaction(`Депозит увеличен на ${helpers.formatUSD(num, chatState.buyRate)}. Текущий депозит: ${helpers.formatUSD(chatState.deposit, chatState.buyRate)}`, core.logFilePath);
            processed = true;
        } else if (waiting[chatId].withdrawRUB) {
            if (typeof chatState.withdrawRUB !== 'number') chatState.withdrawRUB = 0;
            chatState.withdrawRUB += num;
            bot.sendMessage(chatId, `Сумма перегнанных в RUB увеличена на ${helpers.formatRUB(num)}. Всего перегнано: ${helpers.formatRUB(chatState.withdrawRUB)}`);
            helpers.logTransaction(`Сумма перегнанных в RUB увеличена на ${helpers.formatRUB(num)}. Всего перегнано: ${helpers.formatRUB(chatState.withdrawRUB)}`, core.logFilePath);
            processed = true;
        } else if (waiting[chatId].depositMinus) {
            bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
            processed = true;
        } else if (waiting[chatId].paid) {
            bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
            processed = true;
        } else if (waiting[chatId].buyRate) {
            chatState.buyRate = num;
            bot.sendMessage(chatId, `Курс покупки установлен: 1$ = ${helpers.formatRUB(chatState.buyRate)}`);
            helpers.logTransaction(`Buy rate set to: ${chatState.buyRate}`, core.logFilePath);
            processed = true;
        } else if (waiting[chatId].sellRate) {
            chatState.sellRate = num;
            bot.sendMessage(chatId, `Курс продажи установлен: 1$ = ${helpers.formatRUB(chatState.sellRate)}`);
            helpers.logTransaction(`Sell rate set to: ${chatState.sellRate}`, core.logFilePath);
            processed = true;
        } else if (waiting[chatId].setPercentage) {
            chatState.procentage = num;
            bot.sendMessage(chatId, `Процент установлен: ${chatState.procentage}%`);
            helpers.logTransaction(`Percentage set to: ${chatState.procentage}`, core.logFilePath);
            processed = true;
        } else if (waitingPushAdmin[chatId]) {
            if (!chatState.admins.includes(num)) {
                chatState.admins.push(num);
                bot.sendMessage(chatId, `Пользователь с ID ${num} добавлен в админы.`);
                helpers.logTransaction(`Admin added: ${num}`, core.logFilePath);
            } else {
                bot.sendMessage(chatId, `Пользователь с ID ${num} уже является админом.`);
            }
            processed = true;
        }
        if (processed) {
            if (msgWait[chatId]) await bot.deleteMessage(msgWait[chatId].chat.id, msgWait[chatId].message_id).catch(() => {});
            waiting[chatId] = {};
            waitingPushAdmin[chatId] = false;
            msgWait[chatId] = null;
            core.saveState();
            return;
        }
    }

    if (text.startsWith('+') && !isNaN(parseFloat(text.slice(1)))) {
        if (typeof chatState.deposit !== 'number') chatState.deposit = 0;
        let amount = parseFloat(text.slice(1));
        chatState.deposit += amount;
        core.saveState();
        helpers.logTransaction(`Депозит увеличен на ${helpers.formatUSD(amount, chatState.buyRate)}. Текущий депозит: ${helpers.formatUSD(chatState.deposit, chatState.buyRate)}`, core.logFilePath);
        return bot.sendMessage(chatId, `✅ Депозит увеличен на ${helpers.formatUSD(amount, chatState.buyRate)}. Текущий депозит: ${helpers.formatUSD(chatState.deposit, chatState.buyRate)}`);
    }

    if (text.startsWith('-') && !isNaN(parseFloat(text.slice(1)))) {
        if (typeof chatState.deposit !== 'number') chatState.deposit = 0;
        if (typeof chatState.withdrawRUB !== 'number') chatState.withdrawRUB = 0;
        let amount = parseFloat(text.slice(1));
        chatState.deposit -= amount;
        chatState.withdrawRUB += amount * chatState.sellRate;
        core.saveState();
        helpers.logTransaction(`С депозита списано ${helpers.formatUSD(amount, chatState.buyRate)}. Текущий депозит: ${helpers.formatUSD(chatState.deposit, chatState.buyRate)}. Перегнано в RUB: ${helpers.formatRUB(chatState.withdrawRUB)}`, core.logFilePath);
        return bot.sendMessage(chatId, `💸 С депозита списано ${helpers.formatUSD(amount, chatState.buyRate)}. Текущий депозит: ${helpers.formatUSD(chatState.deposit, chatState.buyRate)}\nПерегнано в RUB: ${helpers.formatRUB(chatState.withdrawRUB)}`);
    }

    switch (normalizedMessage) {
        case '/start':
            stopbot[chatId] = false;
            return bot.sendMessage(chatId, `Бот запущен и готов к работе!`);
        case '/info': {
            let infoText = `📊 *Сводка*\n\n`;
            infoText += `💲 *Курсы:* ${chatState.buyRate} / ${chatState.sellRate} (Покупка/Продажа)\n`;
            infoText += `Процент: ${chatState.procentage}%\n`;
            if (typeof chatState.deposit === 'number') {
                infoText += `Депозит: ${helpers.formatUSD(chatState.deposit, chatState.buyRate)}\n`;
            }
            if (typeof chatState.withdrawRUB === 'number' && chatState.withdrawRUB > 0) {
                infoText += `Перегнано в RUB: ${helpers.formatRUB(chatState.withdrawRUB)}\n`;
            }
            if (chatState.sessionMode) {
                let modeText = '';
                if (chatState.sessionMode === 'RUB_TO_USDT') modeText = 'Перегон RUB -> USDT';
                if (chatState.sessionMode === 'USDT_TO_RUB') modeText = 'Перегон USDT -> RUB';
                if (chatState.sessionMode === 'ARBITRAGE') modeText = 'Арбитраж';
                infoText += `Режим: ${modeText}\n`;
            }
            return bot.sendMessage(chatId, infoText, { parse_mode: 'Markdown' });
        }
        case '/setbuyrate':
            if (isAdmin) {
                waiting[chatId].buyRate = true;
                msgWait[chatId] = await bot.sendMessage(chatId, `Введите новый курс ПОКУПКИ (1$ = ? RUB):`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/setsellrate':
            if (isAdmin) {
                waiting[chatId].sellRate = true;
                msgWait[chatId] = await bot.sendMessage(chatId, `Введите новый курс ПРОДАЖИ (1$ = ? RUB):`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/setpercentage':
            if (isAdmin) {
                waiting[chatId].setPercentage = true;
                msgWait[chatId] = await bot.sendMessage(chatId, `Введите новый процент:`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/stop':
            if (isAdmin) {
                stopbot[chatId] = true;
                bot.sendMessage(chatId, 'Бот остановлен. Для запуска используйте /start');
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/getuserid':
            bot.sendMessage(chatId, `Ваш ID: \`${userId}\``, { parse_mode: 'Markdown' });
            break;
        case '/addadmin':
            if (isAdmin) {
                waitingPushAdmin[chatId] = true;
                msgWait[chatId] = await bot.sendMessage(chatId, `Введите ID пользователя, которому хотите дать права администратора:`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/deposit':
            if (isAdmin) {
                if (chatState.sessionMode === 'USDT_TO_RUB') {
                    waiting[chatId].deposit = true;
                    msgWait[chatId] = await bot.sendMessage(chatId, `Введите сумму депозита в USDT:`);
                } else {
                    waiting[chatId].deposit = true;
                    msgWait[chatId] = await bot.sendMessage(chatId, `Введите сумму депозита в USDT:`);
                }
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/admin': {
            if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'RUB -> USDT', callback_data: 'RUB_TO_USDT' }],
                        [{ text: 'USDT -> RUB', callback_data: 'USDT_TO_RUB' }],
                        [{ text: 'Арбитраж', callback_data: 'ARBITRAGE' }],
                    ]
                }
            };
            return bot.sendMessage(chatId, 'Выберите режим работы:', inlineKeyboard);
        }
        case '/withdrawrub': {
            if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
            if (chatState.sessionMode !== 'USDT_TO_RUB') return bot.sendMessage(chatId, 'Данная команда доступна только в режиме USDT -> RUB');
            waiting[chatId].withdrawRUB = true;
            msgWait[chatId] = await bot.sendMessage(chatId, `Введите сумму в RUB, которую перегнали из USDT:`);
            break;
        }
        case '/reset': {
            if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
            const def = core.getChatState(chatId);
            Object.keys(def).forEach(k => delete def[k]);
            const newState = { procentage: 5, buyRate: 89, sellRate: 90 };
            Object.assign(def, newState);
            core.saveState();
            return bot.sendMessage(chatId, 'Состояние бота полностью сброшено для этого чата.');
        }
    }

    // Обработка выбора режима через кнопки
    if (msg.text === 'RUB -> USDT' || msg.text === 'USDT -> RUB' || msg.text === 'Арбитраж') {
        if (isAdmin) {
            let mode = '';
            if (msg.text === 'RUB -> USDT') mode = 'RUB_TO_USDT';
            if (msg.text === 'USDT -> RUB') mode = 'USDT_TO_RUB';
            if (msg.text === 'Арбитраж') mode = 'ARBITRAGE';
            chatState.sessionMode = mode;
            core.saveState();
            return bot.sendMessage(chatId, `Режим установлен: ${msg.text}`);
        }
    }
});

// Добавляю обработку callback_query для выбора режима
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const chatState = core.getChatState(chatId);
    if (!Array.isArray(chatState.admins)) chatState.admins = [934931129, 722365458, 7031413034, 5040590272, 1653318632];
    const isAdmin = chatState.admins.includes(userId);
    if (!isAdmin) return bot.answerCallbackQuery(query.id, { text: 'Отказано в доступе', show_alert: true });
    let mode = '';
    if (query.data === 'RUB_TO_USDT') mode = 'RUB_TO_USDT';
    if (query.data === 'USDT_TO_RUB') mode = 'USDT_TO_RUB';
    if (query.data === 'ARBITRAGE') mode = 'ARBITRAGE';
    if (mode) {
        chatState.sessionMode = mode;
        core.saveState();
        bot.editMessageText(`Режим установлен: ${
            mode === 'RUB_TO_USDT' ? 'Перегон RUB -> USDT' :
            mode === 'USDT_TO_RUB' ? 'Перегон USDT -> RUB' :
            'Арбитраж'
        }`, { chat_id: chatId, message_id: query.message.message_id });
        bot.answerCallbackQuery(query.id, { text: 'Режим изменён' });
    }
});

console.log('Бот инициализирован. Запуск основной логики...');