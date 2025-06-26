const TelegramApi = require('node-telegram-bot-api');
const core = require('./app/core/botCore');
const helpers = require('./app/util/helpers');

const token = '8177306110:AAEvI3t25aHlc54jbYB-o4A-20MnRyrCDbI';
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

    let normalizedMessage = text.split(' ')[0].toLowerCase().trim();
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
            bot.sendMessage(chatId, `Депозит увеличен на ${num} USDT. Текущий депозит: ${chatState.deposit} USDT`);
            helpers.logTransaction(`Депозит увеличен на ${num} USDT. Текущий депозит: ${chatState.deposit} USDT`, core.logFilePath);
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
        helpers.logTransaction(`Депозит увеличен на ${amount} USDT. Текущий депозит: ${chatState.deposit} USDT`, core.logFilePath);
        return bot.sendMessage(chatId, `✅ Депозит увеличен на ${amount} USDT. Текущий депозит: ${chatState.deposit} USDT`);
    }

    if (text.startsWith('-') && !isNaN(parseFloat(text.slice(1)))) {
        if (typeof chatState.deposit !== 'number') chatState.deposit = 0;
        if (!Array.isArray(chatState.usdtOutHistory)) chatState.usdtOutHistory = [];
        let amount = parseFloat(text.slice(1));
        // Сохраняем сумму для дальнейшего ввода курса
        waiting[chatId].usdtOut = amount;
        msgWait[chatId] = await bot.sendMessage(chatId, `Введите курс продажи USDT для этой операции:`);
        return;
    }

    // После ввода курса продажи
    if (!isNaN(num) && waiting[chatId].usdtOut) {
        let usdtAmount = waiting[chatId].usdtOut;
        let sellRate = num;
        let rubAmount = usdtAmount * sellRate;
        chatState.deposit -= usdtAmount;
        chatState.withdrawRUB = (typeof chatState.withdrawRUB === 'number' ? chatState.withdrawRUB : 0) + rubAmount;
        chatState.usdtOutHistory.push({ usdt: usdtAmount, rub: rubAmount });
        core.saveState();
        helpers.logTransaction(`С депозита списано ${usdtAmount} USDT по курсу ${sellRate}. Перегнано в RUB: ${helpers.formatRUB(rubAmount)}`, core.logFilePath);
        bot.sendMessage(chatId, `💸 С депозита списано ${usdtAmount} USDT по курсу ${sellRate}. Перегнано в RUB: ${helpers.formatRUB(rubAmount)}`);
        waiting[chatId].usdtOut = null;
        msgWait[chatId] = null;
        return;
    }

    // После ввода депозита в режиме стартовой настройки
    if (waiting[chatId] && waiting[chatId].adminDeposit) {
        if (!isNaN(num)) {
            if (typeof chatState.deposit !== 'number') chatState.deposit = 0;
            chatState.deposit += num;
            core.saveState();
            bot.editMessageText('Сессия запущена, хорошей работы!', { chat_id: chatId, message_id: msgWait[chatId].message_id });
            waiting[chatId].adminDeposit = false;
            msgWait[chatId] = null;
            return;
        }
    }

    switch (normalizedMessage) {
        case '/start':
            stopbot[chatId] = false;
            return bot.sendMessage(chatId, `Бот запущен и готов к работе!`);
        case '/info': {
            let infoText = '📊 <b>Сводка</b>\n\n';
            if (chatState.sessionMode === 'USDT_TO_RUB') {
                infoText += `💲 <b>Средний курс обмена:</b> `;
                if (Array.isArray(chatState.usdtOutHistory) && chatState.usdtOutHistory.length > 0) {
                    const totalRub = chatState.usdtOutHistory.reduce((s, o) => s + o.rub, 0);
                    const totalUsdt = chatState.usdtOutHistory.reduce((s, o) => s + o.usdt, 0);
                    const avg = totalUsdt > 0 ? (totalRub / totalUsdt) : 0;
                    infoText += `<b>${avg.toFixed(2)}</b>\n`;
                } else {
                    infoText += `<i>нет операций</i>\n`;
                }
            } else {
                infoText += `💲 <b>Курсы:</b> <b>${chatState.buyRate}</b> / <b>${chatState.sellRate}</b> (Покупка/Продажа)\n`;
            }
            if (typeof chatState.deposit === 'number') {
                infoText += `💰 <b>Депозит:</b> <b>${chatState.deposit} USDT</b>\n`;
            }
            if (typeof chatState.withdrawRUB === 'number' && chatState.withdrawRUB > 0) {
                infoText += `💸 <b>Перегнано в RUB:</b> <b>${helpers.formatRUB(chatState.withdrawRUB)}</b>\n`;
            }
            if (chatState.sessionMode) {
                let modeText = '';
                if (chatState.sessionMode === 'RUB_TO_USDT') modeText = 'Перегон RUB -> USDT';
                if (chatState.sessionMode === 'USDT_TO_RUB') modeText = 'Перегон USDT -> RUB';
                if (chatState.sessionMode === 'ARBITRAGE') modeText = 'Арбитраж';
                infoText += `\n⚙️ <b>Режим:</b> <b>${modeText}</b>\n`;
            }
            return bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' });
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
            // Если режим не выбран — показываем выбор режима
            if (!chatState.sessionMode) {
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
            } else {
                // Если режим уже выбран — сразу просим депозит
                waiting[chatId].adminDeposit = true;
                msgWait[chatId] = await bot.sendMessage(chatId, 'Введите стартовый депозит в USDT:');
            }
            break;
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
        case '/history': {
            if (!Array.isArray(chatState.usdtOutHistory) || chatState.usdtOutHistory.length === 0) {
                return bot.sendMessage(chatId, 'История пуста.');
            }
            let msg = 'История выводов USDT → RUB:\n';
            chatState.usdtOutHistory.forEach((op, idx) => {
                msg += `${idx + 1}. ${op.usdt} USDT → ${helpers.formatRUB(op.rub)}\n`;
            });
            return bot.sendMessage(chatId, msg);
        }
        case '/editout': {
            const args = text.split(' ');
            if (args.length !== 2) return bot.sendMessage(chatId, 'Используй: /editout N');
            const idx = parseInt(args[1], 10) - 1;
            if (isNaN(idx) || !chatState.usdtOutHistory || !chatState.usdtOutHistory[idx]) return bot.sendMessage(chatId, 'Операция не найдена.');
            waiting[chatId].editOutIdx = idx;
            msgWait[chatId] = await bot.sendMessage(chatId, `Введите новый курс для операции #${idx + 1} (было: ${chatState.usdtOutHistory[idx].usdt} USDT → ${helpers.formatRUB(chatState.usdtOutHistory[idx].rub)}):`);
            return;
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

    // После ввода нового курса для /editout
    if (!isNaN(num) && waiting[chatId].editOutIdx !== undefined) {
        const idx = waiting[chatId].editOutIdx;
        const op = chatState.usdtOutHistory[idx];
        if (op) {
            // Пересчитываем RUB для этой операции
            op.rub = op.usdt * num;
            // Пересчитываем withdrawRUB по всей истории
            chatState.withdrawRUB = chatState.usdtOutHistory.reduce((s, o) => s + o.rub, 0);
            core.saveState();
            bot.sendMessage(chatId, `Операция #${idx + 1} обновлена: ${op.usdt} USDT → ${helpers.formatRUB(op.rub)}`);
        }
        waiting[chatId].editOutIdx = undefined;
        msgWait[chatId] = null;
        return;
    }
});

// Добавляю обработку callback_query для выбора режима
bot.on('callback_query', async (query) => {
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
        // После выбора режима сразу просим депозит, заменяя сообщение
        waiting[chatId].adminDeposit = true;
        await bot.editMessageText('Режим установлен. Введите стартовый депозит в USDT:', { chat_id: chatId, message_id: query.message.message_id });
        msgWait[chatId] = { chat: { id: chatId }, message_id: query.message.message_id };
        return bot.answerCallbackQuery(query.id, { text: 'Режим изменён' });
    }
});

// После инициализации бота:
bot.setMyCommands([
    { command: 'info', description: 'Показать сводку' },
    { command: 'deposit', description: 'Пополнить депозит (USDT)' },
    { command: 'setbuyrate', description: 'Установить курс покупки' },
    { command: 'setsellrate', description: 'Установить курс продажи' },
    { command: 'setpercentage', description: 'Установить процент' },
    { command: 'admin', description: 'Панель управления режимом' },
    { command: 'reset', description: 'Полный сброс бота' },
    { command: 'history', description: 'История обменов USDT → RUB' },
    { command: 'editout', description: 'Редактировать курс для вывода (используй: /editout N)' },
]);

console.log('Бот инициализирован. Запуск основной логики...');