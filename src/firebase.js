// firebase.js - Настройка и инициализация Firebase для проекта Flashcards Seznam

// Импортируем необходимые функции из Firebase SDK
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";

// Конфигурация Firebase
// Для Firebase JS SDK v7.20.0 и новее, measurementId опционален
const firebaseConfig = {
  apiKey: "AIzaSyAPZIHxaLt92McIvbIcYE-tSYp2Li2jxs4",
  authDomain: "flashcards-seznam-6652a.firebaseapp.com",
  projectId: "flashcards-seznam-6652a",
  storageBucket: "flashcards-seznam-6652a.firebasestorage.app",
  messagingSenderId: "99460986155",
  appId: "1:99460986155:web:e5ca466e3d07c20cde016e",
  measurementId: "G-ZFM0YW70ZD",
  // Добавляем URL для Realtime Database (важно для работы со словарем)
  databaseURL: "https://flashcards-seznam-6652a-default-rtdb.europe-west1.firebasedatabase.app"
};

// Инициализируем Firebase
const app = initializeApp(firebaseConfig);

// Инициализируем аналитику для отслеживания использования
const analytics = getAnalytics(app);

// Инициализируем Realtime Database для хранения словаря
const database = getDatabase(app);

// Экспортируем сущности Firebase для использования в других файлах
export { app, analytics, database };

// Экспортируем конфигурацию для доступа в других файлах
export { firebaseConfig };