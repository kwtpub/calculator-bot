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
    deposit: 0,
    procentage: 5,
    paid: 0,
    buyRate: 89,
    sellRate: 90,
    orders: [],
    nextOrderId: 1,
    admins: [934931129, 722365458, 7031413034, 5040590272, 1653318632],
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
            const loadedState = JSON.parse(fileContent);
            // Слияние загруженного состояния с состоянием по умолчанию
            state = { ...state, ...loadedState };
            // Убедимся, что ID следующего ордера корректен
            if (state.orders.length > 0 && state.orders.some(o => o.id)) {
                const maxId = Math.max(...state.orders.map(o => o.id));
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

// --- Главная функция ---
async function start() {
    loadState(); 

    const commands = [
        { command: 'start', description: '🚀 Запуск/Перезапуск бота' },
        { command: 'info', description: '📊 Информация о сделках' },
        { command: 'deposit', description: '💰 Внести депозит' },
        { command: 'expense', description: '💸 Списать расход' },
        { command: 'paid', description: '📈 Ввести выплаты' },
        { command: 'close', description: '☑️ Закрыть ордер' },
        { command: 'setbuyrate', description: '💲 Установить курс покупки' },
        { command: 'setsellrate', description: '💲 Установить курс продажи' },
        { command: 'setpercentage', description: '⚙️ Установить процент' },
        { command: 'cancelorder', description: '❌ Отменить ордер' },
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
            if (waiting.deposit) {
                state.deposit += num;
                bot.sendMessage(chatId, `Депозит увеличен на ${formatRUB(num)}. Текущий депозит: ${formatRUB(state.deposit)}`);
                logTransaction(`Deposit added: ${formatRUB(num)}. Total: ${formatRUB(state.deposit)}`);
                processed = true;
            } else if (waiting.depositMinus) {
                state.deposit -= num;
                bot.sendMessage(chatId, `Списан расход на ${formatRUB(num)}. Текущий депозит: ${formatRUB(state.deposit)}`);
                logTransaction(`Expense: ${formatRUB(num)}. Total deposit: ${formatRUB(state.deposit)}`);
                processed = true;
            } else if (waiting.paid) {
                state.paid += num;
                bot.sendMessage(chatId, `Зачислена выплата: ${formatRUB(num)}. Всего выплачено: ${formatRUB(state.paid)}`);
                logTransaction(`Paid: ${formatRUB(num)}. Total: ${formatRUB(state.paid)}`);
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
            const buyAmount = parseFloat(text.slice(1));
            const order = {
                id: state.nextOrderId++,
                buyAmountRUB: buyAmount,
                status: 'open',
                profitRUB: null,
                sellAmountRUB: null,
                openTimestamp: new Date().toISOString(),
            };
            state.orders.push(order);
            saveState();
            logTransaction(`Opened order #${order.id} for ${formatRUB(buyAmount)}`);
            return bot.sendMessage(chatId, `✅ Открыт ордер #${order.id} на сумму ${formatRUB(buyAmount)}`);
        }
        
        if (text.startsWith('-') && text.split(' ').length === 2) {
             const parts = text.slice(1).split(' ');
             const orderId = parseInt(parts[0], 10);
             const sellAmount = parseFloat(parts[1]);

             if (isNaN(orderId) || isNaN(sellAmount)) {
                 return bot.sendMessage(chatId, 'Неверный формат. Используйте: -<ID> <сумма>');
             }
             
            const order = state.orders.find(o => o.id === orderId && o.status === 'open');
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
        
        switch (normalizedMessage) {
            case '/start':
                stopbot = false;
                return bot.sendMessage(chatId, `Бот запущен и готов к работе!`);
            case '/info': {
                const openOrders = state.orders.filter(o => o.status === 'open');
                const closedOrders = state.orders.filter(o => o.status === 'closed');

                const totalProfit = closedOrders.reduce((sum, o) => sum + (o.profitRUB || 0), 0);
                const profitAfterPercentage = totalProfit - (totalProfit * state.procentage / 100);
                const readyForPayment = profitAfterPercentage - state.paid;

                const openOrdersValue = openOrders.reduce((sum, o) => sum + o.buyAmountRUB, 0);

                let infoText = `📊 *Общая информация*\n\n`;
                infoText += `💰 *Депозит:* ${formatRUB(state.deposit)}\n`;
                infoText += `💲 *Курсы:* ${state.buyRate} / ${state.sellRate} (Покупка/Продажа)\n`;
                infoText += `⚙️ *Процент:* ${state.procentage}%\n\n`;
                
                infoText += `📈 *Финансы*\n`;
                infoText += ` - Общий профит: ${formatRUB(totalProfit)}\n`;
                infoText += ` - Профит (-%): ${formatRUB(profitAfterPercentage)}\n`;
                infoText += ` - Выплачено: ${formatRUB(state.paid)}\n`;
                infoText += ` - *К выплате:* ${formatRUB(readyForPayment)}\n\n`;

                infoText += `📋 *Ордера в работе (${openOrders.length} шт.):* ${formatRUB(openOrdersValue)}\n`;
                if (openOrders.length > 0) {
                     openOrders.slice(-10).forEach(o => {
                        infoText += `   - Ордер #${o.id}: ${formatRUB(o.buyAmountRUB)}\n`;
                    });
                } else {
                    infoText += `   Нет открытых ордеров.\n`;
                }

                return bot.sendMessage(chatId, infoText, { parse_mode: 'Markdown' });
            }
            case '/deposit':
                if (isAdmin) {
                    waiting.deposit = true;
                    msgWait = await bot.sendMessage(chatId, `Введите сумму для пополнения депозита:`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/expense':
                 if (isAdmin) {
                    waiting.depositMinus = true;
                    msgWait = await bot.sendMessage(chatId, `Введите сумму расхода для списания с депозита:`);
                } else {
                    bot.sendMessage(chatId, 'Отказано в доступе');
                }
                break;
            case '/paid':
                if (isAdmin) {
                    waiting.paid = true;
                    msgWait = await bot.sendMessage(chatId, `Введите сумму выплаты:`);
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
                
                const order = state.orders.find(o => o.id === orderId && o.status === 'open');
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

                const orderIndex = state.orders.findIndex(o => o.id === orderId);
                if (orderIndex === -1) {
                    return bot.sendMessage(chatId, `Ордер с ID #${orderId} не найден.`);
                }
                if (state.orders[orderIndex].status === 'closed') {
                    return bot.sendMessage(chatId, `Ордер #${orderId} уже закрыт и не может быть отменен.`);
                }

                const [cancelledOrder] = state.orders.splice(orderIndex, 1);
                saveState();
                logTransaction(`Cancelled order #${cancelledOrder.id}`);
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