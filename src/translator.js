import axios from 'axios';

const API_KEY = 'YOUR_API_KEY'; // Замените на ваш API ключ от Seznam
const API_URL = 'https://api.seznam.cz/translate/v1';

export const languages = {
    cs: 'чешский',
    ru: 'русский',
    en: 'английский'
};

export class Translator {
    constructor() {
        this.apiKey = API_KEY;
    }

    async translate(text, sourceLang, targetLang) {
        try {
            const response = await axios.post(`${API_URL}/translate`, {
                text,
                source: sourceLang,
                target: targetLang
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.translations[0].translatedText;
        } catch (error) {
            console.error('Ошибка перевода:', error);
            throw new Error('Не удалось выполнить перевод');
        }
    }

    async detectLanguage(text) {
        try {
            const response = await axios.post(`${API_URL}/detect`, {
                text
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.language;
        } catch (error) {
            console.error('Ошибка определения языка:', error);
            throw new Error('Не удалось определить язык');
        }
    }

    async getSupportedLanguages() {
        try {
            const response = await axios.get(`${API_URL}/languages`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.languages;
        } catch (error) {
            console.error('Ошибка получения списка языков:', error);
            throw new Error('Не удалось получить список поддерживаемых языков');
        }
    }
}

// Экспортируем класс Translator
export default Translator;
