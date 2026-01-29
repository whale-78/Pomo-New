/**
 * 学習管理ポモドーロアプリ v3
 * PWA対応・ユーザー認証・クラウド同期
 */

// 20色カラーパレット
const SECTION_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#e11d48', '#22c55e', '#eab308', '#a855f7',
    '#0ea5e9', '#d946ef', '#65a30d', '#fb7185', '#2dd4bf'
];

class StudyPomodoroApp {
    constructor() {
        // DOM要素
        this.app = document.getElementById('app');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.modeDisplay = document.getElementById('modeDisplay');
        this.progressBar = document.getElementById('progressBar');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.addTimeBtn = document.getElementById('addTimeBtn');
        this.subtractTimeBtn = document.getElementById('subtractTimeBtn');
        this.sessionCountEl = document.getElementById('sessionCount');
        this.totalTimeEl = document.getElementById('totalTime');
        this.continuousTimeEl = document.getElementById('continuousTime');
        this.workDurationInput = document.getElementById('workDuration');
        this.breakDurationInput = document.getElementById('breakDuration');
        this.longBreakDurationInput = document.getElementById('longBreakDuration');
        this.mockExamDurationInput = document.getElementById('mockExamDuration');
        this.mockExamSettings = document.getElementById('mockExamSettings');
        this.pomodoroSettings = document.getElementById('pomodoroSettings');
        this.focusModal = document.getElementById('focusModal');
        this.breakReminderModal = document.getElementById('breakReminderModal');
        this.focusChart = document.getElementById('focusChart');
        this.sectionPieChart = document.getElementById('sectionPieChart');
        this.currentSectionSelect = document.getElementById('currentSection');
        this.settingsModal = document.getElementById('settingsModal');
        this.settingsToggle = document.getElementById('settingsToggle');
        this.closeSettingsModal = document.getElementById('closeSettingsModal');
        this.newSectionInput = document.getElementById('newSectionInput');
        this.addSectionBtn = document.getElementById('addSectionBtn');
        this.sectionList = document.getElementById('sectionList');
        this.barChartContainer = document.getElementById('barChartContainer');
        this.pieChartContainer = document.getElementById('pieChartContainer');
        this.barChartLegend = document.getElementById('barChartLegend');
        this.pieChartLegend = document.getElementById('pieChartLegend');
        this.pieChartLegend = document.getElementById('pieChartLegend');
        this.loginModal = document.getElementById('loginModal');
        this.qrModal = document.getElementById('qrModal');
        this.showQrBtn = document.getElementById('showQrBtn');
        this.closeQrModal = document.getElementById('closeQrModal');

        // タイマー状態
        this.isRunning = false;
        this.timeRemaining = 25 * 60;
        this.totalDuration = 25 * 60;
        this.timerMode = 'work';
        this.appMode = 'pomodoro';
        this.completedSessions = 0;
        this.intervalId = null;
        this.currentSessionDuration = 0;

        // 連続作業時間追跡
        this.continuousWorkSeconds = 0;
        this.breakReminderShown = false;

        // 円周の長さ
        this.circumference = 2 * Math.PI * 90;

        // データ
        this.sessions = [];
        this.sections = [];
        this.currentSection = '';
        this.theme = 'light';
        this.barChart = null;
        this.pieChart = null;
        this.currentPeriod = 'today';
        this.currentChartType = 'bar';

        // 通知音
        this.audioContext = null;

        // Wake Lock（画面スリープ防止）
        this.wakeLock = null;

        // 認証状態
        this.isLoginMode = true;

        this.init();
    }

    async init() {
        // Firebase初期化
        if (window.firebaseConfig?.FIREBASE_ENABLED) {
            await window.firebaseConfig.initializeFirebase();
        }

        // 同期マネージャー初期化
        if (window.syncManager) {
            await window.syncManager.init();
        }

        // 認証マネージャー初期化
        if (window.authManager) {
            await window.authManager.init();
            window.authManager.onAuthStateChanged((user, isGuest) => {
                this.handleAuthStateChange(user, isGuest);
            });
        }

        this.loadData();
        this.progressBar.style.strokeDasharray = this.circumference;
        this.progressBar.style.strokeDashoffset = 0;
        this.setupEventListeners();
        this.updateDisplay();
        this.updateStats();
        this.updateMode();
        this.updateSectionSelect();
        this.updateSectionList();
        this.applyTheme();
        this.initCharts();
        this.updateAuthUI();
    }

