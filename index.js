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
        const activeCard = core.getActiveCard(chatId, userId);
        if (waiting[chatId].deposit) {
            if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
            activeCard.deposit += num;
            bot.sendMessage(chatId, `Депозит карты "${activeCard.name}" увеличен на ${helpers.formatRUB(num)}. Текущий депозит: ${helpers.formatRUB(activeCard.deposit)}`);
            helpers.logTransaction(`Card #${activeCard.id} Deposit: ${helpers.formatRUB(num)}. Total: ${helpers.formatRUB(activeCard.deposit)}`, core.logFilePath);
            processed = true;
        } else if (waiting[chatId].depositMinus) {
            if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
            activeCard.deposit -= num;
            bot.sendMessage(chatId, `С депозита карты "${activeCard.name}" списан расход на ${helpers.formatRUB(num)}. Текущий депозит: ${helpers.formatRUB(activeCard.deposit)}`);
            helpers.logTransaction(`Card #${activeCard.id} Expense: ${helpers.formatRUB(num)}. Total deposit: ${helpers.formatRUB(activeCard.deposit)}`, core.logFilePath);
            processed = true;
        } else if (waiting[chatId].paid) {
            if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
            activeCard.paid += num;
            bot.sendMessage(chatId, `Для карты "${activeCard.name}" зачислена выплата: ${helpers.formatRUB(num)}. Всего выплачено по карте: ${helpers.formatRUB(activeCard.paid)}`);
            helpers.logTransaction(`Card #${activeCard.id} Paid: ${helpers.formatRUB(num)}. Total: ${helpers.formatRUB(activeCard.paid)}`, core.logFilePath);
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
        const activeCard = core.getActiveCard(chatId, userId);
        if (!activeCard) return bot.sendMessage(chatId, "❌ Не выбрана активная карта. Используйте /usecard <ID>");
        const buyAmount = parseFloat(text.slice(1));
        const order = {
            id: chatState.nextOrderId++,
            buyAmountRUB: buyAmount,
            status: 'open',
            profitRUB: null,
            sellAmountRUB: null,
            openTimestamp: new Date().toISOString(),
        };
        activeCard.orders.push(order);
        core.saveState();
        helpers.logTransaction(`Card #${activeCard.id}: Opened order #${order.id} for ${helpers.formatRUB(buyAmount)}`, core.logFilePath);
        return bot.sendMessage(chatId, `✅ На карту "${activeCard.name}" добавлен ордер #${order.id} на сумму ${helpers.formatRUB(buyAmount)}`);
    }

    if (text.startsWith('-') && text.split(' ').length === 2) {
        const parts = text.slice(1).split(' ');
        const orderId = parseInt(parts[0], 10);
        const sellAmount = parseFloat(parts[1]);
        if (isNaN(orderId) || isNaN(sellAmount)) return bot.sendMessage(chatId, 'Неверный формат. Используйте: -<ID> <сумма>');
        let targetOrder = null;
        for (const card of chatState.cards) {
            const order = card.orders.find(o => o.id === orderId && o.status === 'open');
            if (order) {
                targetOrder = order;
                break;
            }
        }
        if (!targetOrder) return bot.sendMessage(chatId, `Открытый ордер с ID #${orderId} не найден.`);
        targetOrder.status = 'closed';
        targetOrder.sellAmountRUB = sellAmount;
        targetOrder.profitRUB = targetOrder.sellAmountRUB - targetOrder.buyAmountRUB;
        targetOrder.closeTimestamp = new Date().toISOString();
        core.saveState();
        helpers.logTransaction(`Closed order #${targetOrder.id} for ${helpers.formatRUB(sellAmount)}. Profit: ${helpers.formatRUB(targetOrder.profitRUB)}`, core.logFilePath);
        const profitMessage = targetOrder.profitRUB >= 0 ? `💰 Профит: ${helpers.formatRUB(targetOrder.profitRUB)}` : `🔻 Убыток: ${helpers.formatRUB(targetOrder.profitRUB)}`;
        return bot.sendMessage(chatId, `☑️ Ордер #${orderId} закрыт.\nСумма продажи: ${helpers.formatRUB(sellAmount)}\n${profitMessage}`);
    }

    switch (normalizedMessage) {
        case '/start':
            stopbot[chatId] = false;
            return bot.sendMessage(chatId, `Бот запущен и готов к работе!`);
        case '/info': {
            const activeCard = core.getActiveCard(chatId, userId);
            let infoText = `📊 *Общая сводка по всем картам*\n\n`;
            const allCardsProfit = chatState.cards.reduce((sum, card) => {
                const cardProfit = card.orders.filter(o => o.status === 'closed').reduce((s, o) => s + (o.profitRUB || 0), 0);
                return sum + cardProfit;
            }, 0);
            const allCardsPaid = chatState.cards.reduce((sum, card) => sum + card.paid, 0);
            const allCardsDeposit = chatState.cards.reduce((sum, card) => sum + card.deposit, 0);
            const profitAfterPercentage = allCardsProfit - (allCardsProfit * chatState.procentage / 100);
            const readyForPayment = profitAfterPercentage - allCardsPaid;
            infoText += `💰 *Общий депозит:* ${helpers.formatRUB(allCardsDeposit)}\n`;
            infoText += `📈 *Общий профит:* ${helpers.formatRUB(allCardsProfit)}\n`;
            infoText += ` - Профит (-${chatState.procentage}%): ${helpers.formatRUB(profitAfterPercentage)}\n`;
            infoText += ` - Всего выплачено: ${helpers.formatRUB(allCardsPaid)}\n`;
            infoText += ` - *Итого к выплате:* ${helpers.formatRUB(readyForPayment)}\n\n`;
            infoText += `💲 *Курсы:* ${chatState.buyRate} / ${chatState.sellRate} (Покупка/Продажа)\n\n`;
            infoText += `🗂️ *Сводка по картам:*\n`;
            if (chatState.cards.length > 0) {
                chatState.cards.forEach(card => {
                    const cardProfit = card.orders.filter(o => o.status === 'closed').reduce((s, o) => s + (o.profitRUB || 0), 0);
                    const activeMarker = activeCard && activeCard.id === card.id ? '📍' : '';
                    infoText += `${activeMarker}ID: ${card.id} | "${card.name}" (${card.owner}) - Профит: ${helpers.formatRUB(cardProfit)}\n`;
                });
            } else {
                infoText += `Карт пока нет.\n`;
            }
            if (activeCard) {
                infoText += `\n\n*───────────*\n\n`;
                infoText += `📍 *Активная карта: "${activeCard.name}" (ID: ${activeCard.id})*\n`;
                const openOrders = activeCard.orders.filter(o => o.status === 'open');
                const closedOrders = activeCard.orders.filter(o => o.status === 'closed');
                const cardProfit = closedOrders.reduce((sum, o) => sum + (o.profitRUB || 0), 0);
                const openOrdersValue = openOrders.reduce((sum, o) => sum + o.buyAmountRUB, 0);
                infoText += ` - Депозит: ${helpers.formatRUB(activeCard.deposit)}\n`;
                infoText += ` - Выплачено: ${helpers.formatRUB(activeCard.paid)}\n`;
                infoText += ` - Профит по карте: ${helpers.formatRUB(cardProfit)}\n`;
                infoText += ` - Ордера в работе (${openOrders.length} шт.): ${helpers.formatRUB(openOrdersValue)}\n`;
                if (openOrders.length > 0) {
                    openOrders.slice(-5).forEach(o => {
                        infoText += `   - Ордер #${o.id}: ${helpers.formatRUB(o.buyAmountRUB)}\n`;
                    });
                }
            } else {
                infoText += `\n\n_Чтобы увидеть детальную информацию по карте, выберите ее: /usecard <ID>_`;
            }
            return bot.sendMessage(chatId, infoText, { parse_mode: 'Markdown' });
        }
        case '/listcards': {
            let listText = '🗂️ *Список всех карт:*\n\n';
            if (chatState.cards.length === 0) {
                listText = 'Карт пока нет.';
            } else {
                chatState.cards.forEach(card => {
                    listText += `*ID: ${card.id}* | "${card.name}" | Владелец: ${card.owner}\n`;
                });
            }
            return bot.sendMessage(chatId, listText, { parse_mode: 'Markdown' });
        }
        case '/usecard': {
            const args = msg.text.split(' ').slice(1);
            if (args.length !== 1) return bot.sendMessage(chatId, 'Неверный формат. Используйте: /usecard <ID>');
            const cardId = parseInt(args[0], 10);
            if (isNaN(cardId)) return bot.sendMessage(chatId, 'ID карты должен быть числом.');
            const cardToUse = chatState.cards.find(c => c.id === cardId);
            if (!cardToUse) return bot.sendMessage(chatId, `Карта с ID ${cardId} не найдена.`);
            chatState.userSessions[userId] = cardId;
            core.saveState();
            return bot.sendMessage(chatId, `📍 Активная карта изменена на "${cardToUse.name}" (ID: ${cardToUse.id})`);
        }
        case '/removecard': {
            if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
            const args = msg.text.split(' ').slice(1);
            if (args.length !== 1) return bot.sendMessage(chatId, 'Неверный формат. Используйте: /removecard <ID>');
            const cardId = parseInt(args[0], 10);
            if (isNaN(cardId)) return bot.sendMessage(chatId, 'ID карты должен быть числом.');
            const cardIndex = chatState.cards.findIndex(c => c.id === cardId);
            if (cardIndex === -1) return bot.sendMessage(chatId, `Карта с ID ${cardId} не найдена.`);
            const [removedCard] = chatState.cards.splice(cardIndex, 1);
            for (const sessionUserId in chatState.userSessions) {
                if (chatState.userSessions[sessionUserId] === cardId) {
                    delete chatState.userSessions[sessionUserId];
                }
            }
            core.saveState();
            helpers.logTransaction(`Card removed: #${removedCard.id} ${removedCard.name}`, core.logFilePath);
            return bot.sendMessage(chatId, `🗑️ Карта "${removedCard.name}" (ID: ${removedCard.id}) была удалена.`);
        }
        case '/deposit':
            if (isAdmin) {
                const activeCard = core.getActiveCard(chatId, userId);
                if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
                waiting[chatId].deposit = true;
                msgWait[chatId] = await bot.sendMessage(chatId, `Введите сумму для пополнения депозита карты "${activeCard.name}":`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/expense':
            if (isAdmin) {
                const activeCard = core.getActiveCard(chatId, userId);
                if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
                waiting[chatId].depositMinus = true;
                msgWait[chatId] = await bot.sendMessage(chatId, `Введите сумму расхода для списания с депозита карты "${activeCard.name}":`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/paid':
            if (isAdmin) {
                const activeCard = core.getActiveCard(chatId, userId);
                if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
                waiting[chatId].paid = true;
                msgWait[chatId] = await bot.sendMessage(chatId, `Введите сумму выплаты для карты "${activeCard.name}":`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе');
            }
            break;
        case '/close': {
            if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
            const args = text.split(' ');
            if (args.length !== 3) return bot.sendMessage(chatId, 'Неверный формат. Используйте: /close <ID> <сумма>');
            const orderId = parseInt(args[1], 10);
            const sellAmount = parseFloat(args[2]);
            if (isNaN(orderId) || isNaN(sellAmount)) return bot.sendMessage(chatId, 'ID ордера и сумма должны быть числами.');
            let order = null;
            for (const card of chatState.cards) {
                const foundOrder = card.orders.find(o => o.id === orderId && o.status === 'open');
                if (foundOrder) {
                    order = foundOrder;
                    break;
                }
            }
            if (!order) return bot.sendMessage(chatId, `Открытый ордер с ID #${orderId} не найден.`);
            order.status = 'closed';
            order.sellAmountRUB = sellAmount;
            order.profitRUB = order.sellAmountRUB - order.buyAmountRUB;
            order.closeTimestamp = new Date().toISOString();
            core.saveState();
            helpers.logTransaction(`Closed order #${order.id} for ${helpers.formatRUB(sellAmount)}. Profit: ${helpers.formatRUB(order.profitRUB)}`, core.logFilePath);
            const profitMessage = order.profitRUB >= 0 ? `💰 Профит: ${helpers.formatRUB(order.profitRUB)}` : `🔻 Убыток: ${helpers.formatRUB(order.profitRUB)}`;
            return bot.sendMessage(chatId, `☑️ Ордер #${orderId} закрыт.\nСумма продажи: ${helpers.formatRUB(sellAmount)}\n${profitMessage}`);
        }
        case '/cancelorder': {
            if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
            const args = text.split(' ');
            if (args.length !== 2) return bot.sendMessage(chatId, 'Неверный формат. Используйте: /cancelorder <ID>');
            const orderId = parseInt(args[1], 10);
            if (isNaN(orderId)) return bot.sendMessage(chatId, 'ID ордера должен быть числом.');
            let orderIndex = -1;
            let cardWithOrder = null;
            for (const card of chatState.cards) {
                const index = card.orders.findIndex(o => o.id === orderId);
                if (index !== -1) {
                    orderIndex = index;
                    cardWithOrder = card;
                    break;
                }
            }
            if (orderIndex === -1) return bot.sendMessage(chatId, `Ордер с ID #${orderId} не найден.`);
            if (cardWithOrder.orders[orderIndex].status === 'closed') return bot.sendMessage(chatId, `Ордер #${orderId} уже закрыт и не может быть отменен.`);
            const [cancelledOrder] = cardWithOrder.orders.splice(orderIndex, 1);
            core.saveState();
            helpers.logTransaction(`Cancelled order #${cancelledOrder.id} from card #${cardWithOrder.id}`, core.logFilePath);
            return bot.sendMessage(chatId, `❌ Ордер #${cancelledOrder.id} на сумму ${helpers.formatRUB(cancelledOrder.buyAmountRUB)} был отменен.`);
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
    }
});

console.log('Бот инициализирован. Запуск основной логики...');