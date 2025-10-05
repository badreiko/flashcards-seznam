# 🚀 Настройка Netlify для DeepL API

## Проблема CORS решена!

DeepL API блокирует прямые запросы из браузера. Решение: **Netlify Functions** (serverless прокси).

---

## ✅ Что уже сделано в коде:

1. **Создана Netlify Function**: `netlify/functions/translate-deepl.js`
2. **Обновлен DataService.js**: использует `/.netlify/functions/translate-deepl`
3. **Обновлен netlify.toml**: добавлена конфигурация functions

---

## 📋 Что нужно сделать ТЕБЕ (один раз):

### Шаг 1: Добавить переменную окружения в Netlify

1. Зайди на https://app.netlify.com
2. Выбери свой сайт **flashcards-seznam**
3. Перейди в **Site configuration** → **Environment variables**
4. Нажми **Add a variable**
5. Добавь:
   ```
   Key: DEEPL_API_KEY
   Value: f65f9da4-018b-4ab4-adc8-d8f3de9cfb9f:fx
   ```
6. **Scopes**: выбери **All scopes** (Production, Deploy previews, Branch deploys)
7. Нажми **Create variable**

### Шаг 2: Всё!

После того как ты добавишь переменную и запушишь код, Netlify автоматически:
- Задеплоит обновленный код
- Создаст Netlify Function `translate-deepl`
- DeepL API будет работать через прокси (без CORS ошибок)

---

## 🔧 Как это работает:

### Старая схема (НЕ работала):
```
Browser → DeepL API ❌ CORS Error
```

### Новая схема (работает):
```
Browser → Netlify Function → DeepL API ✅
          (твой домен)       (прокси)
```

### Детально:

1. **Фронтенд** вызывает: `fetch('/.netlify/functions/translate-deepl')`
2. **Netlify Function** получает запрос
3. **Function** вызывает DeepL API с твоим API ключом (из env)
4. **DeepL** возвращает перевод
5. **Function** возвращает результат фронтенду (с CORS заголовками)

---

## 🧪 Проверка после деплоя:

1. Перейди на https://flashcards-seznam.netlify.app
2. Открой DevTools (F12) → Console
3. Введи чешский текст: `"Ahoj, jak se máš?"`
4. Нажми "Получить переводы"
5. **Ожидается**:
   ```
   [DeepL] Translating: "ahoj"
   [DeepL] ✅ Success: "привет"
   ```
   **БЕЗ CORS ошибок!**

---

## ❓ Что если не работает?

### Проверь переменную окружения:
1. Netlify Dashboard → Site → Environment variables
2. Убедись что `DEEPL_API_KEY` добавлен
3. Проверь что значение правильное: `f65f9da4-018b-4ab4-adc8-d8f3de9cfb9f:fx`

### Проверь деплой:
1. Netlify Dashboard → Deploys
2. Последний деплой должен быть **Published**
3. В логах должно быть: `✔ Functions bundled in XXX ms`

### Проверь Function в браузере:
```javascript
// Открой консоль на flashcards-seznam.netlify.app и выполни:
fetch('/.netlify/functions/translate-deepl', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'ahoj', source_lang: 'CS', target_lang: 'RU' })
})
.then(r => r.json())
.then(d => console.log(d))
```

Должен вернуться перевод без ошибок.

---

## 💰 Стоимость

**Netlify Functions**:
- ✅ **Бесплатно**: 125,000 запросов/месяц
- ✅ **Твоя нагрузка**: ~600 запросов/месяц (20 переводов/день)
- ✅ **Вывод**: Полностью бесплатно!

**DeepL API Free**:
- ✅ **Бесплатно**: 500,000 символов/месяц
- ✅ **Твоя нагрузка**: ~60,000 символов/месяц
- ✅ **Вывод**: Полностью бесплатно!

**Итого**: $0/месяц 🎉

---

## 📊 Архитектура

```
┌─────────────────────────────────────────────┐
│           Пользователь вводит текст          │
└──────────────────┬──────────────────────────┘
                   ▼
         ┌─────────────────────┐
         │   React Frontend    │
         │   (Netlify CDN)     │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │   DataService.js    │
         │   Проверка кэша:    │
         │   1. Cache          │
         │   2. LocalStorage   │
         │   3. Firebase       │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │ /.netlify/functions/│
         │   translate-deepl   │
         │  (Serverless Proxy) │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │    DeepL API        │
         │  api-free.deepl.com │
         └──────────┬──────────┘
                    ▼
              Перевод готов!
                    ▼
         Сохранение в Firebase
```

---

## 🎉 Готово!

После добавления переменной окружения в Netlify и деплоя кода - всё должно работать!

**CORS ошибок больше не будет!** ✨
