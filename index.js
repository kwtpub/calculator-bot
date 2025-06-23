const TelegramApi = require('node-telegram-bot-api')
const fs = require('fs');
const path = require('path');

const token = '5337124438:AAE04oWHASaPccC_ewRzhcxXtGwc3qTZ8_E'
const bot = new TelegramApi(token, {polling:true})

// --- Переменные состояния ---
let waitingPushAdmin = false;
let stopbot = false;
let msgWait = null;
let waiting = {
    deposit: false,
    depositMinus: false,
    paid: false,
    buyRate: false,
    sellRate: false,
    setPercentage: false,
};

// --- Состояние бота ---
let state = {
    procentage: 5,
    buyRate: 89,
    sellRate: 90,
    cards: [],
    nextCardId: 1,
    nextOrderId: 1,
    admins: [934931129, 722365458, 7031413034, 5040590272, 1653318632],
    userSessions: {}, // { chatId: activeCardId }
};

const stateFilePath = path.join(__dirname, 'bot_state.json');
const logFilePath = path.join(__dirname, 'log.txt');

// --- Функции управления состоянием ---
function saveState() {
    try {
        fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('Ошибка при сохранении состояния:', error);
    }
}

function loadState() {
    try {
        if (fs.existsSync(stateFilePath)) {
            const fileContent = fs.readFileSync(stateFilePath, 'utf8');
            let loadedState = JSON.parse(fileContent);

            // Миграция со старой структуры состояния
            if (loadedState.deposit !== undefined || loadedState.orders !== undefined) {
                console.log("Обнаружена старая структура состояния. Производится миграция...");
                const defaultCard = {
                    id: 1,
                    name: "Default",
                    owner: "Admin",
                    deposit: loadedState.deposit || 0,
                    paid: loadedState.paid || 0,
                    orders: loadedState.orders || [],
                };
                
                loadedState.cards = [defaultCard];
                loadedState.nextCardId = 2;
                
                // Пересчитываем nextOrderId
                const allOrders = loadedState.cards.flatMap(c => c.orders);
                if (allOrders.length > 0) {
                    const maxId = Math.max(...allOrders.map(o => o.id));
                    loadedState.nextOrderId = maxId + 1;
                } else {
                     loadedState.nextOrderId = 1;
                }

                delete loadedState.deposit;
                delete loadedState.paid;
                delete loadedState.orders;
                console.log("Миграция завершена.");
            }

            // Слияние загруженного состояния с состоянием по умолчанию
            state = { ...state, ...loadedState };

            // Убедимся, что ID следующего ордера корректен
            const allOrders = state.cards.flatMap(c => c.orders);
            if (allOrders.length > 0 && allOrders.some(o => o.id)) {
                const maxId = Math.max(...allOrders.map(o => o.id));
                state.nextOrderId = maxId + 1;
            }
        }
    } catch (error) {
        console.error('Ошибка при загрузке состояния:', error);
    }
}

function logTransaction(message) {
    const timestamp = new Date().toLocaleString('ru-RU');
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(logFilePath, logMessage, 'utf8');
    } catch (error) {
        console.error('Ошибка при записи в лог:', error);
    }
}

// --- Функции форматирования ---
function formatUSD(currency) {
    const rate = state.buyRate; 
    if (rate === 0) return '$0.00';
    const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    return USD.format(currency / rate);
}

function formatRUB(currency) {
    const RUB = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
    return RUB.format(currency);
}

// --- Вспомогательные функции ---
function getActiveCard(chatId) {
    const activeCardId = state.userSessions[chatId];
    if (!activeCardId) {
        return null;
    }
    return state.cards.find(c => c.id === activeCardId);
}

