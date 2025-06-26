const fs = require('fs');
const path = require('path');

function formatUSD(currency, rate) {
    if (rate === 0) return '$0.00';
    const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    return USD.format(currency / rate);
}

function formatRUB(currency) {
    const RUB = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
    return RUB.format(currency);
}

function logTransaction(message, logFilePath) {
    const timestamp = new Date().toLocaleString('ru-RU');
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(logFilePath, logMessage, 'utf8');
    } catch (error) {
        console.error('Ошибка при записи в лог:', error);
    }
}

function saveState(state, stateFilePath) {
    try {
        fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('Ошибка при сохранении состояния:', error);
    }
}

function loadState(state, stateFilePath) {
    try {
        if (fs.existsSync(stateFilePath)) {
            const fileContent = fs.readFileSync(stateFilePath, 'utf8');
            let loadedState = JSON.parse(fileContent);
            // Миграция и слияние логики можно доработать при переносе core
            return { ...state, ...loadedState };
        }
    } catch (error) {
        console.error('Ошибка при загрузке состояния:', error);
    }
    return state;
}

module.exports = {
    formatUSD,
    formatRUB,
    logTransaction,
    saveState,
    loadState,
}; 