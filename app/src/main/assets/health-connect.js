// ============================================================
// Health Connect Integration Module
// ============================================================

const HealthConnectManager = (function() {
    let realTimeHeartRateInterval = null;
    let useRealData = false;
    let onHeartRateUpdateCallback = null;
    let isAvailable = false;

    function checkAvailability() {
        return window.AndroidHealth && window.AndroidHealth.checkAvailability();
    }

    function requestPermissions() {
        if (window.AndroidHealth) {
            window.AndroidHealth.requestPermissions();
        } else {
            console.warn('Health Connect not available');
        }
    }

    function requestPermissionsIfNeeded() {
        if (!checkAvailability()) {
            return false;
        }
        requestPermissions();
        return true;
    }

    function fetchLatestHeartRate() {
        return new Promise((resolve, reject) => {
            if (!window.AndroidHealth) {
                reject(new Error('Health Connect not available'));
                return;
            }
            const callbackId = 'hr_' + Date.now() + '_' + Math.random();
            window[`_hrResolver_${callbackId}`] = resolve;
            window[`_hrRejector_${callbackId}`] = reject;
            window.AndroidHealth.getLatestHeartRate(callbackId);
        });
    }

    function startRealTimeMonitoring(callback) {
        if (realTimeHeartRateInterval) clearInterval(realTimeHeartRateInterval);
        onHeartRateUpdateCallback = callback;
        realTimeHeartRateInterval = setInterval(async () => {
            try {
                const hr = await fetchLatestHeartRate();
                if (hr > 0 && onHeartRateUpdateCallback) {
                    onHeartRateUpdateCallback(hr);
                }
            } catch (e) {
                console.warn('Health Connect read failed:', e);
            }
        }, 1000);
    }

    function stopRealTimeMonitoring() {
        if (realTimeHeartRateInterval) {
            clearInterval(realTimeHeartRateInterval);
            realTimeHeartRateInterval = null;
        }
    }

    function setUseRealData(enabled, callback) {
        useRealData = enabled;
        if (useRealData) {
            if (checkAvailability()) {
                requestPermissions();
                startRealTimeMonitoring(callback);
            } else {
                console.warn('Health Connect not available, cannot use real data');
                useRealData = false;
            }
        } else {
            stopRealTimeMonitoring();
        }
    }

    function isRealDataEnabled() {
        return useRealData;
    }

    // 新增呢個 function 畀個掣 call
    function injectMockHrData() {
        if (window.AndroidHealth && window.AndroidHealth.checkAvailability()) {
            const callbackId = 'mock_' + Date.now();
            // 提提你：要確保已經 request 咗 permission 先禁！
            window.AndroidHealth.injectMockData(callbackId);
        } else {
            alert("Health Connect not available");
        }
    }

    // 畀 Android call 返轉頭嘅 callback
    window.onMockDataInjected = function(success, message, callbackId) {
        if (success) {
            alert("✅ 成功隊咗假 data 入 Health Connect！而家你可以剔 Use Real Heart Rate 試吓。");
        } else {
            alert("❌ 寫入失敗: " + message + "\n(請確認有冇比 Write 權限)");
        }
    };

    // for android to call
    window.onHeartRateUpdate = function(heartRate, callbackId) {
        const resolver = window[`_hrResolver_${callbackId}`];
        if (resolver) {
            resolver(heartRate);
            delete window[`_hrResolver_${callbackId}`];
        }
    };
    window.onHeartRateError = function(error, callbackId) {
        const rejector = window[`_hrRejector_${callbackId}`];
        if (rejector) {
            rejector(new Error(error));
            delete window[`_hrRejector_${callbackId}`];
        }
    };
    window.onHealthPermissionsGranted = function() {
        console.log('Health Connect permissions granted');
        if (useRealData && onHeartRateUpdateCallback) {
            startRealTimeMonitoring(onHeartRateUpdateCallback);
        }
    };
    window.onHealthPermissionsDenied = function() {
        console.warn('Health Connect permissions denied');
        setUseRealData(false);
    };

    return {
        checkAvailability,
        requestPermissions,
        fetchLatestHeartRate,
        setUseRealData,
        requestPermissionsIfNeeded,
        isRealDataEnabled,
        stopRealTimeMonitoring,
        injectMockHrData
    };
})();