// --- Главная функция ---
async function start() {
    loadState(); 

    const commands = [
        { command: 'info', description: '📊 Информация и сводка' },
        { command: 'addcard', description: '💳 Добавить новую карту' },
        { command: 'listcards', description: '🗂️ Список всех карт' },
        { command: 'usecard', description: '👆 Выбрать активную карту' },
        { command: 'removecard', description: '🗑️ Удалить карту' },
        { command: 'deposit', description: '💰 Внести депозит (на акт. карту)' },
        { command: 'expense', description: '💸 Списать расход (с акт. карты)' },
        { command: 'paid', description: '📈 Ввести выплаты (с акт. карты)' },
        { command: 'close', description: '☑️ Закрыть ордер' },
        { command: 'cancelorder', description: '❌ Отменить ордер' },
        { command: 'setbuyrate', description: '💲 Установить курс покупки' },
        { command: 'setsellrate', description: '💲 Установить курс продажи' },
        { command: 'setpercentage', description: '⚙️ Установить процент' },
        { command: 'addadmin', description: '👑 Добавить админа' },
        { command: 'getuserid', description: '🆔 Получить свой ID' },
        { command: 'stop', description: '🛑 Остановить бота' },
    ];
    
    bot.setMyCommands(commands);

    bot.on('message', async (msg) => {
        console.log(JSON.stringify(msg, null, 2));
        if (!msg.text) {
            return;
        }

        const chatId = msg.chat.id;
        const text = msg.text;
        const userId = msg.from.id;
        const isAdmin = state.admins.includes(userId);

        let normalizedMessage = text.split(' ')[0].toLowerCase();
        if (normalizedMessage.includes('@')) {
            normalizedMessage = normalizedMessage.split('@')[0];
        }
        
        if (stopbot && normalizedMessage !== '/start') {
            return;
        }

        const num = parseFloat(text);
        if (!isNaN(num) && msgWait) {
            let processed = false;
            const activeCard = getActiveCard(chatId);

            if (waiting.deposit) {
                if (!activeCard) { bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>"); return; }
                activeCard.deposit += num;
                bot.sendMessage(chatId, `Депозит карты "${activeCard.name}" увеличен на ${formatRUB(num)}. Текущий депозит: ${formatRUB(activeCard.deposit)}`);
                logTransaction(`Card #${activeCard.id} Deposit: ${formatRUB(num)}. Total: ${formatRUB(activeCard.deposit)}`);
                processed = true;
            } else if (waiting.depositMinus) {
                if (!activeCard) { bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>"); return; }
                activeCard.deposit -= num;
                bot.sendMessage(chatId, `С депозита карты "${activeCard.name}" списан расход на ${formatRUB(num)}. Текущий депозит: ${formatRUB(activeCard.deposit)}`);
                logTransaction(`Card #${activeCard.id} Expense: ${formatRUB(num)}. Total deposit: ${formatRUB(activeCard.deposit)}`);
                processed = true;
            } else if (waiting.paid) {
                if (!activeCard) { bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>"); return; }
                activeCard.paid += num;
                bot.sendMessage(chatId, `Для карты "${activeCard.name}" зачислена выплата: ${formatRUB(num)}. Всего выплачено по карте: ${formatRUB(activeCard.paid)}`);
                logTransaction(`Card #${activeCard.id} Paid: ${formatRUB(num)}. Total: ${formatRUB(activeCard.paid)}`);
                processed = true;
            } else if (waiting.buyRate) {
                state.buyRate = num;
                bot.sendMessage(chatId, `Курс покупки установлен: 1$ = ${formatRUB(state.buyRate)}`);
                logTransaction(`Buy rate set to: ${state.buyRate}`);
                processed = true;
            } else if (waiting.sellRate) {
                state.sellRate = num;
                bot.sendMessage(chatId, `Курс продажи установлен: 1$ = ${formatRUB(state.sellRate)}`);
                logTransaction(`Sell rate set to: ${state.sellRate}`);
                processed = true;
            } else if (waiting.setPercentage) {
                state.procentage = num;
                bot.sendMessage(chatId, `Процент установлен: ${state.procentage}%`);
                logTransaction(`Percentage set to: ${state.procentage}`);
                processed = true;
            } else if (waitingPushAdmin) {
                if (!state.admins.includes(num)) {
                    state.admins.push(num);
                    bot.sendMessage(chatId, `Пользователь с ID ${num} добавлен в админы.`);
                    logTransaction(`Admin added: ${num}`);
                } else {
                    bot.sendMessage(chatId, `Пользователь с ID ${num} уже является админом.`);
                }
                processed = true;
            }

            if(processed) {
                await bot.deleteMessage(msgWait.chat.id, msgWait.message_id).catch(e => console.error("Could not delete message:", e.message));
                Object.keys(waiting).forEach(k => waiting[k] = false);
                waitingPushAdmin = false;
                msgWait = null;
                saveState();
                return;
            }
        }

        if (text.startsWith('+') && !isNaN(parseFloat(text.slice(1)))) {
            const activeCard = getActiveCard(chatId);
            if (!activeCard) {
                return bot.sendMessage(chatId, "❌ Не выбрана активная карта. Используйте /usecard <ID>");
            }
            const buyAmount = parseFloat(text.slice(1));
            const order = {
                id: state.nextOrderId++,
                buyAmountRUB: buyAmount,
                status: 'open',
                profitRUB: null,
                sellAmountRUB: null,
                openTimestamp: new Date().toISOString(),
            };
            activeCard.orders.push(order);
            saveState();
            logTransaction(`Card #${activeCard.id}: Opened order #${order.id} for ${formatRUB(buyAmount)}`);
            return bot.sendMessage(chatId, `✅ На карту "${activeCard.name}" добавлен ордер #${order.id} на сумму ${formatRUB(buyAmount)}`);
        }
        
        if (text.startsWith('-') && text.split(' ').length === 2) {
             const parts = text.slice(1).split(' ');
             const orderId = parseInt(parts[0], 10);
             const sellAmount = parseFloat(parts[1]);

             if (isNaN(orderId) || isNaN(sellAmount)) {
                 return bot.sendMessage(chatId, 'Неверный формат. Используйте: -<ID> <сумма>');
             }
             
            let targetOrder = null;
            for (const card of state.cards) {
                const order = card.orders.find(o => o.id === orderId && o.status === 'open');
                if (order) {
                    targetOrder = order;
                    break;
                }
            }

            if (!targetOrder) {
                return bot.sendMessage(chatId, `Открытый ордер с ID #${orderId} не найден.`);
            }

            targetOrder.status = 'closed';
            targetOrder.sellAmountRUB = sellAmount;
            targetOrder.profitRUB = targetOrder.sellAmountRUB - targetOrder.buyAmountRUB;
            targetOrder.closeTimestamp = new Date().toISOString();
            
            saveState();
            logTransaction(`Closed order #${targetOrder.id} for ${formatRUB(sellAmount)}. Profit: ${formatRUB(targetOrder.profitRUB)}`);

            const profitMessage = targetOrder.profitRUB >= 0 ? `💰 Профит: ${formatRUB(targetOrder.profitRUB)}` : `🔻 Убыток: ${formatRUB(targetOrder.profitRUB)}`;
            return bot.sendMessage(chatId, `☑️ Ордер #${orderId} закрыт.\nСумма продажи: ${formatRUB(sellAmount)}\n${profitMessage}`);
        }
        
        switch (normalizedMessage) {
            case '/start':
                stopbot = false;
                return bot.sendMessage(chatId, `Бот запущен и готов к работе!`);
            case '/info': {
                const activeCard = getActiveCard(chatId);
                let infoText = `📊 *Общая сводка по всем картам*\n\n`;

                const allCardsProfit = state.cards.reduce((sum, card) => {
                    const cardProfit = card.orders.filter(o => o.status === 'closed').reduce((s, o) => s + (o.profitRUB || 0), 0);
                    return sum + cardProfit;
                }, 0);
                const allCardsPaid = state.cards.reduce((sum, card) => sum + card.paid, 0);
                const allCardsDeposit = state.cards.reduce((sum, card) => sum + card.deposit, 0);

                const profitAfterPercentage = allCardsProfit - (allCardsProfit * state.procentage / 100);
                const readyForPayment = profitAfterPercentage - allCardsPaid;

                infoText += `💰 *Общий депозит:* ${formatRUB(allCardsDeposit)}\n`;
                infoText += `📈 *Общий профит:* ${formatRUB(allCardsProfit)}\n`;
                infoText += ` - Профит (-${state.procentage}%): ${formatRUB(profitAfterPercentage)}\n`;
                infoText += ` - Всего выплачено: ${formatRUB(allCardsPaid)}\n`;
                infoText += ` - *Итого к выплате:* ${formatRUB(readyForPayment)}\n\n`;
                infoText += `💲 *Курсы:* ${state.buyRate} / ${state.sellRate} (Покупка/Продажа)\n\n`;

                infoText += `🗂️ *Сводка по картам:*\n`;
                if (state.cards.length > 0) {
                    state.cards.forEach(card => {
                        const cardProfit = card.orders.filter(o => o.status === 'closed').reduce((s, o) => s + (o.profitRUB || 0), 0);
                        const activeMarker = activeCard && activeCard.id === card.id ? '📍' : '';
                        infoText += `${activeMarker}ID: ${card.id} | "${card.name}" (${card.owner}) - Профит: ${formatRUB(cardProfit)}\n`;
                    });
                } else {
                    infoText += `Карт пока нет. Добавьте первую с помощью /addcard\n`;
                }

                if (activeCard) {
                    infoText += `\n\n*───────────*\n\n`;
                    infoText += `📍 *Активная карта: "${activeCard.name}" (ID: ${activeCard.id})*\n`;
                    
                    const openOrders = activeCard.orders.filter(o => o.status === 'open');
                    const closedOrders = activeCard.orders.filter(o => o.status === 'closed');
                    const cardProfit = closedOrders.reduce((sum, o) => sum + (o.profitRUB || 0), 0);
                    const openOrdersValue = openOrders.reduce((sum, o) => sum + o.buyAmountRUB, 0);
                    
                    infoText += ` - Депозит: ${formatRUB(activeCard.deposit)}\n`;
                    infoText += ` - Выплачено: ${formatRUB(activeCard.paid)}\n`;
                    infoText += ` - Профит по карте: ${formatRUB(cardProfit)}\n`;
                    infoText += ` - Ордера в работе (${openOrders.length} шт.): ${formatRUB(openOrdersValue)}\n`;
                    if (openOrders.length > 0) {
                        openOrders.slice(-5).forEach(o => {
                           infoText += `   - Ордер #${o.id}: ${formatRUB(o.buyAmountRUB)}\n`;
                       });
                   }
                } else {
                    infoText += `\n\n_Чтобы увидеть детальную информацию по карте, выберите ее: /usecard <ID>_`;
                }

                return bot.sendMessage(chatId, infoText, { parse_mode: 'Markdown' });
            }
            case '/addcard': {
                if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
                const args = msg.text.split(' ').slice(1);
                if (args.length < 2) {
                    return bot.sendMessage(chatId, 'Неверный формат. Используйте: /addcard <название> <владелец>');
                }
                const name = args[0];
                const owner = args.slice(1).join(' ');

                const newCard = {
                    id: state.nextCardId++,
                    name,
                    owner,
                    deposit: 0,
                    paid: 0,
                    orders: [],
                };
                state.cards.push(newCard);
                saveState();
                logTransaction(`Card created: #${newCard.id} ${name} (${owner})`);
                return bot.sendMessage(chatId, `💳 Карта "${name}" (${owner}) успешно добавлена с ID ${newCard.id}`);
            }
            case '/listcards': {
                let listText = '🗂️ *Список всех карт:*\n\n';
                if (state.cards.length === 0) {
                    listText = 'Карт пока нет. Добавьте первую с помощью /addcard';
                } else {
                    state.cards.forEach(card => {
                        listText += `*ID: ${card.id}* | "${card.name}" | Владелец: ${card.owner}\n`;
                    });
                }
                return bot.sendMessage(chatId, listText, { parse_mode: 'Markdown' });
            }
            case '/usecard': {
                const args = msg.text.split(' ').slice(1);
                if (args.length !== 1) {
                    return bot.sendMessage(chatId, 'Неверный формат. Используйте: /usecard <ID>');
                }
                const cardId = parseInt(args[0], 10);
                if (isNaN(cardId)) {
                    return bot.sendMessage(chatId, 'ID карты должен быть числом.');
                }
                const cardToUse = state.cards.find(c => c.id === cardId);
                if (!cardToUse) {
                    return bot.sendMessage(chatId, `Карта с ID ${cardId} не найдена.`);
                }

                state.userSessions[chatId] = cardId;
                saveState();
                return bot.sendMessage(chatId, `📍 Активная карта изменена на "${cardToUse.name}" (ID: ${cardToUse.id})`);
            }
            case '/removecard': {
                if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
                const args = msg.text.split(' ').slice(1);
                if (args.length !== 1) {
                    return bot.sendMessage(chatId, 'Неверный формат. Используйте: /removecard <ID>');
                }
                const cardId = parseInt(args[0], 10);
                if (isNaN(cardId)) {
                    return bot.sendMessage(chatId, 'ID карты должен быть числом.');
                }
                const cardIndex = state.cards.findIndex(c => c.id === cardId);
                if (cardIndex === -1) {
                    return bot.sendMessage(chatId, `Карта с ID ${cardId} не найдена.`);
                }
                
                const [removedCard] = state.cards.splice(cardIndex, 1);
                
                // Сбросить активную карту, если она была удалена
                for (const sessionChatId in state.userSessions) {
                    if (state.userSessions[sessionChatId] === cardId) {
                        delete state.userSessions[sessionChatId];
                    }
                }
                
                saveState();
                logTransaction(`Card removed: #${removedCard.id} ${removedCard.name}`);
                return bot.sendMessage(chatId, `🗑️ Карта "${removedCard.name}" (ID: ${removedCard.id}) была удалена.`);
            }
            case '/deposit':
                if (isAdmin) {
                    const activeCard = getActiveCard(chatId);
                    if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
                    waiting.deposit = true;
                    msgWait = await bot.sendMessage(chatId, `Введите сумму для пополнения депозита карты "${activeCard.name}":`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/expense':
                 if (isAdmin) {
                    const activeCard = getActiveCard(chatId);
                    if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
                    waiting.depositMinus = true;
                    msgWait = await bot.sendMessage(chatId, `Введите сумму расхода для списания с депозита карты "${activeCard.name}":`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/paid':
                if (isAdmin) {
                    const activeCard = getActiveCard(chatId);
                    if (!activeCard) return bot.sendMessage(chatId, "Сначала выберите карту командой /usecard <ID>");
                    waiting.paid = true;
                    msgWait = await bot.sendMessage(chatId, `Введите сумму выплаты для карты "${activeCard.name}":`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/close': {
                if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');
                
                const args = text.split(' ');
                if (args.length !== 3) {
                    return bot.sendMessage(chatId, 'Неверный формат. Используйте: /close <ID> <сумма>');
                }
                const orderId = parseInt(args[1], 10);
                const sellAmount = parseFloat(args[2]);

                if (isNaN(orderId) || isNaN(sellAmount)) {
                    return bot.sendMessage(chatId, 'ID ордера и сумма должны быть числами.');
                }
                
                let order = null;
                for (const card of state.cards) {
                    const foundOrder = card.orders.find(o => o.id === orderId && o.status === 'open');
                    if (foundOrder) {
                        order = foundOrder;
                        break;
                    }
                }

                if (!order) {
                    return bot.sendMessage(chatId, `Открытый ордер с ID #${orderId} не найден.`);
                }

                order.status = 'closed';
                order.sellAmountRUB = sellAmount;
                order.profitRUB = order.sellAmountRUB - order.buyAmountRUB;
                order.closeTimestamp = new Date().toISOString();
                
                saveState();
                logTransaction(`Closed order #${order.id} for ${formatRUB(sellAmount)}. Profit: ${formatRUB(order.profitRUB)}`);

                const profitMessage = order.profitRUB >= 0 ? `💰 Профит: ${formatRUB(order.profitRUB)}` : `🔻 Убыток: ${formatRUB(order.profitRUB)}`;
                return bot.sendMessage(chatId, `☑️ Ордер #${orderId} закрыт.\nСумма продажи: ${formatRUB(sellAmount)}\n${profitMessage}`);
            }
            case '/cancelorder': {
                 if (!isAdmin) return bot.sendMessage(chatId, 'Отказано в доступе');

                const args = text.split(' ');
                if (args.length !== 2) {
                    return bot.sendMessage(chatId, 'Неверный формат. Используйте: /cancelorder <ID>');
                }
                const orderId = parseInt(args[1], 10);
                if (isNaN(orderId)) {
                    return bot.sendMessage(chatId, 'ID ордера должен быть числом.');
                }

                let orderIndex = -1;
                let cardWithOrder = null;

                for (const card of state.cards) {
                    const index = card.orders.findIndex(o => o.id === orderId);
                    if (index !== -1) {
                        orderIndex = index;
                        cardWithOrder = card;
                        break;
                    }
                }
                
                if (orderIndex === -1) {
                    return bot.sendMessage(chatId, `Ордер с ID #${orderId} не найден.`);
                }
                if (cardWithOrder.orders[orderIndex].status === 'closed') {
                    return bot.sendMessage(chatId, `Ордер #${orderId} уже закрыт и не может быть отменен.`);
                }

                const [cancelledOrder] = cardWithOrder.orders.splice(orderIndex, 1);
                saveState();
                logTransaction(`Cancelled order #${cancelledOrder.id} from card #${cardWithOrder.id}`);
                return bot.sendMessage(chatId, `❌ Ордер #${cancelledOrder.id} на сумму ${formatRUB(cancelledOrder.buyAmountRUB)} был отменен.`);
            }
            case '/setbuyrate':
                if (isAdmin) {
                    waiting.buyRate = true;
                    msgWait = await bot.sendMessage(chatId, `Введите новый курс ПОКУПКИ (1$ = ? RUB):`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/setsellrate':
                if (isAdmin) {
                    waiting.sellRate = true;
                    msgWait = await bot.sendMessage(chatId, `Введите новый курс ПРОДАЖИ (1$ = ? RUB):`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/setpercentage':
                if (isAdmin) {
                    waiting.setPercentage = true;
                    msgWait = await bot.sendMessage(chatId, `Введите новый процент:`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/stop':
                if (isAdmin) {
                    stopbot = true;
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
                    waitingPushAdmin = true;
                    msgWait = await bot.sendMessage(chatId, `Введите ID пользователя, которому хотите дать права администратора:`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
        }
    });
}

start()