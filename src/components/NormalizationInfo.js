/**
 * NormalizationInfo.js
 * Компонент для отображения информации о процессе нормализации чешских слов
 */

import React, { useState } from 'react';

/**
 * Компонент для отображения информации о нормализации слова
 * @param {Object} props - Свойства компонента
 * @returns {JSX.Element} - Рендер компонента
 */
const NormalizationInfo = ({
  originalWord,
  normalizedWord,
  normalizationInfo,
  usedNormalization,
  source,
  className
}) => {
  const [expanded, setExpanded] = useState(false);
  
  // Если нет информации о нормализации или нормализация не использовалась, не показываем компонент
  if (!usedNormalization || !normalizedWord || !originalWord) {
    return null;
  }
  
  // Определяем цвет индикатора источника
  const getSourceColor = () => {
    switch (source) {
      case 'cache':
        return 'var(--success)';
      case 'localStorage':
        return 'var(--success)';
      case 'firebase':
        return 'var(--primary)';
      case 'server':
        return 'var(--warning)';
      case 'fallback':
        return 'var(--error)';
      default:
        return 'var(--text-secondary)';
    }
  };
  
  // Определяем текст источника
  const getSourceText = () => {
    switch (source) {
      case 'cache':
        return 'Кэш';
      case 'localStorage':
        return 'Локальное хранилище';
      case 'firebase':
        return 'Firebase';
      case 'server':
        return 'Сервер';
      case 'fallback':
        return 'Базовый словарь';
      default:
        return 'Неизвестный';
    }
  };
  
  // Определяем текст для части речи
  const getPartOfSpeechText = (partOfSpeech) => {
    switch (partOfSpeech) {
      case 'verb':
        return 'Глагол';
      case 'noun':
        return 'Существительное';
      case 'adjective':
        return 'Прилагательное';
      case 'pronoun':
        return 'Местоимение';
      case 'adverb':
        return 'Наречие';
      case 'preposition':
        return 'Предлог';
      case 'conjunction':
        return 'Союз';
      case 'numeral':
        return 'Числительное';
      case 'unknown':
        return 'Неопределено';
      default:
        return partOfSpeech || 'Неопределено';
    }
  };
  
  return (
    <div className={`normalization-info ${className || ''}`}>
      <div className="normalization-summary" onClick={() => setExpanded(!expanded)}>
        <div className="normalization-badge">
          <span>Нормализация</span>
        </div>
        
        <div className="normalization-main-info">
          <span className="original-word">{originalWord}</span>
          <span className="arrow">→</span>
          <span className="normalized-word">{normalizedWord}</span>
        </div>
        
        <div className="source-badge" style={{ backgroundColor: getSourceColor() }}>
          <span>{getSourceText()}</span>
        </div>
        
        <button className="expand-button" aria-label="Развернуть информацию">
          {expanded ? '↑' : '↓'}
        </button>
      </div>
      
      {expanded && normalizationInfo && (
        <div className="normalization-details">
          {normalizationInfo.partOfSpeech && (
            <div className="detail-item">
              <span className="detail-label">Часть речи:</span>
              <span className="detail-value">{getPartOfSpeechText(normalizationInfo.partOfSpeech)}</span>
            </div>
          )}
          
          {normalizationInfo.normalizedForms && normalizationInfo.normalizedForms.length > 0 && (
            <div className="detail-item">
              <span className="detail-label">Варианты нормализации:</span>
              <div className="forms-list">
                {normalizationInfo.normalizedForms.map((form, index) => (
                  <span 
                    key={index} 
                    className={`form-item ${form === normalizedWord ? 'selected' : ''}`}
                  >
                    {form}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {normalizationInfo.log && normalizationInfo.log.length > 0 && (
            <div className="detail-item">
              <span className="detail-label">Лог нормализации:</span>
              <div className="log-list">
                {normalizationInfo.log.slice(0, 5).map((logItem, index) => (
                  <div key={index} className="log-item">
                    {logItem.message}
                  </div>
                ))}
                {normalizationInfo.log.length > 5 && (
                  <div className="log-more">
                    ... и ещё {normalizationInfo.log.length - 5} записей
                  </div>
                )}
              </div>
            </div>
          )}
          
          {normalizationInfo.processingTime && (
            <div className="detail-item">
              <span className="detail-label">Время обработки:</span>
              <span className="detail-value">{normalizationInfo.processingTime.toFixed(2)} мс</span>
            </div>
          )}
        </div>
      )}
      
      <style jsx>{`
        .normalization-info {
          margin: 16px 0;
          border: 1px solid var(--border);
          border-radius: var(--border-radius-sm);
          overflow: hidden;
          background-color: var(--surface);
          box-shadow: var(--shadow-sm);
        }
        
        .normalization-summary {
          display: flex;
          align-items: center;
          padding: 10px 16px;
          cursor: pointer;
          gap: 12px;
          background-color: var(--background);
        }
        
        .normalization-badge {
          background-color: var(--primary);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        
        .normalization-main-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        
        .original-word {
          font-weight: 500;
          color: var(--text-secondary);
        }
        
        .arrow {
          color: var(--text-muted);
        }
        
        .normalized-word {
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .source-badge {
          padding: 4px 8px;
          border-radius: 4px;
          color: white;
          font-size: 0.75rem;
          font-weight: 500;
        }
        
        .expand-button {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 1rem;
          padding: 4px;
        }
        
        .normalization-details {
          padding: 16px;
          border-top: 1px solid var(--border);
          font-size: 0.875rem;
        }
        
        .detail-item {
          margin-bottom: 12px;
        }
        
        .detail-item:last-child {
          margin-bottom: 0;
        }
        
        .detail-label {
          display: block;
          font-weight: 500;
          margin-bottom: 4px;
          color: var(--text-secondary);
        }
        
        .detail-value {
          color: var(--text-primary);
        }
        
        .forms-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }
        
        .form-item {
          padding: 4px 8px;
          background-color: var(--background);
          border-radius: 4px;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        
        .form-item.selected {
          background-color: var(--primary);
          color: white;
          font-weight: 500;
        }
        
        .log-list {
          margin-top: 6px;
          padding: 8px;
          background-color: var(--background);
          border-radius: 4px;
          font-size: 0.75rem;
          color: var(--text-secondary);
          max-height: 150px;
          overflow-y: auto;
        }
        
        .log-item {
          margin-bottom: 4px;
          padding-bottom: 4px;
          border-bottom: 1px dashed var(--border);
        }
        
        .log-item:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }
        
        .log-more {
          text-align: center;
          font-style: italic;
          margin-top: 4px;
          color: var(--text-muted);
        }
        
        @media (max-width: 768px) {
          .normalization-summary {
            flex-wrap: wrap;
          }
          
          .normalization-main-info {
            order: -1;
            width: 100%;
            margin-bottom: 8px;
          }
        }
      `}</style>
    </div>
  );
};

export default NormalizationInfo;
