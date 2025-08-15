// Streaming Website Real-time Script with Advanced Device Fingerprinting
(function() {
    'use strict';

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

    // Function to show error modal
    function showError(message) {
        errorMessage.textContent = message;
        errorModal.style.display = 'flex';
    }

    // Function to hide error modal
    closeErrorButton.addEventListener('click', () => {
        errorModal.style.display = 'none';
    });

    // Get token from URL
    function getTokenFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('token');
    }

    // Generate a robust device fingerprint using multiple browser attributes
    async function getDeviceFingerprint() {
        if (deviceFingerprint) return deviceFingerprint;
        
        try {
            // Collect multiple browser and system attributes
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('Device fingerprint test', 2, 2);
            const canvasFingerprint = canvas.toDataURL();

            // WebGL fingerprint
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            let webglFingerprint = '';
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    webglFingerprint = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) + 
                                     gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            }

            // Audio context fingerprint
            let audioFingerprint = '';
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
                audioFingerprint = Array.from(frequencyData).slice(0, 30).join(',');
                
                oscillator.stop();
                audioContext.close();
            } catch (e) {
                audioFingerprint = 'audio_unavailable';
            }

            // Collect comprehensive device attributes
            const attributes = [
                navigator.userAgent,
                navigator.language,
                navigator.languages ? navigator.languages.join(',') : '',
                navigator.platform,
                navigator.cookieEnabled,
                navigator.doNotTrack,
                navigator.hardwareConcurrency || 0,
                navigator.maxTouchPoints || 0,
                screen.width,
                screen.height,
                screen.colorDepth,
                screen.pixelDepth,
                new Date().getTimezoneOffset(),
                window.devicePixelRatio || 1,
                navigator.connection ? navigator.connection.effectiveType : '',
                canvasFingerprint.slice(-50), // Last 50 chars of canvas fingerprint
                webglFingerprint,
                audioFingerprint,
                // Font detection
                document.fonts ? document.fonts.size : 0,
                // Local storage availability
                typeof(Storage) !== "undefined" ? 'storage_available' : 'no_storage',
                // Session storage availability  
                typeof(sessionStorage) !== "undefined" ? 'session_available' : 'no_session',
                // IndexedDB availability
                typeof(indexedDB) !== "undefined" ? 'indexeddb_available' : 'no_indexeddb'
            ];

            // Create hash from all attributes
            const fingerprint = await hashString(attributes.join('|'));
            deviceFingerprint = fingerprint;
            
            console.log('Generated device fingerprint:', fingerprint.substring(0, 16) + '...');
            return deviceFingerprint;
            
        } catch (error) {
            console.error('Error generating device fingerprint:', error);
            // Fallback to basic fingerprint
            const fallback = navigator.userAgent + navigator.language + screen.width + screen.height + new Date().getTimezoneOffset();
            deviceFingerprint = await hashString(fallback);
            return deviceFingerprint;
        }
    }

    // Simple hash function for creating fingerprint
    async function hashString(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Show loading overlay
    function showLoading(text = 'Memuat Stream...') {
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.style.opacity = '1';
        loadingOverlay.style.visibility = 'visible';
    }

    // Hide loading overlay
    function hideLoading() {
        loadingOverlay.style.opacity = '0';
        loadingOverlay.style.visibility = 'hidden';
        loadingOverlay.classList.add('hidden');
    }

    // Initialize HLS player
    function initHlsPlayer(m3uLink) {
        if (hls) {
            hls.destroy();
        }
        hls = new Hls();
        hls.loadSource(m3uLink);
        hls.attachMedia(videoPlayer);

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            console.log('HLS Manifest parsed. Video ready to play.');
            // Auto-play if possible
            videoPlayer.play().catch(error => {
                console.log('Auto-play prevented:', error);
                playButton.style.display = 'flex';
                hideLoading();
            });
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
            console.error('HLS Error:', data);
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        showError('Kesalahan jaringan. Periksa koneksi internet Anda.');
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        showError('Kesalahan media. Format stream tidak didukung.');
                        break;
                    default:
                        showError('Terjadi kesalahan saat memuat stream.');
                        break;
                }
                hideLoading();
            }
        });
    }

    // Validate token with device fingerprint
    async function validateToken(token) {
        try {
            const fingerprint = await getDeviceFingerprint();
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/validate-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: token,
                    device_fingerprint: fingerprint
                })
            });

            const data = await response.json();
            console.log('Token validation response:', data);
            
            if (!data.valid) {
                // Use data.error if available, otherwise fallback to data.message or a generic message
                throw new Error(data.error || data.message || 'Token tidak valid');
            }
            
            return data;
        } catch (error) {
            console.error('Token validation error:', error);
            throw error;
        }
    }

    // Mark token as used
    async function markTokenUsed(token) {
        try {
            const fingerprint = await getDeviceFingerprint();
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/mark-token-used`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: token,
                    device_fingerprint: fingerprint
                })
            });

            const data = await response.json();
            console.log('Mark token used response:', data);
            
            if (!data.success) {
                throw new Error(data.message || 'Gagal menandai token sebagai digunakan');
            }
            
            return data;
        } catch (error) {
            console.error('Mark token used error:', error);
            throw error;
        }
    }

    // Get M3U links
    async function getM3uLinks() {
        try {
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/get-m3u-links`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();
            console.log('M3U links response:', data);
            
            if (!data.success || !data.links || data.links.length === 0) {
                throw new Error('Tidak ada stream yang tersedia');
            }
            
            return data.links;
        } catch (error) {
            console.error('Get M3U links error:', error);
            throw error;
        }
    }

    // Try to load stream with failover
    async function loadStreamWithFailover(links) {
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            console.log(`Trying stream ${i + 1}/${links.length}: ${link.name}`);
            
            try {
                showLoading(`Memuat ${link.name}...`);
                
                // Test if the link is accessible
                const testResponse = await fetch(link.url, { 
                    method: 'HEAD',
                    mode: 'no-cors'
                });
                
                // Initialize HLS player with this link
                initHlsPlayer(link.url);
                currentM3uLink = link.url;
                
                // Wait for video to start playing
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout loading stream'));
                    }, 10000);
                    
                    videoPlayer.addEventListener('playing', () => {
                        clearTimeout(timeout);
                        resolve();
                    }, { once: true });
                    
                    videoPlayer.addEventListener('error', () => {
                        clearTimeout(timeout);
                        reject(new Error('Video error'));
                    }, { once: true });
                });
                
                console.log(`Successfully loaded stream: ${link.name}`);
                hideLoading();
                return;
                
            } catch (error) {
                console.error(`Failed to load stream ${link.name}:`, error);
                if (i === links.length - 1) {
                    // Last link failed
                    throw new Error('Semua stream gagal dimuat');
                }
                // Try next link
                continue;
            }
        }
    }

    // Initialize Socket.IO connection
    function initSocket() {
        if (socket) {
            socket.disconnect();
        }

        socket = io(API_CONFIG.BOT_API_URL, {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Socket connected');
            updateConnectionStatus('connected');
            
            // Join stream room
            socket.emit('join_stream', {
                token: currentToken
            });
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            updateConnectionStatus('disconnected');
        });

        socket.on('viewer_count', (data) => {
            updateViewerCount(data.count);
        });

        socket.on('new_message', (data) => {
            addChatMessage(data.username, data.message, data.timestamp);
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            showError('Koneksi real-time terputus');
        });

        // Send heartbeat every 30 seconds
        setInterval(() => {
            if (socket && socket.connected) {
                socket.emit('heartbeat', {
                    token: currentToken,
                    timestamp: Date.now()
                });
            }
        }, 30000);
    }

    // Update connection status
    function updateConnectionStatus(status) {
        if (connectionStatus) {
            connectionStatus.textContent = status === 'connected' ? 'Terhubung' : 'Terputus';
            connectionStatus.className = `connection-status ${status}`;
        }
    }

    // Update viewer count
    function updateViewerCount(count) {
        if (viewerCountElement) {
            viewerCountElement.textContent = count;
        }
    }

    // Add chat message
    function addChatMessage(username, message, timestamp) {
        if (!chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        const time = new Date(timestamp).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Escape HTML to prevent XSS
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
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Send chat message
    function sendChatMessage() {
        if (!chatInput || !socket || !socket.connected) return;
        
        const message = chatInput.value.trim();
        if (!message) return;
        
        socket.emit('send_message', {
            token: currentToken,
            message: message,
            timestamp: Date.now()
        });
        
        chatInput.value = '';
    }

    // Event listeners
    if (playButton) {
        playButton.addEventListener('click', () => {
            videoPlayer.play().then(() => {
                playButton.style.display = 'none';
                isPlaying = true;
            }).catch(error => {
                console.error('Play error:', error);
                showError('Gagal memutar video');
            });
        });
    }

    if (sendButton) {
        sendButton.addEventListener('click', sendChatMessage);
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }

    // Video event listeners
    videoPlayer.addEventListener('playing', () => {
        console.log('Video started playing');
        hideLoading();
        playButton.style.display = 'none';
        isPlaying = true;
    });

    videoPlayer.addEventListener('pause', () => {
        isPlaying = false;
    });

    videoPlayer.addEventListener('error', (e) => {
        console.error('Video error:', e);
        hideLoading();
        showError('Terjadi kesalahan saat memutar video');
    });

    // Main initialization function
    async function initializeApp() {
        try {
            showLoading('Memvalidasi akses...');
            
            // Get token from URL
            currentToken = getTokenFromUrl();
            if (!currentToken) {
                throw new Error('Token tidak ditemukan dalam URL');
            }

            console.log('Initializing with token:', currentToken.substring(0, 8) + '...');

            // Validate token
            const validationResult = await validateToken(currentToken);
            console.log('Token validation successful');

            // Mark token as used
            await markTokenUsed(currentToken);
            console.log('Token marked as used');

            // Get M3U links
            showLoading('Mengambil daftar stream...');
            const m3uLinks = await getM3uLinks();
            console.log('M3U links retrieved:', m3uLinks.length);

            // Load stream with failover
            await loadStreamWithFailover(m3uLinks);
            console.log('Stream loaded successfully');

            // Initialize Socket.IO for real-time features
            initSocket();
            
        } catch (error) {
            console.error('Initialization error:', error);
            showError(error.message || 'Gagal menginisialisasi aplikasi');
            hideLoading();
        }
    }

    // Start the application when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // Expose some functions globally for debugging
    window.streamingApp = {
        getDeviceFingerprint,
        validateToken,
        markTokenUsed,
        getM3uLinks,
        updateViewerCount,
        disconnect: () => {
            if (socket) socket.disconnect();
            if (hls) hls.destroy();
        }
    };

})();
