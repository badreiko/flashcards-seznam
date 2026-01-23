"""
Migrator (SQLite -> Firebase JSON)
Скрипт для экспорта "Золотой Базы" в формат, готовый для импорта в Firebase Realtime Database.

ПОДДЕРЖИВАЕТ:
1. Фильтрацию мусора (только обработанные слова).
2. Инкрементальный экспорт (только новые/измененные слова).
"""

import sqlite3
import json
import os
import sys
from datetime import datetime
from collections import defaultdict

# ================= НАСТРОЙКИ =================
DB_FILE = "czech_russian_dictionary.db"
OUTPUT_FILE = "firebase_update.json"

# Минимальный рейтинг перевода (1 = брать всё, 3 = только качественные)
MIN_TRANSLATION_SCORE = 1 

# ДАТА ПОСЛЕДНЕГО ЭКСПОРТА (YYYY-MM-DD)
# Оставьте None, чтобы выгрузить ВСЮ базу (перезапись).
# Укажите дату (например, "2024-01-22"), чтобы выгрузить только то, 
# что изменилось ПОСЛЕ этой даты (режим обновления/дополнения).
EXPORT_SINCE = None 
# Пример: EXPORT_SINCE = "2026-01-22"
# =============================================

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

class Migrator:
    def __init__(self, db_path):
        if not os.path.exists(db_path):
            print(f"❌ Ошибка: Файл базы данных не найден: {db_path}")
            sys.exit(1)
            
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = dict_factory
        self.cursor = self.conn.cursor()
        print(f"🔌 Подключено к {db_path}")

    def fetch_translations_map(self):
        """Загружает переводы"""
        print("📥 Загрузка переводов...")
        query = """
            SELECT t.czech_id, r.word, t.confidence_score
            FROM translations t
            JOIN russian_words r ON t.russian_id = r.id
            WHERE t.confidence_score >= ?
            ORDER BY t.confidence_score DESC
        """
        self.cursor.execute(query, (MIN_TRANSLATION_SCORE,))
        
        trans_map = defaultdict(list)
        for row in self.cursor.fetchall():
            trans_map[row['czech_id']].append(row['word'])
        return trans_map

    def fetch_forms_map(self):
        """Загружает словоформы"""
        print("📥 Загрузка словоформ...")
        try:
            query = "SELECT base_form, inflected_form FROM word_forms"
            self.cursor.execute(query)
            
            forms_map = defaultdict(set)
            for row in self.cursor.fetchall():
                base = row['base_form'].lower().strip() if row['base_form'] else ""
                if base:
                    forms_map[base].add(row['inflected_form'])
            return forms_map
        except sqlite3.OperationalError:
            print("⚠️ Таблица word_forms не найдена или пуста.")
            return {}

    def run(self):
        start_time = datetime.now()
        
        # 1. Загрузка вспомогательных данных
        translations = self.fetch_translations_map()
        forms_map = self.fetch_forms_map()
        
        print("🚀 Начало сборки данных для экспорта...")
        
        # 2. Формирование запроса с учетом фильтров
        # Убрали 'WHERE is_processed = 1', чтобы выгружать ВСЕ слова с переводами
        query = """
            SELECT id, word, word_normalized, gender, part_of_speech, stress, is_phrase, updated_at
            FROM czech_words
            WHERE 1=1
        """
        params = []

        # Фильтр по дате (Инкрементальный режим)
        if EXPORT_SINCE:
            print(f"📅 РЕЖИМ ОБНОВЛЕНИЯ: Выгружаем слова, измененные после {EXPORT_SINCE}")
            query += " AND updated_at >= ?"
            params.append(EXPORT_SINCE)
        else:
            print("📦 ПОЛНЫЙ РЕЖИМ: Выгружаем всю базу (независимо от обработки DeepSeek)")

        self.cursor.execute(query, params)
        all_words = self.cursor.fetchall()
        
        if not all_words:
            print("⚠️ Нет слов для экспорта, соответствующих критериям.")
            return

        total = len(all_words)
        print(f"📊 Найдено кандидатов: {total}")
        
        export_data = {}
        forms_index = {}  # НОВЫЙ ИНДЕКС для быстрого поиска
        processed_count = 0
        skipped_count = 0

        for row in all_words:
            word_id = row['id']
            original_word = row['word']
            
            # Генерация ключа Firebase
            # Используем хеш или нормализованное слово как ключ
            if not row['word_normalized']:
                continue
                
            firebase_key = row['word_normalized'].lower().strip()
            # Очистка ключа от запрещенных символов Firebase
            for char in ['.', '#', '$', '[', ']', '/']:
                firebase_key = firebase_key.replace(char, '')
            
            if not firebase_key:
                continue

            # Проверка наличия переводов (Пустые слова нам не нужны)
            word_translations = translations.get(word_id, [])
            if not word_translations:
                skipped_count += 1
                continue

            # Сбор форм
            word_forms = list(forms_map.get(firebase_key, []))
            if original_word not in word_forms:
                word_forms.insert(0, original_word)

            # ДОБАВЛЯЕМ В ИНДЕКС: каждая форма → базовое слово
            for form in word_forms:
                form_normalized = form.lower().strip()
                # Очистка от запрещенных символов
                for char in ['.', '#', '$', '[', ']', '/']:
                    form_normalized = form_normalized.replace(char, '')
                if form_normalized and form_normalized != firebase_key:
                    forms_index[form_normalized] = firebase_key

            # Структура JSON объекта
            word_obj = {
                "word": original_word,
                "word_normalized": row['word_normalized'],
                "translations": word_translations[:10],
                "gender": row['gender'] or "",
                "grammar": row['part_of_speech'] or "",
                "stress": row['stress'] or "",
                "forms": word_forms[:20],
                "is_phrase": bool(row['is_phrase']),
                "source": "golden_db",
                "last_updated": row['updated_at'] or datetime.now().isoformat(),
                "examples": [] 
            }
            
            export_data[firebase_key] = word_obj
            processed_count += 1
            
            if processed_count % 5000 == 0:
                print(f"   ... обработано {processed_count}/{total}")

        # 3. Сохранение
        print(f"💾 Запись в файл {OUTPUT_FILE}...")
        print(f"   📊 Индекс словоформ: {len(forms_index)} записей")

        try:
            # Создаём структуру с индексом
            final_structure = {
                "dictionary": export_data,
                "forms_index": forms_index
            }

            with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                json.dump(final_structure, f, ensure_ascii=False) # minified

            file_size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)

            print(f"\n✅ ГОТОВО!")
            print(f"   📂 Файл: {OUTPUT_FILE}")
            print(f"   📦 Слов в словаре: {processed_count}")
            print(f"   🔍 Форм в индексе: {len(forms_index)}")
            print(f"   ⚖️ Размер: {file_size_mb:.2f} MB")

            print("\n📋 ИНСТРУКЦИЯ ПО ЗАГРУЗКЕ В FIREBASE:")
            if EXPORT_SINCE:
                print("   Т.к. это ЧАСТИЧНОЕ обновление, используйте команду UPDATE:")
                print(f"   👉 firebase database:update / {OUTPUT_FILE}")
            else:
                print("   Т.к. это ПОЛНАЯ база, используйте Import JSON в Firebase Console")
                print(f"   или команду: firebase database:set / {OUTPUT_FILE}")
                print("\n   ⚠️ ВНИМАНИЕ: Это ПЕРЕЗАПИШЕТ всю базу!")
                
        except Exception as e:
            print(f"❌ Ошибка записи: {e}")

    def __del__(self):
        if hasattr(self, 'conn'):
            self.conn.close()

if __name__ == "__main__":
    migrator = Migrator(DB_FILE)
    migrator.run()