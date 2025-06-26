const path = require('path');
const helpers = require('../util/helpers');

const stateFilePath = path.join(__dirname, '../../bot_state.json');
const logFilePath = path.join(__dirname, '../../log.txt');

// state теперь объект: ключ — chatId, значение — состояние чата
let state = {};

function getDefaultState() {
    return {
        procentage: 5,
        buyRate: 89,
        sellRate: 90,
        admins: [934931129, 722365458, 7031413034, 5040590272, 1653318632],
    };
}

function getChatState(chatId) {
    if (!state[chatId]) {
        state[chatId] = getDefaultState();
    }
    return state[chatId];
}

function setChatState(chatId, newState) {
    state[chatId] = { ...getChatState(chatId), ...newState };
}

function saveState() {
    helpers.saveState(state, stateFilePath);
}

function loadState() {
    state = helpers.loadState(state, stateFilePath);
}

module.exports = {
    getChatState,
    setChatState,
    saveState,
    loadState,
    stateFilePath,
    logFilePath,
}; 