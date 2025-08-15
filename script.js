// Enhanced Secure Streaming Website Script with Advanced Protection
(function() {
    'use strict';

    // Security check - prevent execution in dev tools
    const securityCheck = () => {
        const start = performance.now();
        debugger;
        const end = performance.now();
        if (end - start > 100) {
            window.location.href = 'about:blank';
            return false;
        }
        return true;
    };

    if (!securityCheck()) return;

    // DOM Elements
    const videoPlayer = document.getElementById('videoPlayer');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const playButton = document.getElementById('playButton');
    const connectionStatus = document.getElementById('connectionStatus');
    const viewerCountElement = document.getElementById('viewerCount');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const errorModal = document.getElementById('errorModal');
    const errorMessage = document.getElementById('errorMessage');
    const closeErrorButton = document.getElementById('closeError');

    let hls = null;
    let socket = null;
    let currentToken = null;
    let currentM3uLink = null;
    let deviceFingerprint = null;
    let isPlaying = false;
    let securityInterval = null;

    // Enhanced security monitoring
    const initSecurity = () => {
        // Monitor for dev tools
        securityInterval = setInterval(() => {
            if (!securityCheck()) {
                clearInterval(securityInterval);
                return;
            }
            
            // Additional checks
            if (window.outerHeight - window.innerHeight > 200 || 
                window.outerWidth - window.innerWidth > 200) {
                document.body.style.filter = 'blur(10px)';
                setTimeout(() => {
                    window.location.href = 'about:blank';
                }, 2000);
            }
        }, 1000);
    };

    // Function to show error modal with enhanced styling
    function showError(message) {
        if (!errorMessage || !errorModal) return;
        
        errorMessage.textContent = message;
        errorModal.style.display = 'flex';
        errorModal.classList.add('show');
        
        // Add shake animation
        errorModal.querySelector('.modal-content').style.animation = 'shake 0.5s ease-in-out';
        
        setTimeout(() => {
            if (errorModal.querySelector('.modal-content')) {
                errorModal.querySelector('.modal-content').style.animation = '';
            }
        }, 500);
    }

    // Function to hide error modal
    const hideErrorModal = () => {
        if (errorModal) {
            errorModal.style.display = 'none';
            errorModal.classList.remove('show');
        }
    };

    if (closeErrorButton) {
        closeErrorButton.addEventListener('click', hideErrorModal);
    }

    // Get token from URL
    function getTokenFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('token');
    }

    // Enhanced device fingerprinting with additional security
    async function getDeviceFingerprint() {
        if (deviceFingerprint) return deviceFingerprint;
        
        try {
            // Security check before fingerprinting
            if (!securityCheck()) return null;
            
            // Enhanced canvas fingerprinting
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 50;
            
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Secure Stream 🔒', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Device ID Generator', 4, 35);
            
            const canvasFingerprint = canvas.toDataURL();

            // Enhanced WebGL fingerprinting
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            let webglFingerprint = '';
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    webglFingerprint = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) + 
                                     gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
                
                // Additional WebGL parameters
                webglFingerprint += gl.getParameter(gl.VERSION) + 
                                   gl.getParameter(gl.SHADING_LANGUAGE_VERSION) +
                                   gl.getParameter(gl.VENDOR) +
                                   gl.getParameter(gl.RENDERER);
            }

            // Enhanced audio fingerprinting
            let audioFingerprint = '';
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const analyser = audioContext.createAnalyser();
                const gainNode = audioContext.createGain();
                const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(10000, audioContext.currentTime);
                
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                oscillator.connect(analyser);
                analyser.connect(scriptProcessor);
                scriptProcessor.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.start(0);
                
                const frequencyData = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(frequencyData);
                audioFingerprint = Array.from(frequencyData).slice(0, 50).join(',');
                
                oscillator.stop();
                audioContext.close();
            } catch (e) {
                audioFingerprint = 'audio_unavailable_' + Date.now();
            }

            // Comprehensive device attributes
            const attributes = [
                navigator.userAgent,
                navigator.language,
                navigator.languages ? navigator.languages.join(',') : '',
                navigator.platform,
                navigator.cookieEnabled,
                navigator.doNotTrack,
                navigator.hardwareConcurrency || 0,
                navigator.maxTouchPoints || 0,
                navigator.deviceMemory || 0,
                screen.width,
                screen.height,
                screen.colorDepth,
                screen.pixelDepth,
                screen.availWidth,
                screen.availHeight,
                new Date().getTimezoneOffset(),
                window.devicePixelRatio || 1,
                navigator.connection ? navigator.connection.effectiveType : '',
                navigator.connection ? navigator.connection.downlink : '',
                canvasFingerprint.slice(-100),
                webglFingerprint,
                audioFingerprint,
                document.fonts ? document.fonts.size : 0,
                typeof(Storage) !== "undefined" ? 'storage_available' : 'no_storage',
                typeof(sessionStorage) !== "undefined" ? 'session_available' : 'no_session',
                typeof(indexedDB) !== "undefined" ? 'indexeddb_available' : 'no_indexeddb',
                window.location.protocol,
                window.location.host,
                document.documentElement.lang,
                // Additional security markers
                'secure_stream_v2',
                btoa(Date.now().toString()),
                Math.random().toString(36).substring(7)
            ];

            // Create enhanced hash
            const fingerprint = await hashString(attributes.join('|'));
            deviceFingerprint = fingerprint;
            
            console.log('🔒 Secure device fingerprint generated');
            return deviceFingerprint;
            
        } catch (error) {
            console.error('Fingerprint generation error:', error);
            // Enhanced fallback
            const fallback = navigator.userAgent + navigator.language + screen.width + 
                           screen.height + new Date().getTimezoneOffset() + 
                           Math.random().toString(36) + Date.now();
            deviceFingerprint = await hashString(fallback);
            return deviceFingerprint;
        }
    }

    // Enhanced hash function with multiple rounds
    async function hashString(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        
        // Multiple hash rounds for enhanced security
        let hashBuffer = await crypto.subtle.digest('SHA-256', data);
        for (let i = 0; i < 3; i++) {
            hashBuffer = await crypto.subtle.digest('SHA-256', hashBuffer);
        }
        
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Enhanced loading overlay with animations
    function showLoading(text = 'Memuat Stream...') {
        if (!loadingText || !loadingOverlay) return;
        
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.style.opacity = '1';
        loadingOverlay.style.visibility = 'visible';
        
        // Add pulse animation to loading text
        loadingText.style.animation = 'pulse 2s ease-in-out infinite';
    }

    // Hide loading overlay
    function hideLoading() {
        if (!loadingOverlay) return;
        
        loadingOverlay.style.opacity = '0';
        loadingOverlay.style.visibility = 'hidden';
        loadingOverlay.classList.add('hidden');
        
        if (loadingText) {
            loadingText.style.animation = '';
        }
    }

    // Enhanced HLS player initialization
    function initHlsPlayer(m3uLink) {
        if (!videoPlayer) return;
        
        if (hls) {
            hls.destroy();
        }
        
        if (Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });
            
            hls.loadSource(m3uLink);
            hls.attachMedia(videoPlayer);

            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                console.log('🎥 HLS Manifest parsed successfully');
                
                // Auto-play with enhanced error handling
                const playPromise = videoPlayer.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('🎬 Video started playing automatically');
                        hideLoading();
                        if (playButton) playButton.style.display = 'none';
                    }).catch(error => {
                        console.log('🔇 Auto-play prevented by browser:', error);
                        if (playButton) playButton.style.display = 'flex';
                        hideLoading();
                    });
                }
            });

            hls.on(Hls.Events.ERROR, function(event, data) {
                console.error('🚨 HLS Error:', data);
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            showError('❌ Kesalahan jaringan. Periksa koneksi internet Anda dan coba lagi.');
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            showError('❌ Kesalahan media. Format stream tidak didukung oleh browser Anda.');
                            break;
                        default:
                            showError('❌ Terjadi kesalahan saat memuat stream. Silakan refresh halaman.');
                            break;
                    }
                    hideLoading();
                }
            });
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            videoPlayer.src = m3uLink;
            videoPlayer.addEventListener('loadedmetadata', function() {
                console.log('🍎 Native HLS loaded');
                hideLoading();
            });
        } else {
            showError('❌ Browser Anda tidak mendukung streaming HLS. Gunakan browser modern seperti Chrome, Firefox, atau Safari.');
        }
    }

    // Enhanced token validation with retry mechanism
    async function validateToken(token, retryCount = 0) {
        try {
            if (!securityCheck()) return null;
            
            const fingerprint = await getDeviceFingerprint();
            if (!fingerprint) {
                throw new Error('Gagal menghasilkan device fingerprint');
            }
            
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/validate-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    token: token,
                    device_fingerprint: fingerprint,
                    timestamp: Date.now(),
                    security_check: btoa('secure_stream_v2')
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('✅ Token validation response received');
            
            if (!data.valid) {
                const errorMessage = data.error || data.message || 'Token tidak valid atau sudah kedaluwarsa';
                const error = new Error(errorMessage);
                error.name = 'TokenValidationError';
                throw error;
            }
            
            return data;
        } catch (error) {
            console.error('🚨 Token validation error:', error);
            
            // Retry mechanism for network errors
            if (retryCount < 2 && (error.name === 'TypeError' || error.message.includes('fetch'))) {
                console.log(`🔄 Retrying token validation (attempt ${retryCount + 2}/3)...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return validateToken(token, retryCount + 1);
            }
            
            throw error;
        }
    }

    // Enhanced mark token as used
    async function markTokenUsed(token) {
        try {
            const fingerprint = await getDeviceFingerprint();
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/mark-token-used`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    token: token,
                    device_fingerprint: fingerprint,
                    timestamp: Date.now()
                })
            });

            const data = await response.json();
            console.log('✅ Token marked as used');
            
            if (!data.success) {
                throw new Error(data.message || 'Gagal menandai token sebagai digunakan');
            }
            
            return data;
        } catch (error) {
            console.error('🚨 Mark token used error:', error);
            throw error;
        }
    }

    // Enhanced M3U links retrieval
    async function getM3uLinks() {
        try {
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/get-m3u-links`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const data = await response.json();
            console.log('📺 M3U links retrieved');
            
            if (!data.success || !data.links || data.links.length === 0) {
                throw new Error('Tidak ada stream yang tersedia saat ini');
            }
            
            return data.links;
        } catch (error) {
            console.error('🚨 Get M3U links error:', error);
            throw error;
        }
    }

    // Enhanced stream loading with failover
    async function loadStreamWithFailover(links) {
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            console.log(`🔄 Trying stream ${i + 1}/${links.length}: ${link.name}`);
            
            try {
                showLoading(`Memuat ${link.name}...`);
                
                // Test link accessibility
                const testResponse = await fetch(link.url, { 
                    method: 'HEAD',
                    mode: 'no-cors'
                });
                
                // Initialize HLS player
                initHlsPlayer(link.url);
                currentM3uLink = link.url;
                
                // Wait for video to start playing
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout loading stream'));
                    }, 15000);
                    
                    const onPlaying = () => {
                        clearTimeout(timeout);
                        videoPlayer.removeEventListener('playing', onPlaying);
                        videoPlayer.removeEventListener('error', onError);
                        resolve();
                    };
                    
                    const onError = () => {
                        clearTimeout(timeout);
                        videoPlayer.removeEventListener('playing', onPlaying);
                        videoPlayer.removeEventListener('error', onError);
                        reject(new Error('Video error'));
                    };
                    
                    videoPlayer.addEventListener('playing', onPlaying);
                    videoPlayer.addEventListener('error', onError);
                });
                
                console.log(`✅ Successfully loaded stream: ${link.name}`);
                hideLoading();
                return;
                
            } catch (error) {
                console.error(`❌ Failed to load stream ${link.name}:`, error);
                if (i === links.length - 1) {
                    throw new Error('Semua stream gagal dimuat. Silakan coba lagi nanti.');
                }
                continue;
            }
        }
    }

    // Enhanced Socket.IO initialization
    function initSocket() {
        if (socket) {
            socket.disconnect();
        }

        socket = io(API_CONFIG.BOT_API_URL, {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        socket.on('connect', () => {
            console.log('🔌 Socket connected');
            updateConnectionStatus('connected');
            
            // Join stream room with enhanced data
            socket.emit('join_stream', {
                token: currentToken,
                device_fingerprint: deviceFingerprint,
                timestamp: Date.now()
            });
        });

        socket.on('disconnect', () => {
            console.log('🔌 Socket disconnected');
            updateConnectionStatus('disconnected');
        });

        socket.on('viewer_count', (data) => {
            updateViewerCount(data.count);
        });

        socket.on('new_message', (data) => {
            addChatMessage(data.username, data.message, data.timestamp);
        });

        socket.on('error', (error) => {
            console.error('🚨 Socket error:', error);
            showError('Koneksi real-time terputus. Mencoba menghubungkan kembali...');
        });

        socket.on('reconnect', () => {
            console.log('🔌 Socket reconnected');
            updateConnectionStatus('connected');
        });

        // Enhanced heartbeat
        setInterval(() => {
            if (socket && socket.connected) {
                socket.emit('heartbeat', {
                    token: currentToken,
                    timestamp: Date.now(),
                    device_fingerprint: deviceFingerprint
                });
            }
        }, 30000);
    }

    // Enhanced connection status update
    function updateConnectionStatus(status) {
        if (!connectionStatus) return;
        
        connectionStatus.textContent = status === 'connected' ? 'Terhubung' : 'Terputus';
        connectionStatus.className = `connection-status ${status}`;
        
        // Add visual feedback
        if (status === 'connected') {
            connectionStatus.style.animation = 'pulse 2s ease-in-out infinite';
        } else {
            connectionStatus.style.animation = '';
        }
    }

    // Enhanced viewer count update
    function updateViewerCount(count) {
        if (!viewerCountElement) return;
        
        const currentCount = parseInt(viewerCountElement.textContent) || 0;
        
        // Animate count change
        if (count !== currentCount) {
            viewerCountElement.style.transform = 'scale(1.2)';
            viewerCountElement.style.color = 'var(--primary-color)';
            
            setTimeout(() => {
                viewerCountElement.textContent = count;
                viewerCountElement.style.transform = 'scale(1)';
                viewerCountElement.style.color = '';
            }, 200);
        }
    }

    // Enhanced chat message handling
    function addChatMessage(username, message, timestamp) {
        if (!chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.style.animation = 'slideInUp 0.3s ease-out';
        
        const time = new Date(timestamp).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const escapedUsername = escapeHtml(username);
        const escapedMessage = escapeHtml(message);
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${escapedUsername}</span>
                <span class="timestamp">${time}</span>
            </div>
            <div class="message-content">${escapedMessage}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Remove old messages to prevent memory issues
        const messages = chatMessages.querySelectorAll('.chat-message');
        if (messages.length > 100) {
            messages[0].remove();
        }
    }

    // Enhanced HTML escaping
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Enhanced chat message sending
    function sendChatMessage() {
        if (!chatInput || !socket || !socket.connected) return;
        
        const message = chatInput.value.trim();
        if (!message || message.length > 500) return;
        
        // Security check
        if (!securityCheck()) return;
        
        socket.emit('send_message', {
            token: currentToken,
            message: message,
            timestamp: Date.now(),
            device_fingerprint: deviceFingerprint
        });
        
        chatInput.value = '';
        
        // Visual feedback
        sendButton.style.transform = 'scale(0.95)';
        setTimeout(() => {
            sendButton.style.transform = 'scale(1)';
        }, 100);
    }

    // Enhanced event listeners
    if (playButton) {
        playButton.addEventListener('click', () => {
            if (!videoPlayer) return;
            
            const playPromise = videoPlayer.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    playButton.style.display = 'none';
                    isPlaying = true;
                    console.log('🎬 Video started playing');
                }).catch(error => {
                    console.error('❌ Play error:', error);
                    showError('Gagal memutar video. Silakan coba lagi.');
                });
            }
        });
    }

    if (sendButton) {
        sendButton.addEventListener('click', sendChatMessage);
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        
        // Character counter
        chatInput.addEventListener('input', (e) => {
            const remaining = 500 - e.target.value.length;
            if (remaining < 50) {
                e.target.style.borderColor = remaining < 10 ? 'var(--danger-color)' : 'var(--warning-color)';
            } else {
                e.target.style.borderColor = '';
            }
        });
    }

    // Enhanced video event listeners
    if (videoPlayer) {
        videoPlayer.addEventListener('playing', () => {
            console.log('🎬 Video started playing');
            hideLoading();
            if (playButton) playButton.style.display = 'none';
            isPlaying = true;
        });

        videoPlayer.addEventListener('pause', () => {
            isPlaying = false;
        });

        videoPlayer.addEventListener('error', (e) => {
            console.error('❌ Video error:', e);
            hideLoading();
            showError('Terjadi kesalahan saat memutar video. Silakan refresh halaman.');
        });

        videoPlayer.addEventListener('waiting', () => {
            console.log('⏳ Video buffering...');
        });

        videoPlayer.addEventListener('canplay', () => {
            console.log('✅ Video can play');
        });
    }

    // Enhanced main initialization function
    async function initializeApp() {
        try {
            // Security check
            if (!securityCheck()) return;
            
            // Initialize security monitoring
            initSecurity();
            
            showLoading('🔐 Memvalidasi akses...');
            
            // Get token from URL
            currentToken = getTokenFromUrl();
            if (!currentToken) {
                throw new Error('❌ Token tidak ditemukan dalam URL. Pastikan Anda mengakses link yang benar.');
            }

            console.log('🔑 Initializing with token:', currentToken.substring(0, 8) + '...');

            // Validate token with enhanced security
            showLoading('🔍 Memverifikasi token...');
            const validationResult = await validateToken(currentToken);
            console.log('✅ Token validation successful');

            // Mark token as used
            showLoading('📝 Menandai sesi...');
            await markTokenUsed(currentToken);
            console.log('✅ Token marked as used');

            // Get M3U links
            showLoading('📺 Mengambil daftar stream...');
            const m3uLinks = await getM3uLinks();
            console.log('✅ M3U links retrieved:', m3uLinks.length);

            // Load stream with failover
            showLoading('🎬 Memuat stream...');
            await loadStreamWithFailover(m3uLinks);
            console.log('✅ Stream loaded successfully');

            // Initialize Socket.IO for real-time features
            showLoading('🔌 Menghubungkan ke server...');
            initSocket();
            
            hideLoading();
            console.log('🎉 Application initialized successfully');
            
        } catch (error) {
            console.error('🚨 Initialization error:', error);
            showError(error.message);
            hideLoading();
        }
    }

    // Enhanced startup sequence
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // Enhanced global API
    window.streamingApp = {
        getDeviceFingerprint,
        validateToken,
        markTokenUsed,
        getM3uLinks,
        updateViewerCount,
        disconnect: () => {
            if (socket) socket.disconnect();
            if (hls) hls.destroy();
            if (securityInterval) clearInterval(securityInterval);
        },
        version: '2.0.0-secure'
    };

    // Final security check
    setTimeout(() => {
        if (!securityCheck()) {
            window.location.href = 'about:blank';
        }
    }, 5000);

})();
