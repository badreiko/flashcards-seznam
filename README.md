# Flashcards Seznam

Приложение для изучения чешских слов с помощью карточек на основе любого текста с облачной синхронизацией словаря.

## Описание проекта

Flashcards Seznam позволяет автоматизировать создание карточек для изучения чешского языка:

1. **Извлечение уникальных слов** из текста
2. **Получение переводов и примеров** слов с чешского на русский через словарь Glosbe
3. **Формирование карточек** с оригиналом, переводами и примерами использования
4. **Интерактивное перелистывание карточек** для изучения
5. **Сохранение переводов в облачный словарь** для доступа с любого устройства

## Установка и запуск

### Онлайн-версия
Приложение доступно онлайн без установки: [Flashcards Seznam](https://flashcards-seznam.netlify.app/)

### Локальная установка
1. Убедитесь, что у вас установлен [Node.js](https://nodejs.org/) (версия 14.x или выше)
2. Клонируйте репозиторий:
   ```
   git clone https://github.com/your-username/flashcards-seznam.git
   cd flashcards-seznam
   ```
3. Установите зависимости:
   ```
   npm install
   ```
4. Запустите сервер:
   ```bash
   # В одном терминале запустите сервер API
   node server.js

   # В другом терминале запустите фронтенд
   npm start
   ```
   Приложение будет доступно по адресу `http://localhost:3000`, а API сервер - по `http://localhost:3001`.

5. Откройте браузер и перейдите по адресу [http://localhost:3000](http://localhost:3000)

## Использование

1. Вставьте чешский текст в поле ввода
2. Нажмите кнопку "Извлечь слова"
3. Просмотрите список извлеченных слов
4. Нажмите "Получить переводы"
5. Используйте стрелки для перемещения между карточками
6. Нажмите на карточку, чтобы увидеть её перевод и примеры
7. Просматривайте и экспортируйте словарь с помощью специального раздела

## Технологии

- React 18
- JavaScript (ES6+)
- CSS3
- Firebase Realtime Database для хранения словаря
- Glosbe для получения профессиональных переводов и примеров
- CORS-прокси для доступа к данным Glosbe

## Структура проекта

```
flashcards-seznam/
├── public/
│   ├── index.html       # Основной HTML с приложением
│   ├── favicon.svg      # Иконка сайта
│   ├── logo192.svg      # Лого для PWA
│   ├── logo512.svg      # Лого для PWA
│   └── manifest.json    # Манифест для PWA
├── src/
│   ├── App.js           # Основной компонент React
│   ├── glosbeTranslator.js # Функции для парсинга Glosbe и работы с Firebase
│   ├── firebase.js      # Конфигурация Firebase
│   └── index.js         # Точка входа приложения
├── package.json
└── README.md
```

## Особенности и возможности

- Автоматическое извлечение и анализ уникальных слов
- Получение профессиональных переводов и примеров использования из словаря Glosbe
- Интерактивные карточки с анимацией переворачивания
- Адаптивный дизайн для мобильных устройств
- Облачное хранилище словаря, доступное с любого устройства
- Возможность просмотра и экспорта всего словаря
- Совместное наполнение словаря всеми пользователями

## Преимущества новой версии

- **Облачная синхронизация** — доступ к словарю с любого устройства
- **Высококачественные переводы** — использование профессионального словаря Glosbe
- **Примеры использования** — карточки включают примеры предложений для лучшего понимания контекста
- **Коллективное наполнение** — все пользователи вносят вклад в общий словарь
- **Экспорт словаря** — возможность скачать весь словарь в формате JSON

## Планы развития

- Поддержка других языковых пар
- Интеграция с популярными системами изучения языков
- Добавление аудиопроизношения слов
- Интеллектуальное повторение на основе алгоритма интервального повторения
- Мобильное приложение с режимом офлайн-работы
- Система статистики и отслеживания прогресса обучения