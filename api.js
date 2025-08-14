// API Configuration
const API_CONFIG = {
    BOT_API_URL: 'https://streamingjkt-bot.herokuapp.com', // Replace with your Heroku app URL
    ENDPOINTS: {
        VALIDATE_TOKEN: '/validate-token',
        GET_M3U_LINKS: '/get-m3u-links',
        MARK_TOKEN_USED: '/mark-token-used',
        CHECK_DEVICE: '/check-device',
        HEALTH: '/health'
    }
};

// API Helper Functions
class StreamingAPI {
    constructor() {
        this.baseURL = API_CONFIG.BOT_API_URL;
    }

    // Make HTTP request with error handling
    async makeRequest(endpoint, method = 'GET', data = null) {
        const url = `${this.baseURL}${endpoint}`;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error(`API request failed: ${method} ${endpoint}`, error);
            throw error;
        }
    }

    // Validate access token and check device restriction
    async validateToken(token, deviceFingerprint) {
        try {
            const response = await this.makeRequest(API_CONFIG.ENDPOINTS.VALIDATE_TOKEN, 'POST', {
                token: token,
                device_fingerprint: deviceFingerprint,
                timestamp: new Date().toISOString()
            });

            return response;
        } catch (error) {
            console.error('Token validation error:', error);
            return { valid: false, error: error.message };
        }
    }

    // Get available M3U streaming links
    async getM3ULinks(token, deviceFingerprint) {
        try {
            const response = await this.makeRequest(API_CONFIG.ENDPOINTS.GET_M3U_LINKS, 'POST', {
                token: token,
                device_fingerprint: deviceFingerprint
            });

            return response;
        } catch (error) {
            console.error('Get M3U links error:', error);
            return { success: false, error: error.message };
        }
    }

    // Mark token as used and bind to device
    async markTokenUsed(token, deviceFingerprint, ipAddress) {
        try {
            const response = await this.makeRequest(API_CONFIG.ENDPOINTS.MARK_TOKEN_USED, 'POST', {
                token: token,
                device_fingerprint: deviceFingerprint,
                ip_address: ipAddress,
                used_at: new Date().toISOString()
            });

            return response;
        } catch (error) {
            console.error('Mark token used error:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if device is already registered for this token
    async checkDevice(token, deviceFingerprint) {
        try {
            const response = await this.makeRequest(API_CONFIG.ENDPOINTS.CHECK_DEVICE, 'POST', {
                token: token,
                device_fingerprint: deviceFingerprint
            });

            return response;
        } catch (error) {
            console.error('Check device error:', error);
            return { allowed: false, error: error.message };
        }
    }

    // Health check
    async healthCheck() {
        try {
            const response = await this.makeRequest(API_CONFIG.ENDPOINTS.HEALTH, 'GET');
            return response;
        } catch (error) {
            console.error('Health check error:', error);
            return { status: 'unhealthy', error: error.message };
        }
    }
}

// Device Fingerprinting
class DeviceFingerprint {
    static generate() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint test', 2, 2);
        
        const components = [
            navigator.userAgent,
            navigator.language,
            navigator.languages ? navigator.languages.join(',') : '',
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.platform,
            navigator.cookieEnabled,
            navigator.doNotTrack,
            canvas.toDataURL(),
            this.getWebGLFingerprint(),
            this.getAudioFingerprint()
        ];
        
        const fingerprint = components.join('|');
        return this.hashCode(fingerprint);
    }

    static getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (!gl) return 'no-webgl';
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (!debugInfo) return 'no-debug-info';
            
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            
            return vendor + '|' + renderer;
        } catch (e) {
            return 'webgl-error';
        }
    }

    static getAudioFingerprint() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const analyser = audioContext.createAnalyser();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(10000, audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            
            oscillator.connect(analyser);
            analyser.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(0);
            
            const frequencyData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(frequencyData);
            
            oscillator.stop();
            audioContext.close();
            
            return Array.from(frequencyData).slice(0, 30).join(',');
        } catch (e) {
            return 'audio-error';
        }
    }

    static hashCode(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash).toString(36);
    }
}

// IP Address Detection
class IPDetector {
    static async getPublicIP() {
        try {
            // Try multiple services for reliability
            const services = [
                'https://api.ipify.org?format=json',
                'https://ipapi.co/json/',
                'https://httpbin.org/ip'
            ];

            for (const service of services) {
                try {
                    const response = await fetch(service);
                    const data = await response.json();
                    
                    // Different services return IP in different formats
                    return data.ip || data.origin || data.query || 'unknown';
                } catch (e) {
                    continue;
                }
            }
            
            return 'unknown';
        } catch (error) {
            console.error('IP detection error:', error);
            return 'unknown';
        }
    }
}

// Token Storage Manager
class TokenStorage {
    static setToken(token) {
        localStorage.setItem('streaming_access_token', token);
        sessionStorage.setItem('streaming_access_token', token);
    }

    static getToken() {
        return localStorage.getItem('streaming_access_token') || 
               sessionStorage.getItem('streaming_access_token');
    }

    static removeToken() {
        localStorage.removeItem('streaming_access_token');
        sessionStorage.removeItem('streaming_access_token');
        localStorage.removeItem('device_fingerprint');
        sessionStorage.removeItem('device_fingerprint');
    }

    static setDeviceFingerprint(fingerprint) {
        localStorage.setItem('device_fingerprint', fingerprint);
        sessionStorage.setItem('device_fingerprint', fingerprint);
    }

    static getDeviceFingerprint() {
        return localStorage.getItem('device_fingerprint') || 
               sessionStorage.getItem('device_fingerprint');
    }
}

// Network Status Monitor
class NetworkMonitor {
    constructor() {
        this.isOnline = navigator.onLine;
        this.callbacks = [];
        
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.notifyCallbacks('online');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.notifyCallbacks('offline');
        });
    }
    
    onStatusChange(callback) {
        this.callbacks.push(callback);
    }
    
    notifyCallbacks(status) {
        this.callbacks.forEach(callback => callback(status));
    }
    
    getStatus() {
        return this.isOnline ? 'online' : 'offline';
    }
}

// Error Handler
class ErrorHandler {
    static handle(error, context = '') {
        console.error(`Error in ${context}:`, error);
        
        // Determine error type and user-friendly message
        let userMessage = 'Terjadi kesalahan yang tidak diketahui.';
        
        if (error.message.includes('Failed to fetch')) {
            userMessage = 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
        } else if (error.message.includes('HTTP 401')) {
            userMessage = 'Token akses tidak valid atau sudah kedaluwarsa.';
        } else if (error.message.includes('HTTP 403')) {
            userMessage = 'Akses ditolak. Token sudah digunakan di perangkat lain.';
        } else if (error.message.includes('HTTP 404')) {
            userMessage = 'Layanan tidak ditemukan. Silakan hubungi admin.';
        } else if (error.message.includes('HTTP 500')) {
            userMessage = 'Terjadi kesalahan server. Silakan coba lagi nanti.';
        } else if (error.message.includes('timeout')) {
            userMessage = 'Koneksi timeout. Silakan coba lagi.';
        }
        
        return {
            originalError: error,
            userMessage: userMessage,
            context: context
        };
    }
}

// Export for use in other files
window.StreamingAPI = StreamingAPI;
window.DeviceFingerprint = DeviceFingerprint;
window.IPDetector = IPDetector;
window.TokenStorage = TokenStorage;
window.NetworkMonitor = NetworkMonitor;
window.ErrorHandler = ErrorHandler;

