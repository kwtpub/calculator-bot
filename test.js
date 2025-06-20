const fs = require('fs');
const path = require('path');

class DataReader {
    constructor(fileName) {
        this.filePath = path.join(__dirname, fileName);
    }

    // Метод для чтения данных из JSON файла
    readJson() {
        try {
            const data = fs.readFileSync(this.filePath, 'utf8'); // Читаем данные из файла
            return JSON.parse(data); // Преобразуем строку JSON в объект
        } catch (error) {
            console.error(`Ошибка при чтении файла: ${error.message}`);
            return null; // Возвращаем null в случае ошибки
        }
    }
}

// Пример использования
const dataReader = new DataReader('data.json'); // Укажите имя вашего файла
const jsonData = dataReader.readJson(); // Читаем данные

if (jsonData) {
    console.log('Данные из файла:', jsonData); // Выводим данные в консоль
}