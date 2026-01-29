/**
 * 同期モジュール - 学習管理ポモドーロ
 * ローカル⇔クラウド同期、オフラインキュー
 */

class SyncManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.offlineQueue = [];
        this.syncInProgress = false;
        this.dbName = 'pomodoro-offline-db';
        this.db = null;
    }

    /**
     * 初期化
     */
    async init() {
        // IndexedDB初期化
        await this.initIndexedDB();

        // オンライン状態監視
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // ServiceWorkerからの同期リクエスト
        navigator.serviceWorker?.addEventListener('message', (event) => {
            if (event.data.type === 'SYNC_REQUIRED') {
                this.syncToCloud();
            }
        });

        console.log('[Sync] 初期化完了, オンライン:', this.isOnline);
    }

    /**
     * IndexedDB初期化
     */
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // オフラインキュー
                if (!db.objectStoreNames.contains('queue')) {
                    db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
                }

                // ローカルセッションバックアップ
                if (!db.objectStoreNames.contains('sessions')) {
                    const store = db.createObjectStore('sessions', { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                }
            };
        });
    }

    /**
     * オンライン復帰時
     */
    async handleOnline() {
        console.log('[Sync] オンライン復帰');
        this.isOnline = true;
        this.updateOnlineStatus(true);

        // オフラインキューを同期
        await this.syncToCloud();
    }

    /**
     * オフラインになった時
     */
    handleOffline() {
        console.log('[Sync] オフラインになりました');
        this.isOnline = false;
        this.updateOnlineStatus(false);
    }

    /**
     * オンライン状態表示を更新
     */
    updateOnlineStatus(isOnline) {
        const indicator = document.getElementById('onlineStatus');
        if (indicator) {
            indicator.classList.toggle('offline', !isOnline);
            indicator.title = isOnline ? 'オンライン' : 'オフライン';
        }
    }

    /**
     * データ保存（ローカル + キュー追加）
     */
    async saveData(collection, data) {
        // ローカルに保存
        const localData = this.getLocalData();

        if (collection === 'sessions') {
            localData.sessions = localData.sessions || [];
            localData.sessions.push(data);
        } else if (collection === 'sections') {
            localData.sections = data;
        } else if (collection === 'theme') {
            localData.theme = data;
        }

        this.setLocalData(localData);

        // ログイン中かつFirebase有効なら同期キューに追加
        if (window.authManager && !window.authManager.isGuestMode() &&
            window.firebaseConfig?.FIREBASE_ENABLED) {
            await this.addToQueue('add', collection, data);

            if (this.isOnline) {
                await this.syncToCloud();
            }
        }
    }

    /**
     * オフラインキューに追加
     */
    async addToQueue(action, collection, data) {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['queue'], 'readwrite');
            const store = transaction.objectStore('queue');

            const item = {
                action,
                collection,
                data,
                timestamp: Date.now()
            };

            const request = store.add(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * クラウドに同期
     */
    async syncToCloud() {
        if (!window.firebaseConfig?.FIREBASE_ENABLED) return;
        if (!window.authManager || window.authManager.isGuestMode()) return;
        if (this.syncInProgress || !this.isOnline) return;

        this.syncInProgress = true;
        console.log('[Sync] クラウド同期開始');

        try {
            const db = window.firebaseConfig.getDb();
            const user = window.authManager.getCurrentUser();
            if (!db || !user) return;

            // キューからアイテムを取得して処理
            const queueItems = await this.getQueueItems();

            for (const item of queueItems) {
                try {
                    if (item.collection === 'sessions') {
                        await db.collection('users').doc(user.uid)
                            .collection('sessions').doc(item.data.id)
                            .set(item.data);
                    } else if (item.collection === 'sections') {
                        await db.collection('users').doc(user.uid)
                            .collection('settings').doc('sections')
                            .set({ items: item.data }, { merge: false }); // 配列は上書き
                    } else if (item.collection === 'theme') {
                        await db.collection('users').doc(user.uid)
                            .collection('settings').doc('theme')
                            .set({ value: item.data });
                    }

                    // 成功したらキューから削除
                    await this.removeFromQueue(item.id);
                } catch (error) {
                    console.error('[Sync] アイテム同期エラー:', error);
                }
            }

            console.log('[Sync] クラウド同期完了');
        } catch (error) {
            console.error('[Sync] 同期エラー:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * キューアイテム取得
     */
    async getQueueItems() {
        if (!this.db) return [];

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['queue'], 'readonly');
            const store = transaction.objectStore('queue');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * キューから削除
     */
    async removeFromQueue(id) {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['queue'], 'readwrite');
            const store = transaction.objectStore('queue');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * ゲストデータをクラウドにマージ（初回ログイン時）
     */
    async mergeGuestDataToCloud() {
        if (!window.firebaseConfig?.FIREBASE_ENABLED) return;
        if (!window.authManager || window.authManager.isGuestMode()) return;

        const localData = this.getLocalData();
        const db = window.firebaseConfig.getDb();
        const user = window.authManager.getCurrentUser();

        if (!db || !user || !localData.sessions?.length) return;

        console.log('[Sync] ゲストデータをクラウドにマージ');

        try {
            const batch = db.batch();

            // セッションをマージ
            for (const session of localData.sessions) {
                const ref = db.collection('users').doc(user.uid)
                    .collection('sessions').doc(session.id);
                batch.set(ref, session, { merge: true });
            }

            // セクションをマージ
            if (localData.sections?.length) {
                const sectionsRef = db.collection('users').doc(user.uid)
                    .collection('settings').doc('sections');
                batch.set(sectionsRef, { items: localData.sections }, { merge: true });
            }

            await batch.commit();
            console.log('[Sync] マージ完了');
        } catch (error) {
            console.error('[Sync] マージエラー:', error);
        }
    }

    /**
     * クラウドからデータ取得
     */
    async loadFromCloud() {
        if (!window.firebaseConfig?.FIREBASE_ENABLED) return null;
        if (!window.authManager || window.authManager.isGuestMode()) return null;

        const db = window.firebaseConfig.getDb();
        const user = window.authManager.getCurrentUser();

        if (!db || !user) return null;

        try {
            // セッション取得
            const sessionsSnapshot = await db.collection('users').doc(user.uid)
                .collection('sessions').get();
            const sessions = sessionsSnapshot.docs.map(doc => doc.data());

            // 設定取得
            const sectionsDoc = await db.collection('users').doc(user.uid)
                .collection('settings').doc('sections').get();
            const sections = sectionsDoc.exists ? sectionsDoc.data().items : [];

            const themeDoc = await db.collection('users').doc(user.uid)
                .collection('settings').doc('theme').get();
            const theme = themeDoc.exists ? themeDoc.data().value : 'light';

            return { sessions, sections, theme };
        } catch (error) {
            console.error('[Sync] クラウド読み込みエラー:', error);
            return null;
        }
    }

    /**
     * ローカルデータ取得
     */
    getLocalData() {
        const saved = localStorage.getItem('pomodoroData');
        return saved ? JSON.parse(saved) : { sessions: [], sections: [], theme: 'light' };
    }

    /**
     * ローカルデータ保存
     */
    setLocalData(data) {
        localStorage.setItem('pomodoroData', JSON.stringify(data));
    }

    /**
     * データエクスポート（CSV）
     */
    exportToCSV() {
        const data = this.getLocalData();
        const sessions = data.sessions || [];

        if (sessions.length === 0) {
            alert('エクスポートするデータがありません');
            return;
        }

        const headers = ['日付', '時間(分)', 'モード', '集中度', 'セクション'];
        const rows = sessions.map(s => [
            s.date,
            s.duration,
            s.mode,
            s.focus,
            s.section || ''
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
        this.downloadFile(blob, `pomodoro_data_${this.getDateString()}.csv`);
    }

    /**
     * データエクスポート（JSON）
     */
    exportToJSON() {
        const data = this.getLocalData();

        if (!data.sessions?.length) {
            alert('エクスポートするデータがありません');
            return;
        }

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this.downloadFile(blob, `pomodoro_data_${this.getDateString()}.json`);
    }

    /**
     * ファイルダウンロード
     */
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 日付文字列
     */
    getDateString() {
        return new Date().toISOString().split('T')[0];
    }
}

// グローバルインスタンス
window.syncManager = new SyncManager();