    setupEventListeners() {
        // タイマーコントロール
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.resetBtn.addEventListener('click', () => this.reset());

        // 時間調整
        this.addTimeBtn.addEventListener('click', () => this.adjustTime(5));
        this.subtractTimeBtn.addEventListener('click', () => this.adjustTime(-5));

        // 設定変更
        this.workDurationInput.addEventListener('change', () => this.updateSettings());
        this.breakDurationInput.addEventListener('change', () => this.updateSettings());
        this.longBreakDurationInput.addEventListener('change', () => this.updateSettings());
        this.mockExamDurationInput.addEventListener('change', () => this.updateSettings());

        // モード切替タブ
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchAppMode(e.target.dataset.mode));
        });

        // 集中度選択
        document.querySelectorAll('.focus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.recordFocus(e.target.closest('.focus-btn').dataset.focus));
        });

        // 休憩促しモーダル
        document.getElementById('takeBreakBtn').addEventListener('click', () => this.takeBreak());
        document.getElementById('continueWorkBtn').addEventListener('click', () => this.continueWork());

        // 期間フィルター
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.changePeriod(e.target.dataset.period));
        });

        // グラフ切替
        document.querySelectorAll('.chart-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchChart(e.target.dataset.chart));
        });

        // セクション選択
        this.currentSectionSelect.addEventListener('change', (e) => {
            this.currentSection = e.target.value;
        });

        // 設定モーダル
        this.settingsToggle.addEventListener('click', () => this.openSettingsModal());
        this.closeSettingsModal.addEventListener('click', () => this.closeSettings());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });

        // セクション追加
        this.addSectionBtn.addEventListener('click', () => this.addSection());
        this.newSectionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addSection();
        });

        // テーマ切替
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setTheme(e.target.dataset.theme));
        });

        // 認証関連
        document.getElementById('showLoginBtn')?.addEventListener('click', () => this.showLoginModal());
        document.getElementById('closeLoginModal')?.addEventListener('click', () => this.hideLoginModal());
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleAuthSubmit(e));
        document.getElementById('googleLoginBtn')?.addEventListener('click', () => this.handleGoogleLogin());
        document.getElementById('switchToSignUp')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });
        document.getElementById('switchToLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });

        this.loginModal?.addEventListener('click', (e) => {
            if (e.target === this.loginModal) this.hideLoginModal();
        });

        // データエクスポート
        document.getElementById('exportCSV')?.addEventListener('click', () => {
            window.syncManager?.exportToCSV();
        });
        document.getElementById('exportJSON')?.addEventListener('click', () => {
            window.syncManager?.exportToJSON();
        });

        // QRコード
        this.showQrBtn?.addEventListener('click', () => this.showQrCode());
        this.closeQrModal?.addEventListener('click', () => this.hideQrCode());
        this.qrModal?.addEventListener('click', (e) => {
            if (e.target === this.qrModal) this.hideQrCode();
        });
    }

    // タイマー制御
    async start() {
        if (this.isRunning) return;

        // セクション未選択の警告
        if (!this.currentSection && this.sections.length > 0) {
            alert('学習セクションを選択してください');
            return;
        }

        this.isRunning = true;
        this.app.setAttribute('data-running', 'true');
        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.disableSettings(true);

        // Wake Lock取得（画面スリープ防止）
        await this.requestWakeLock();

        this.intervalId = setInterval(() => this.tick(), 1000);
    }

    async pause() {
        if (!this.isRunning) return;

        this.isRunning = false;
        this.app.setAttribute('data-running', 'false');
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;

        // Wake Lock解放
        await this.releaseWakeLock();

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    reset() {
        this.pause();
        this.currentSessionDuration = 0;
        this.disableSettings(false);
        this.setTimeForMode(this.timerMode);
        this.updateDisplay();
        this.updateProgress();
    }

    tick() {
        if (this.timeRemaining > 0) {
            this.timeRemaining--;
            this.currentSessionDuration++;

            if (this.timerMode === 'work' || this.timerMode === 'mockExam') {
                this.continuousWorkSeconds++;
                this.checkBreakReminder();
            }

            this.updateDisplay();
            this.updateProgress();
            this.updateStats();
        } else {
            this.completeSession();
        }
    }

    async completeSession() {
        await this.pause();
        this.playNotification();
        this.vibrateDevice();

        if (this.timerMode === 'work' || this.timerMode === 'mockExam') {
            this.completedSessions++;
            this.showFocusModal();
        } else {
            this.continuousWorkSeconds = 0;
            this.breakReminderShown = false;
            this.switchTimerMode('work');
            this.updateStats();
        }
    }

    adjustTime(minutes) {
        const seconds = minutes * 60;
        this.timeRemaining = Math.max(60, this.timeRemaining + seconds);
        this.totalDuration = Math.max(60, this.totalDuration + seconds);
        this.updateDisplay();
        this.updateProgress();
    }

    // Wake Lock（画面スリープ防止）
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('[App] Wake Lock取得');

                this.wakeLock.addEventListener('release', () => {
                    console.log('[App] Wake Lock解放');
                });
            } catch (err) {
                console.log('[App] Wake Lock取得失敗:', err);
            }
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
            } catch (err) {
                console.log('[App] Wake Lock解放エラー:', err);
            }
        }
    }

    // バイブレーション通知
    vibrateDevice() {
        if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200, 100, 200]);
            console.log('[App] バイブレーション');
        }
    }

    // モード切替
    switchAppMode(mode) {
        if (this.isRunning) return;

        this.appMode = mode;
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });

        if (mode === 'mockExam') {
            this.mockExamSettings.style.display = 'flex';
            this.pomodoroSettings.style.display = 'none';
            this.switchTimerMode('mockExam');
        } else {
            this.mockExamSettings.style.display = 'none';
            this.pomodoroSettings.style.display = 'block';
            this.switchTimerMode('work');
        }
    }

    switchTimerMode(mode) {
        this.timerMode = mode;
        this.currentSessionDuration = 0;
        this.setTimeForMode(mode);
        this.updateMode();
        this.updateDisplay();
        this.updateProgress();
    }

    setTimeForMode(mode) {
        switch (mode) {
            case 'work':
                this.totalDuration = parseInt(this.workDurationInput.value) * 60;
                break;
            case 'break':
                this.totalDuration = parseInt(this.breakDurationInput.value) * 60;
                break;
            case 'longBreak':
                this.totalDuration = parseInt(this.longBreakDurationInput.value) * 60;
                break;
            case 'mockExam':
                this.totalDuration = parseInt(this.mockExamDurationInput.value) * 60;
                break;
        }
        this.timeRemaining = this.totalDuration;
    }

    updateSettings() {
        if (!this.isRunning) {
            this.setTimeForMode(this.timerMode);
            this.updateDisplay();
            this.updateProgress();
        }
    }

    // 2.5時間ルール
    checkBreakReminder() {
        const twoAndHalfHours = 2.5 * 60 * 60;
        if (this.continuousWorkSeconds >= twoAndHalfHours && !this.breakReminderShown) {
            this.breakReminderShown = true;
            this.pause();
            this.vibrateDevice();
            this.breakReminderModal.classList.add('active');
        }
    }

    takeBreak() {
        this.breakReminderModal.classList.remove('active');
        this.continuousWorkSeconds = 0;
        this.breakReminderShown = false;
        this.switchTimerMode('longBreak');
        setTimeout(() => this.start(), 500);
    }

    continueWork() {
        this.breakReminderModal.classList.remove('active');
        this.start();
    }

    // 集中度記録
    showFocusModal() {
        this.focusModal.classList.add('active');
    }

    async recordFocus(focusLevel) {
        this.focusModal.classList.remove('active');

        const session = {
            id: this.generateId(),
            date: new Date().toISOString().split('T')[0],
            timestamp: Date.now(),
            duration: Math.round(this.currentSessionDuration / 60),
            mode: this.timerMode,
            focus: focusLevel,
            section: this.currentSection || 'その他'
        };

        this.sessions.push(session);
        this.saveData();

        // クラウド同期
        if (window.syncManager) {
            await window.syncManager.saveData('sessions', session);
        }

        this.updateCharts();
        this.updateStats();

        if (this.appMode === 'pomodoro') {
            if (this.completedSessions % 4 === 0) {
                this.continuousWorkSeconds = 0;
                this.breakReminderShown = false;
                this.switchTimerMode('longBreak');
            } else {
                this.switchTimerMode('break');
            }
            setTimeout(() => this.start(), 500);
        } else {
            this.reset();
        }
    }

    // UI更新
    updateDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        this.timeDisplay.textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    updateProgress() {
        const progress = this.timeRemaining / this.totalDuration;
        const offset = this.circumference * progress;
        this.progressBar.style.strokeDashoffset = this.circumference - offset;
    }

    updateMode() {
        this.app.setAttribute('data-timer-mode', this.timerMode);

        const modeLabels = {
            work: '作業モード',
            break: '休憩モード',
            longBreak: '長休憩モード',
            mockExam: '模試モード'
        };

        this.modeDisplay.textContent = modeLabels[this.timerMode];
    }

    updateStats() {
        const today = new Date().toISOString().split('T')[0];
        const todaySessions = this.sessions.filter(s => s.date === today);

        this.sessionCountEl.textContent = todaySessions.length;

        const todayMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0);
        this.totalTimeEl.textContent = `${todayMinutes}分`;

        const continuousMinutes = Math.floor(this.continuousWorkSeconds / 60);
        this.continuousTimeEl.textContent = `${continuousMinutes}分`;
    }

    disableSettings(disabled) {
        this.workDurationInput.disabled = disabled;
        this.breakDurationInput.disabled = disabled;
        this.longBreakDurationInput.disabled = disabled;
        this.mockExamDurationInput.disabled = disabled;
        this.currentSectionSelect.disabled = disabled;
        document.querySelectorAll('.mode-tab').forEach(tab => tab.disabled = disabled);
    }

    // セクション管理
    async addSection() {
        const name = this.newSectionInput.value.trim();

        if (!name) {
            alert('セクション名を入力してください');
            return;
        }

        if (this.sections.length >= 20) {
            alert('セクションは最大20個までです');
            return;
        }

        if (this.sections.includes(name)) {
            alert('同じ名前のセクションが既に存在します');
            return;
        }

        this.sections.push(name);
        this.newSectionInput.value = '';
        this.saveData();

        // クラウド同期
        if (window.syncManager) {
            await window.syncManager.saveData('sections', this.sections);
        }

        this.updateSectionSelect();
        this.updateSectionList();
        this.updatePieChart();
    }

    async deleteSection(name) {
        if (!confirm(`「${name}」を削除しますか？\n※記録は削除されません`)) return;

        this.sections = this.sections.filter(s => s !== name);
        if (this.currentSection === name) {
            this.currentSection = '';
            this.currentSectionSelect.value = '';
        }
        this.saveData();

        // クラウド同期
        if (window.syncManager) {
            await window.syncManager.saveData('sections', this.sections);
        }

        this.updateSectionSelect();
        this.updateSectionList();
        this.updatePieChart();
    }

    updateSectionSelect() {
        const value = this.currentSectionSelect.value;
        this.currentSectionSelect.innerHTML = '<option value="">セクションを選択...</option>';

        this.sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section;
            option.textContent = section;
            this.currentSectionSelect.appendChild(option);
        });

        this.currentSectionSelect.value = value;
    }

    updateSectionList() {
        this.sectionList.innerHTML = '';

        if (this.sections.length === 0) {
            this.sectionList.innerHTML = '<li class="section-list-item"><span class="section-name" style="color: var(--text-muted);">セクションがありません</span></li>';
            return;
        }

        this.sections.forEach((section, index) => {
            const li = document.createElement('li');
            li.className = 'section-list-item';
            li.innerHTML = `
                <span class="section-name">
                    <span class="section-color" style="background: ${SECTION_COLORS[index % 20]}"></span>
                    ${section}
                </span>
                <button class="section-delete" data-section="${section}" title="削除">🗑️</button>
            `;
            this.sectionList.appendChild(li);
        });

        // 削除ボタンのイベント
        this.sectionList.querySelectorAll('.section-delete').forEach(btn => {
            btn.addEventListener('click', (e) => this.deleteSection(e.target.dataset.section));
        });
    }

    // 設定モーダル
    openSettingsModal() {
        this.settingsModal.classList.add('active');
        this.updateThemeButtons();
        this.updateAuthUI();
    }

    closeSettings() {
        this.settingsModal.classList.remove('active');
    }

    // 認証UI
    updateAuthUI() {
        const authGuest = document.getElementById('authGuest');
        const authLoggedIn = document.getElementById('authLoggedIn');
        const authUnavailable = document.getElementById('authUnavailable');

        if (!window.firebaseConfig?.FIREBASE_ENABLED) {
            // Firebase未設定
            authGuest?.style && (authGuest.style.display = 'none');
            authLoggedIn?.style && (authLoggedIn.style.display = 'none');
            authUnavailable?.style && (authUnavailable.style.display = 'block');
            return;
        }

        const isGuest = window.authManager?.isGuestMode() ?? true;
        const user = window.authManager?.getCurrentUser();

        authUnavailable?.style && (authUnavailable.style.display = 'none');

        if (isGuest) {
            authGuest?.style && (authGuest.style.display = 'block');
            authLoggedIn?.style && (authLoggedIn.style.display = 'none');
        } else {
            authGuest?.style && (authGuest.style.display = 'none');
            authLoggedIn?.style && (authLoggedIn.style.display = 'block');
            const userEmailEl = document.getElementById('userEmail');
            if (userEmailEl && user) {
                userEmailEl.textContent = user.email;
            }
        }
    }

    async handleAuthStateChange(user, isGuest) {
        this.updateAuthUI();

        if (!isGuest && window.syncManager) {
            // ログイン時、ゲストデータをクラウドにマージ
            await window.syncManager.mergeGuestDataToCloud();

            // クラウドからデータを読み込み
            const cloudData = await window.syncManager.loadFromCloud();
            if (cloudData) {
                // ローカルとマージ
                const localData = this.getLocalData();
                this.sessions = this.mergeArrays(localData.sessions, cloudData.sessions);
                this.sections = [...new Set([...localData.sections, ...cloudData.sections])];
                this.theme = cloudData.theme || localData.theme;

                this.saveData();
                this.updateSectionSelect();
                this.updateSectionList();
                this.applyTheme();
                this.updateCharts();
                this.updateStats();
            }
        }
    }

    mergeArrays(local, cloud) {
        const merged = [...local];
        const localIds = new Set(local.map(s => s.id));
        cloud.forEach(s => {
            if (!localIds.has(s.id)) {
                merged.push(s);
            }
        });
        return merged.sort((a, b) => a.timestamp - b.timestamp);
    }

    showLoginModal() {
        this.loginModal.classList.add('active');
        this.isLoginMode = true;
        this.updateLoginModalUI();
    }

    hideLoginModal() {
        this.loginModal.classList.remove('active');
        document.getElementById('formError').textContent = '';
        document.getElementById('loginForm').reset();
    }

    toggleAuthMode() {
        this.isLoginMode = !this.isLoginMode;
        this.updateLoginModalUI();
    }

    updateLoginModalUI() {
        const title = document.getElementById('loginModalTitle');
        const submitBtn = document.getElementById('submitAuthBtn');
        const toSignUp = document.getElementById('switchToSignUp');
        const toLogin = document.getElementById('switchToLogin');

        if (this.isLoginMode) {
            title.textContent = '🔐 ログイン';
            submitBtn.textContent = 'ログイン';
            toSignUp.style.display = 'inline';
            toLogin.style.display = 'none';
        } else {
            title.textContent = '📝 新規登録';
            submitBtn.textContent = '新規登録';
            toSignUp.style.display = 'none';
            toLogin.style.display = 'inline';
        }
    }

    async handleAuthSubmit(e) {
        e.preventDefault();

        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        const errorEl = document.getElementById('formError');
        const submitBtn = document.getElementById('submitAuthBtn');

        submitBtn.disabled = true;
        submitBtn.textContent = '処理中...';

        try {
            let result;
            if (this.isLoginMode) {
                result = await window.authManager.signIn(email, password);
            } else {
                result = await window.authManager.signUp(email, password);
            }

            if (result.success) {
                this.hideLoginModal();
                this.closeSettings();
            } else {
                errorEl.textContent = result.error;
            }
        } catch (error) {
            errorEl.textContent = error.message;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = this.isLoginMode ? 'ログイン' : '新規登録';
        }
    }

    async handleGoogleLogin() {
        const errorEl = document.getElementById('formError');

        try {
            const result = await window.authManager.signInWithGoogle();
            if (result.success) {
                this.hideLoginModal();
                this.closeSettings();
            } else {
                errorEl.textContent = result.error;
            }
        } catch (error) {
            errorEl.textContent = error.message;
        }
    }

    async handleLogout() {
        if (confirm('ログアウトしますか？')) {
            await window.authManager.signOut();
            this.updateAuthUI();
            window.location.reload(); // 状態をクリーンにするためにリロード
        }
    }

    // QRコード表示
    showQrCode() {
        const qrImage = document.getElementById('qrImage');
        if (qrImage) {
            const url = encodeURIComponent(window.location.href);
            qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}`;
            this.qrModal.classList.add('active');
        }
    }

    hideQrCode() {
        this.qrModal.classList.remove('active');
    }

    // テーマ管理
    async setTheme(theme) {
        this.theme = theme;
        this.applyTheme();
        this.saveData();

        // クラウド同期
        if (window.syncManager) {
            await window.syncManager.saveData('theme', theme);
        }

        this.updateThemeButtons();
    }

    applyTheme() {
        this.app.setAttribute('data-theme', this.theme);
        document.body.style.backgroundColor = this.theme === 'dark' ? '#0a0a0a' : '#f8fafc';

        // meta theme-color更新
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.content = this.theme === 'dark' ? '#ef4444' : '#3b82f6';
        }
    }

    updateThemeButtons() {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === this.theme);
        });
    }

    // データ管理
    saveData() {
        const data = {
            sessions: this.sessions,
            sections: this.sections,
            theme: this.theme
        };
        localStorage.setItem('pomodoroData', JSON.stringify(data));
    }

    loadData() {
        const saved = localStorage.getItem('pomodoroData');
        if (saved) {
            const data = JSON.parse(saved);
            this.sessions = data.sessions || [];
            this.sections = data.sections || [];
            this.theme = data.theme || 'light';
        }
    }

    getLocalData() {
        const saved = localStorage.getItem('pomodoroData');
        return saved ? JSON.parse(saved) : { sessions: [], sections: [], theme: 'light' };
    }

    // グラフ
    initCharts() {
        this.initBarChart();
        this.initPieChart();
    }

    initBarChart() {
        const ctx = this.focusChart.getContext('2d');

        this.barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '集中できた',
                        data: [],
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '普通',
                        data: [],
                        backgroundColor: 'rgba(148, 163, 184, 0.8)',
                        borderColor: 'rgba(148, 163, 184, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '捗らなかった',
                        data: [],
                        backgroundColor: 'rgba(239, 68, 68, 0.8)',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, title: { display: true, text: '分' } }
                },
                plugins: { legend: { display: false } }
            }
        });

        this.updateBarChart();
    }

    initPieChart() {
        const ctx = this.sectionPieChart.getContext('2d');

        this.pieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: SECTION_COLORS,
                    borderWidth: 2,
                    borderColor: this.theme === 'dark' ? '#171717' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const minutes = context.raw;
                                const hours = Math.floor(minutes / 60);
                                const mins = minutes % 60;
                                if (hours > 0) {
                                    return `${context.label}: ${hours}時間${mins}分`;
                                }
                                return `${context.label}: ${mins}分`;
                            }
                        }
                    }
                }
            }
        });

        this.updatePieChart();
    }

    updateCharts() {
        this.updateBarChart();
        this.updatePieChart();
    }

    updateBarChart() {
        const data = this.getBarChartData();

        this.barChart.data.labels = data.labels;
        this.barChart.data.datasets[0].data = data.focused;
        this.barChart.data.datasets[1].data = data.normal;
        this.barChart.data.datasets[2].data = data.distracted;

        this.barChart.update();
    }

    getBarChartData() {
        const now = new Date();
        let labels = [], focused = [], normal = [], distracted = [];

        switch (this.currentPeriod) {
            case 'today':
                const today = now.toISOString().split('T')[0];
                const todaySessions = this.sessions.filter(s => s.date === today);

                for (let h = 6; h <= 23; h++) {
                    labels.push(`${h}時`);
                    const hourSessions = todaySessions.filter(s => {
                        const hour = new Date(s.timestamp).getHours();
                        return hour === h;
                    });
                    focused.push(hourSessions.filter(s => s.focus === 'focused').reduce((sum, s) => sum + s.duration, 0));
                    normal.push(hourSessions.filter(s => s.focus === 'normal').reduce((sum, s) => sum + s.duration, 0));
                    distracted.push(hourSessions.filter(s => s.focus === 'distracted').reduce((sum, s) => sum + s.duration, 0));
                }
                break;

            case 'week':
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(now);
                    d.setDate(d.getDate() - i);
                    const dateStr = d.toISOString().split('T')[0];
                    labels.push(this.formatDate(d, 'short'));

                    const daySessions = this.sessions.filter(s => s.date === dateStr);
                    focused.push(daySessions.filter(s => s.focus === 'focused').reduce((sum, s) => sum + s.duration, 0));
                    normal.push(daySessions.filter(s => s.focus === 'normal').reduce((sum, s) => sum + s.duration, 0));
                    distracted.push(daySessions.filter(s => s.focus === 'distracted').reduce((sum, s) => sum + s.duration, 0));
                }
                break;

            case 'month':
                for (let i = 3; i >= 0; i--) {
                    const weekEnd = new Date(now);
                    weekEnd.setDate(weekEnd.getDate() - (i * 7));
                    const weekStart = new Date(weekEnd);
                    weekStart.setDate(weekStart.getDate() - 6);

                    labels.push(`${this.formatDate(weekStart, 'short')}~`);

                    const weekSessions = this.sessions.filter(s => {
                        const d = new Date(s.date);
                        return d >= weekStart && d <= weekEnd;
                    });
                    focused.push(weekSessions.filter(s => s.focus === 'focused').reduce((sum, s) => sum + s.duration, 0));
                    normal.push(weekSessions.filter(s => s.focus === 'normal').reduce((sum, s) => sum + s.duration, 0));
                    distracted.push(weekSessions.filter(s => s.focus === 'distracted').reduce((sum, s) => sum + s.duration, 0));
                }
                break;

            case 'year':
                for (let i = 11; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    labels.push(`${d.getMonth() + 1}月`);

                    const monthSessions = this.sessions.filter(s => s.date.startsWith(monthStr));
                    focused.push(monthSessions.filter(s => s.focus === 'focused').reduce((sum, s) => sum + s.duration, 0));
                    normal.push(monthSessions.filter(s => s.focus === 'normal').reduce((sum, s) => sum + s.duration, 0));
                    distracted.push(monthSessions.filter(s => s.focus === 'distracted').reduce((sum, s) => sum + s.duration, 0));
                }
                break;
        }

        return { labels, focused, normal, distracted };
    }

    updatePieChart() {
        const data = this.getPieChartData();

        this.pieChart.data.labels = data.labels;
        this.pieChart.data.datasets[0].data = data.values;
        this.pieChart.data.datasets[0].backgroundColor = data.colors;
        this.pieChart.data.datasets[0].borderColor = this.theme === 'dark' ? '#171717' : '#ffffff';

        this.pieChart.update();
        this.updatePieChartLegend(data);
    }

    getPieChartData() {
        const sectionTime = {};
        const filteredSessions = this.getFilteredSessions();

        filteredSessions.forEach(s => {
            const section = s.section || 'その他';
            sectionTime[section] = (sectionTime[section] || 0) + s.duration;
        });

        const labels = Object.keys(sectionTime);
        const values = Object.values(sectionTime);
        const colors = labels.map((label, i) => {
            const sectionIndex = this.sections.indexOf(label);
            return sectionIndex >= 0 ? SECTION_COLORS[sectionIndex % 20] : SECTION_COLORS[i % 20];
        });

        return { labels, values, colors };
    }

    getFilteredSessions() {
        const now = new Date();

        switch (this.currentPeriod) {
            case 'today':
                const today = now.toISOString().split('T')[0];
                return this.sessions.filter(s => s.date === today);
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return this.sessions.filter(s => new Date(s.date) >= weekAgo);
            case 'month':
                const monthAgo = new Date(now);
                monthAgo.setDate(monthAgo.getDate() - 30);
                return this.sessions.filter(s => new Date(s.date) >= monthAgo);
            case 'year':
                const yearAgo = new Date(now);
                yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                return this.sessions.filter(s => new Date(s.date) >= yearAgo);
            default:
                return this.sessions;
        }
    }

    updatePieChartLegend(data) {
        this.pieChartLegend.innerHTML = '';

        if (data.labels.length === 0) {
            this.pieChartLegend.innerHTML = '<span class="legend-item" style="color: var(--text-muted);">データがありません</span>';
            return;
        }

        data.labels.forEach((label, i) => {
            const minutes = data.values[i];
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const timeStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;

            const span = document.createElement('span');
            span.className = 'legend-item';
            span.innerHTML = `<span style="display: inline-block; width: 10px; height: 10px; background: ${data.colors[i]}; border-radius: 50%; margin-right: 4px;"></span>${label}: ${timeStr}`;
            this.pieChartLegend.appendChild(span);
        });
    }

    formatDate(date, format) {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        if (format === 'short') {
            return `${month}/${day}`;
        }
        return `${month}月${day}日`;
    }

    changePeriod(period) {
        this.currentPeriod = period;
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        this.updateCharts();
    }

    switchChart(chartType) {
        this.currentChartType = chartType;
        document.querySelectorAll('.chart-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.chart === chartType);
        });

        if (chartType === 'bar') {
            this.barChartContainer.style.display = 'block';
            this.pieChartContainer.style.display = 'none';
            this.barChartLegend.style.display = 'flex';
            this.pieChartLegend.style.display = 'none';
        } else {
            this.barChartContainer.style.display = 'none';
            this.pieChartContainer.style.display = 'block';
            this.barChartLegend.style.display = 'none';
            this.pieChartLegend.style.display = 'flex';
        }
    }

    // ユーティリティ
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    playNotification() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const playBeep = (freq, delay) => {
                setTimeout(() => {
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();

                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);

                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);

                    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + 0.3);
                }, delay);
            };

            playBeep(800, 0);
            playBeep(1000, 150);
            playBeep(1200, 300);

        } catch (e) {
            console.log('Audio notification not supported');
        }

        if ('Notification' in window && Notification.permission === 'granted') {
            const section = this.currentSection ? `【${this.currentSection}】` : '';
            const messages = {
                work: `${section}セッション完了！集中度を記録しましょう 📝`,
                break: '休憩終了！作業を再開しましょう 💪',
                longBreak: '長休憩終了！リフレッシュできましたか？ 🚀',
                mockExam: `${section}模試終了！お疲れ様でした 🎉`
            };

            new Notification('学習管理ポモドーロ', {
                body: messages[this.timerMode],
                icon: '📚'
            });
        }
    }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
    const app = new StudyPomodoroApp();

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});
