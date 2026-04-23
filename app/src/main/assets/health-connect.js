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
        isRealDataEnabled,
        stopRealTimeMonitoring
    };
})();