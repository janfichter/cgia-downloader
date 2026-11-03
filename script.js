// ==UserScript==
// @name         CGIA Moscow Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Скачивание всех страниц дела с cgamos.ru в высоком разрешении
// @match        *://*.cgamos.ru/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    let collectedUrls = new Set();
    let isPaused = false;
    let isStopped = false;
    let pauseResolve = null;

    // 1. Получить папку из URL
    function getFolder(imgPath) {
        const cleanPath = imgPath.replace(/\/resize\//gi, '/');
        const lastSlash = cleanPath.lastIndexOf('/');
        return lastSlash !== -1 ? cleanPath.substring(0, lastSlash + 1) : '';
    }

    // 2. Проверка: является ли URL страницей документа
    function isValidDocumentUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (!url.toLowerCase().includes('get_img.php')) return false;
        
        try {
            const urlObj = new URL(url, window.location.origin);
            const imgPath = urlObj.searchParams.get('img_path');
            if (!imgPath) return false;
            
            return /\/\d+\.jpe?g$/i.test(imgPath);
        } catch (e) {
            return false;
        }
    }

    // 3. УМНЫЙ СКАН: Группируем по папкам и находим ГЛАВНУЮ папку
    function smartScan() {
        const folderMap = new Map();
        
        document.querySelectorAll('img').forEach(img => {
            const urlsToCheck = [
                img.src,
                img.getAttribute('data-src'),
                img.getAttribute('data-original')
            ];
            
            urlsToCheck.forEach(url => {
                if (!isValidDocumentUrl(url)) return;
                
                try {
                    const urlObj = new URL(url, window.location.origin);
                    const imgPath = urlObj.searchParams.get('img_path');
                    const cleanPath = imgPath.replace(/\/resize\//gi, '/');
                    const folder = getFolder(imgPath);
                    
                    const finalUrl = `${urlObj.origin}${urlObj.pathname}?img_path=${encodeURIComponent(cleanPath)}`;
                    
                    if (!folderMap.has(folder)) {
                        folderMap.set(folder, new Set());
                    }
                    folderMap.get(folder).add(finalUrl);
                } catch (e) {}
            });
        });
        
        let maxCount = 0;
        let mainFolderUrls = new Set();
        
        for (const [folder, urls] of folderMap.entries()) {
            if (urls.size > maxCount) {
                maxCount = urls.size;
                mainFolderUrls = urls;
            }
        }
        
        collectedUrls = new Set(mainFolderUrls);
        updateUI();
    }

    let scanTimeout;
    const observer = new MutationObserver(() => {
        clearTimeout(scanTimeout);
        scanTimeout = setTimeout(smartScan, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 4. Панель управления
    function createPanel() {
        if (document.getElementById('cgia-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'cgia-panel';
        panel.style.cssText = `
            position: fixed !important; bottom: 20px !important; right: 20px !important;
            z-index: 2147483647 !important; background: #ffffff !important;
            border: 3px solid #28a745 !important; border-radius: 12px !important;
            padding: 20px !important; box-shadow: 0 8px 25px rgba(0,0,0,0.3) !important;
            font-family: Arial, sans-serif !important; font-size: 14px !important;
            color: #333 !important; min-width: 320px !important;
        `;
        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px; color: #28a745; font-size: 16px; display: flex; justify-content: space-between; align-items: center;">
                🏛️ CGIA Downloader
                <span id="cgia-count" style="background: #28a745; color: white; padding: 4px 12px; border-radius: 15px; font-size: 13px;">0 стр.</span>
            </div>
            <div style="font-size: 13px; color: #333; margin-bottom: 15px; line-height: 1.4; background: #d4edda; padding: 10px; border-radius: 6px; border: 1px solid #c3e6cb;">
                ✅ Автоматически скачивает все файлы выбранного дела
            </div>
            <button id="cgia-btn-scan" style="width: 100%; margin-bottom: 10px; padding: 12px; background: #ffc107; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">
                🔄 Обновить список
            </button>
            <button id="cgia-btn-download" style="width: 100%; margin-bottom: 10px; padding: 12px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">
                📥 Скачать страницы
            </button>
            <div id="cgia-control-buttons" style="display: none; gap: 10px; margin-bottom: 10px;">
                <button id="cgia-btn-pause" style="flex: 1; padding: 10px; background: #ff9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">
                    ⏸ Пауза
                </button>
                <button id="cgia-btn-stop" style="flex: 1; padding: 10px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">
                    ⏹ Стоп
                </button>
            </div>
            <button id="cgia-btn-clear" style="width: 100%; padding: 8px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                🗑 Очистить
            </button>
        `;
        document.body.appendChild(panel);

        document.getElementById('cgia-btn-scan').onclick = () => {
            smartScan();
            alert(`✅ Найдено страниц в деле: ${collectedUrls.size}`);
        };
        
        document.getElementById('cgia-btn-download').onclick = downloadSequentially;
        
        document.getElementById('cgia-btn-pause').onclick = togglePause;
        
        document.getElementById('cgia-btn-stop').onclick = stopDownload;
        
        document.getElementById('cgia-btn-clear').onclick = () => {
            collectedUrls.clear();
            updateUI();
            alert('✅ Список очищен!');
        };
    }

    function updateUI() {
        const countEl = document.getElementById('cgia-count');
        if (countEl) countEl.innerText = `${collectedUrls.size} стр.`;
    }

    // 5. Управление паузой
    function togglePause() {
        isPaused = !isPaused;
        const btnPause = document.getElementById('cgia-btn-pause');
        
        if (isPaused) {
            btnPause.innerText = '▶ Продолжить';
            btnPause.style.background = '#4caf50';
            console.log('⏸ Скачивание на паузе');
        } else {
            btnPause.innerText = '⏸ Пауза';
            btnPause.style.background = '#ff9800';
            if (pauseResolve) {
                pauseResolve();
                pauseResolve = null;
            }
            console.log('▶ Скачивание возобновлено');
        }
    }

    // 6. Остановка скачивания
    function stopDownload() {
        isStopped = true;
        isPaused = false;
        if (pauseResolve) {
            pauseResolve();
            pauseResolve = null;
        }
        console.log('⏹ Скачивание остановлено пользователем');
    }

    // 7. Скачивание с управлением
    async function downloadSequentially() {
        let urls = Array.from(collectedUrls);
        if (urls.length === 0) {
            alert('⚠️ Ничего не найдено. Нажмите "Обновить список".');
            return;
        }
        
        urls.sort((a, b) => {
            const nameA = a.split('/').pop().split('?')[0];
            const nameB = b.split('/').pop().split('?')[0];
            return nameA.localeCompare(nameB, undefined, { numeric: true });
        });

        if (!confirm(`Начать скачивание ${urls.length} страниц с задержкой 2 сек?`)) return;

        // Сброс флагов
        isPaused = false;
        isStopped = false;
        pauseResolve = null;

        const btnDownload = document.getElementById('cgia-btn-download');
        const btnPause = document.getElementById('cgia-btn-pause');
        const btnStop = document.getElementById('cgia-btn-stop');
        const controlButtons = document.getElementById('cgia-control-buttons');

        btnDownload.disabled = true;
        btnDownload.style.opacity = '0.6';
        
        // Показываем кнопки управления
        controlButtons.style.display = 'flex';
        btnPause.innerText = '⏸ Пауза';
        btnPause.style.background = '#ff9800';

        for (let i = 0; i < urls.length; i++) {
            // Проверка на остановку
            if (isStopped) {
                console.log(`⏹ Остановлено на ${i + 1} из ${urls.length}`);
                break;
            }

            // Проверка на паузу
            if (isPaused) {
                console.log(`⏸ Пауза на ${i + 1} из ${urls.length}`);
                await new Promise(resolve => {
                    pauseResolve = resolve;
                });
            }

            // Повторная проверка после паузы
            if (isStopped) {
                console.log(`⏹ Остановлено на ${i + 1} из ${urls.length}`);
                break;
            }

            btnDownload.innerText = `⏳ Скачивание ${i+1} из ${urls.length}...`;
            
            try {
                const res = await fetch(urls[i], { method: 'GET', credentials: 'include' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                
                let fileName = `page_${String(i+1).padStart(4, '0')}.jpg`;
                
                try {
                    const urlObj = new URL(urls[i]);
                    const imgPath = urlObj.searchParams.get('img_path');
                    if (imgPath) {
                        const parts = imgPath.split('/');
                        fileName = decodeURIComponent(parts[parts.length - 1]);
                    }
                } catch (e) {
                    console.error("Ошибка парсинга имени файла", e);
                }
                
                a.download = fileName;
                document.body.appendChild(a); 
                a.click(); 
                document.body.removeChild(a);
                
                // Задержка с проверкой паузы
                await new Promise(resolve => {
                    const timeout = setTimeout(resolve, 2000);
                    if (isPaused) {
                        clearTimeout(timeout);
                        pauseResolve = resolve;
                    }
                });
                
            } catch(e) { 
                console.error(`Ошибка скачивания:`, e); 
            }
        }
        
        // Завершение или остановка
        if (isStopped) {
            btnDownload.innerText = '⏹ Остановлено';
        } else {
            btnDownload.innerText = '✅ Завершено!';
        }
        
        btnDownload.style.background = '#28a745';
        btnDownload.disabled = false;
        
        // Скрываем кнопки управления
        controlButtons.style.display = 'none';
        
        setTimeout(() => { 
            btnDownload.innerText = '📥 Скачать страницы'; 
            btnDownload.style.background = '#007bff'; 
        }, 4000);
    }

    // Инициализация
    createPanel();
    smartScan();
    console.log('✅ [CGIA Downloader] Загружен.');
})();
