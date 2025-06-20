
const TelegramApi = require('node-telegram-bot-api')
token = '5337124438:AAE04oWHASaPccC_ewRzhcxXtGwc3qTZ8_E'
const bot = new TelegramApi(token, {polling:true})
const fs = require('fs');
waitingDeposit = false;
const fileName = 'log.txt';
waitingPaid = false;
waitingDollarExchangeRate = false;
msgWait = null;
let date1 = new Date();
const path = require('path');
stopbot = false;
waitingSetProcentage = false;
waitingDepositMinus = false;
waitingPushAdmin = false;
currentMaxId = 1;
function last7() {
    fs.readFile('data.json', 'utf8', (err, data) => {
        if (err) {
          console.error('Ошибка при чтении файла:', err);
          return;
        }
      
        try {
          // Попытка преобразования в массив
          const lines = data.split('\n');
      
          // Фильтрация пустых строк и удаление потенциальных ошибок
          const validLines = lines.filter(line => line.trim() !== '');
      
          // Извлечение последних 7 строк
          lastSevenRows = validLines.slice(-7);
      
          // Вывод последних строк
          
          
      
        } catch (parseError) {
          console.error('Ошибка при парсинге данных:', parseError);
        }
      });
}
last7()
date1Time = `${date1.getUTCHours() + 3}:${date1.getUTCMinutes()}:${date1.getUTCSeconds()}`;
setInterval(
    function getData() {
    date1 = new Date();
    date1Time = `${date1.getUTCHours() + 3}:${date1.getUTCMinutes()}:${date1.getUTCSeconds()}`;
  }, 1000);


let data = { 
    currentTime: 0,
    deposit: 0,
    totalChecks: 0,
    totalAmount: 0,
    procentage: 5,
    dollarExchangeRate: 89,
    get totalAmountMProcent () {return data.totalAmount - data.totalAmount / 100 * data.procentage},
    paid: 0,
    get readyForPayment () {return Math.round(data.totalAmount - data.totalAmountMProcent - data.paid)},
}



function formatUSD(currency) {
    const USD = new Intl.NumberFormat('en-US', {style: 'currency',currency: 'USD'});
    return USD.format(currency / data.dollarExchangeRate )
}
function formatRUB(currency) {
    const RUB = new Intl.NumberFormat('ru-RU', {style: 'currency',currency: 'RUB'});
    return RUB.format(currency)
}



