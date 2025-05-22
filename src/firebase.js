// firebase.js - Исправленная настройка Firebase

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";

// Исправленная конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAPZIHxaLt92McIvbIcYE-tSYp2Li2jxs4",
  authDomain: "flashcards-seznam-6652a.firebaseapp.com",
  projectId: "flashcards-seznam-6652a",
  storageBucket: "flashcards-seznam-6652a.firebasestorage.app",
  messagingSenderId: "99460986155",
  appId: "1:99460986155:web:e5ca466e3d07c20cde016e",
  measurementId: "G-ZFM0YW70ZD",
  // ИСПРАВЛЕНО: добавлен слэш в конце URL
  databaseURL: "https://flashcards-seznam-6652a-default-rtdb.europe-west1.firebasedatabase.app/"
};

let app, analytics, database;

try {
  // Инициализируем Firebase
  app = initializeApp(firebaseConfig);
  
  // Инициализируем аналитику только в продакшене
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    analytics = getAnalytics(app);
  }
  
  // Инициализируем Realtime Database
  database = getDatabase(app);
  
  // В разработке подключаемся к эмулятору (опционально)
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    try {
      connectDatabaseEmulator(database, 'localhost', 9000);
      console.log('Подключен к эмулятору Firebase Database');
    } catch (emulatorError) {
      console.warn('Не удалось подключиться к эмулятору, используем продакшен базу:', emulatorError);
    }
  }
  
  console.log('Firebase успешно инициализирован');
  
} catch (error) {
  console.error('Ошибка инициализации Firebase:', error);
  
  // Создаем заглушки для работы в offline режиме
  app = null;
  analytics = null;
  database = null;
}

// Функция для проверки доступности Firebase
export const checkFirebaseConnection = async () => {
  if (!database) return false;
  
  try {
    const { ref, get } = await import("firebase/database");
    const connectedRef = ref(database, '.info/connected');
    const snapshot = await get(connectedRef);
    return snapshot.exists() && snapshot.val() === true;
  } catch (error) {
    console.error('Ошибка при проверке соединения Firebase:', error);
    return false;
  }
};

// Экспортируем сущности Firebase
export { app, analytics, database };
export { firebaseConfig };