async function start() {
    const commands = [

        {
    
            command: "start",
            description: "Запуск бота"
    
        },
        {
    
            command: "deposit",
            description: "Ввести депозит(только админ)"
    
        },
        {
    
            command: "paid",
            description: "Ввести выплаты"
    
        },
        {

            command: "info",
            description: "Информация о сделках"

        }, 
        {

            command: "dollarexchangerate",
            description: "Курс доллара(только админ)"

        }, 
	 {

            command: "reset",
            description: "перезапуск бота"

        }, 
        {

            command: "depositminus",
            description: "Убавить депозит"

        }, 
        {

            command: "stop",
            description: "Стоп бот"

        }, 
        {

            command: "setpercentage",
            description: "Выставить процент"

        }, 
        {

            command: "getuserid",
            description: "Получить свой id"

        }, 
        {

            command: "addadmin",
            description: "Добавить админа"

        }, 
    
    ]
    
    bot.setMyCommands(commands);
    bot.on('callback_query', async msg => {
        const data = msg.data;
        const chatId = msg.message.chat.id;
        const text = msg.text;
        userId = msg.from.id;
        console.log(msg)

    })
    
    
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
         text = msg.text;
         normalizedMessage = null;
         userId = msg.from.id;
         let admin = [722365458, 7031413034,5040590272 ];
         
         const isAdmin = admin.includes(userId);
        num = parseFloat(text)
        console.log(msg)
        try {
             normalizedMessage = text.replace(/@?\w+$/, ''); // Убираем @bot
        } catch (error) {
            console.log(error)
            console.error('Error replace')
            text = null
        }
        if(normalizedMessage === '/start') {
            stopbot = false
            bot.sendMessage(chatId, `Бот запущен`);
            
        }
        if(!stopbot) {
	    
        class DataSaver {
            constructor(data) {
                this.data = date1Time;
                this.currency = text;
            }
            appendToJson() {

                const filePath = this.getFileName('json');
                const newData = currentMaxId + '.'  +' ' + JSON.stringify(this.data, null, " ") + '|' + JSON.stringify(this.currency, null, " " ) + "\n"; 
                fs.appendFileSync(filePath, newData, 'utf8');
                console.log(`Данные добавлены в файл ${filePath}`);
                currentMaxId += 1
            }
        
            getFileName(extension) {
                return path.join(__dirname, `data.${extension}`);
            }
        }
        
        
        const dataSaver = new DataSaver(data);
       if(waitingSetProcentage) {
        data.procentage = num;
        waitingSetProcentage = false;
        try {
            await bot.deleteMessage(msgWait.chat.id, msgWait.message_id);
            await bot.sendMessage(msgWait.chat.id, `Процент составляет:  ${data.procentage}%`)
        } catch (error) {
            console.error('errorDeleteMessage')
        }
       }
       
       if(waitingDeposit) {
            data.deposit += num * data.dollarExchangeRate;
            console.log(data.deposit);
            waitingDeposit = false;
            try {
                await bot.deleteMessage(msgWait.chat.id, msgWait.message_id);
                await bot.sendMessage(msgWait.chat.id, `Депозит равен:  ${formatRUB(num * data.dollarExchangeRate)} / ${formatUSD(num * data.dollarExchangeRate)}`)
            } catch (error) {
                console.error('errorDeleteMessage')
            }
            
         }

        if(waitingPushAdmin) {
            admin.push(num)

            bot.sendMessage(chatId, 'Админ добавлен')
            waitingPushAdmin = false;
        }
        if(waitingDollarExchangeRate) {
            data.dollarExchangeRate = num;
            console.log(data.dollarExchangeRate)
            waitingDollarExchangeRate = false;
            if(msgWait != null) {
                try {
                    await bot.deleteMessage(msgWait.chat.id, msgWait.message_id);
                } catch (error) {
                    console.error('errorDeleteMessage')
                }
            }
            
            bot.sendMessage(msg.chat.id, `Курc сегодня 1$ = ${formatRUB(data.dollarExchangeRate)}`)
        }
         
        if(waitingPaid) {
            if(num <= data.readyForPayment ) {
                data.paid = num;
            waitingPaid = false;
            await bot.sendMessage(msgWait.chat.id, `Зачислена выплата: ${formatRUB(num)} / ${formatUSD(num)}`)
            }
            else {
                console.log(num)
                console.log(data.readyForPayment)
                return bot.sendMessage(chatId, 'Возможно вы ввели не ту сумму, попоробуйте еще раз')
            }
        }
       
        try {
            if(text[0] === '-' && !isNaN(parseFloat(text[1]))  ) {
                data.totalAmount -= parseFloat(text.slice(1));
                data.totalChecks -= 1
                console.log(data.totalAmount);
                console.log(text[0]);
                console.log(typeof text[1]);
                console.log(data);
                console.log(data.totalAmountMProcent);
                dataSaver.appendToJson();
                last7()
               return      bot.sendMessage(msg.chat.id, 
                `Чек лист:
${lastSevenRows.join('\n')}
        
        Депозит: ${formatRUB(data.deposit)}/${formatUSD(data.deposit)}
        Всего чеков: ${data.totalChecks}  
        Курс: ${data.dollarExchangeRate}
        Процент: ${data.procentage}%
        Общий оборот: ${formatRUB(data.totalAmount)}/${formatUSD(data.totalAmount)}
        Общий оборот(-%): ${formatRUB(data.totalAmountMProcent)}/${formatUSD(data.totalAmountMProcent)}
        Выплачено: ${formatRUB(data.paid)}/${formatUSD(data.paid)}
        Осталось к оплате: ${formatRUB(data.readyForPayment)}/${formatUSD(data.readyForPayment)}`); 
            }
        } catch (error) {
            console.error(error)
            console.error('text[0] error')
        }
        try {
            if(text[0] === '+' && !isNaN(parseFloat(text[1]))  ) {
                data.totalAmount += parseFloat(text.slice(1));
                data.totalChecks += 1
                console.log(data.totalAmount);
                console.log(text[0]);
                console.log(typeof text[1]);
                console.log(data);
                console.log(data.totalAmountMProcent);
                dataSaver.appendToJson();
                last7()
               return      bot.sendMessage(msg.chat.id, 
                `Чек лист:
${lastSevenRows.join('\n')}
        
Депозит: ${formatRUB(data.deposit)}/${formatUSD(data.deposit)}
Всего чеков: ${data.totalChecks}  
Курс: ${data.dollarExchangeRate}
Процент: ${data.procentage}%
Общий оборот: ${formatRUB(data.totalAmount)}/${formatUSD(data.totalAmount)}
Общий оборот(-%): ${formatRUB(data.totalAmountMProcent)}/${formatUSD(data.totalAmountMProcent)}
Выплачено: ${formatRUB(data.paid)}/${formatUSD(data.paid)}
Осталось к оплате: ${formatRUB(data.readyForPayment)}/${formatUSD(data.readyForPayment)}`);   }
        } catch (error) {
            console.error(error)
            console.error('text[0] error')
        }
    
        if(normalizedMessage === '/info') {
            last7()
            bot.sendMessage(msg.chat.id, 
        `Чек лист:
${lastSevenRows.join('\n')}

Депозит: ${formatRUB(data.deposit)}/${formatUSD(data.deposit)}
Всего чеков: ${data.totalChecks}  
Курс: ${data.dollarExchangeRate}
Процент: ${data.procentage}%
Общий оборот: ${formatRUB(data.totalAmount)}/${formatUSD(data.totalAmount)}
Общий оборот(-%): ${formatRUB(data.totalAmountMProcent)}/${formatUSD(data.totalAmountMProcent)}
Выплачено: ${formatRUB(data.paid)}/${formatUSD(data.paid)}
Осталось к оплате: ${formatRUB(data.readyForPayment)}/${formatUSD(data.readyForPayment)}`);  
console.log(data)
        }
        if(normalizedMessage === '/deposit'){
            if(isAdmin) {
                waitingDeposit = true;
             msgWait = await bot.sendMessage(msg.chat.id, `Введите сумму депозита:`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе')
            }
            
        }
        if(normalizedMessage === '/depositminus'){
            if(isAdmin) {
                waitingDepositMinus = true;
                msgWait = await bot.sendMessage(msg.chat.id, `Введите сумму депозита:`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе')
            }
            
            
        }
        if(normalizedMessage === '/paid') {
            waitingPaid = true;
            msgWait = await bot.sendMessage(msg.chat.id, `Введите сумму выплаты:`);
        }
        if(normalizedMessage === '/dollarexchangerate') {
              if(isAdmin) {
                waitingDollarExchangeRate = true;
                msgWait = await bot.sendMessage(msg.chat.id, `Введите курс:`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе')
            }
         
        }
        if(normalizedMessage === '/reset') {
            if(isAdmin) {
                data.deposit = 0;
                data.paid = 0;
                data.totalAmount = 0;
                data.totalChecks = 0;
                bot.sendMessage(chatId, "Бот успешно перезагружен")
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе')
            }
           
        }
        
        if(normalizedMessage === '/stop') {
            stopbot = true
            bot.sendMessage(chatId, 'бот остановлен')
        }
        if(normalizedMessage === '/setpercentage') {
            if(isAdmin) {
                waitingSetProcentage = true;
            msgWait = await bot.sendMessage(msg.chat.id, `Введите процент:`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе')
            }
            
        }
        if(normalizedMessage === '/getuserid') {
            bot.sendMessage(chatId,`Id пользователя: ${userId} ` )
        }
        if(normalizedMessage === '/addadmin') {
            if(isAdmin) {
                waitingPushAdmin = true;
                msgWait = await bot.sendMessage(msg.chat.id, `Введите id человека которому хотите дать права:`);
            } else {
                bot.sendMessage(chatId, 'Отказано в доступе')
            }
        }
      
      
        

    }
     })
     
}

start()