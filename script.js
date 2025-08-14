// Global Variables
let hls;
let currentUser = null;
let accessToken = null;
let availableLinks = [];
let currentLinkIndex = 0;
let streamStartTime = null;
let networkMonitor;

// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const mainContainer = document.getElementById('main-container');
const videoPlayer = document.getElementById('video-player');
const videoOverlay = document.getElementById('video-overlay');
const playPauseBtn = document.getElementById('play-pause-btn');
const muteBtn = document.getElementById('mute-btn');
const volumeSlider = document.getElementById('volume-slider');
const qualitySelect = document.getElementById('quality-select');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const connectionStatus = document.getElementById('connection-status');
const errorModal = document.getElementById('error-modal');
const successModal = document.getElementById('success-modal');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');
const closeErrorBtn = document.getElementById('close-error');
const closeSuccessBtn = document.getElementById('close-success');

// Stats Elements
const viewerCount = document.getElementById('viewer-count');
const streamQuality = document.getElementById('stream-quality');
const streamDuration = document.getElementById('stream-duration');
const streamTitle = document.getElementById('stream-title');
const streamDescription = document.getElementById('stream-description');

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    setupNetworkMonitoring();
});

// Initialize the application
async function initializeApp() {
    try {
        console.log('Initializing Private Stream application...');
        
        // Show loading screen
        showLoadingScreen();
        
        // Get access token from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        accessToken = urlParams.get('token');
        
        if (!accessToken) {
            throw new Error('Token akses tidak ditemukan dalam URL.');
        }
        
        console.log('Token found, validating access...');
        
        // Validate access token
        const isValid = await validateAccessToken(accessToken);
        
        if (!isValid) {
            throw new Error('Token tidak valid atau sudah digunakan di perangkat lain.');
        }
        
        console.log('Access validated, initializing components...');
        
        // Initialize video player
        await initializeVideoPlayer();
        
        // Initialize chat
        initializeChat();
        
        // Update connection status
        updateConnectionStatus(true);
        
        // Hide loading screen and show main content
        hideLoadingScreen();
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Error initializing app:', error);
        hideLoadingScreen();
        showError(error.message || 'Terjadi kesalahan saat memuat aplikasi.');
    }
}

// Validate access token
async function validateAccessToken(token) {
    try {
        console.log('Validating access token...');
        
        // Generate device fingerprint
        const deviceFingerprint = DeviceFingerprint.generate();
        console.log('Device fingerprint generated:', deviceFingerprint);
        
        // Get public IP address
        const ipAddress = await IPDetector.getPublicIP();
        console.log('Public IP detected:', ipAddress);
        
        // Initialize API
        const api = new StreamingAPI();
        
        // Check if device is already registered for this token
        const deviceCheck = await api.checkDevice(token, deviceFingerprint);
        console.log('Device check result:', deviceCheck);
        
        if (!deviceCheck.allowed && deviceCheck.error !== 'Token not found') {
            console.error('Device not allowed:', deviceCheck.error);
            return false;
        }
        
        // Validate token with backend
        const validation = await api.validateToken(token, deviceFingerprint);
        console.log('Token validation result:', validation);
        
        if (!validation.valid) {
            console.error('Token validation failed:', validation.error);
            return false;
        }
        
        // Mark token as used and bind to this device
        const markResult = await api.markTokenUsed(token, deviceFingerprint, ipAddress);
        console.log('Mark token used result:', markResult);
        
        if (!markResult.success) {
            console.error('Failed to mark token as used:', markResult.error);
            return false;
        }
        
        // Store token and device fingerprint
        TokenStorage.setToken(token);
        TokenStorage.setDeviceFingerprint(deviceFingerprint);
        
        // Generate random username for demo
        currentUser = 'User_' + Math.random().toString(36).substr(2, 6);
        console.log('User assigned:', currentUser);
        
        return true;
        
    } catch (error) {
        console.error('Token validation error:', error);
        const errorInfo = ErrorHandler.handle(error, 'Token Validation');
        showError(errorInfo.userMessage);
        return false;
    }
}

// Initialize video player
async function initializeVideoPlayer() {
    try {
        console.log('Initializing video player...');
        
        // Get M3U links from backend
        const api = new StreamingAPI();
        const deviceFingerprint = DeviceFingerprint.generate();
        const linksResult = await api.getM3ULinks(accessToken, deviceFingerprint);
        
        console.log('M3U links result:', linksResult);
        
        if (!linksResult.success || !linksResult.links || linksResult.links.length === 0) {
            throw new Error('Tidak ada link streaming yang tersedia. Silakan hubungi admin.');
        }
        
        // Store available links for failover
        availableLinks = linksResult.links;
        currentLinkIndex = 0;
        
        console.log(`Found ${availableLinks.length} streaming links`);
        
        // Try to load the first stream
        await loadStreamWithFailover();
        
    } catch (error) {
        console.error('Error initializing video player:', error);
        const errorInfo = ErrorHandler.handle(error, 'Video Player Initialization');
        showError(errorInfo.userMessage);
    }
}

// Load stream with automatic failover
async function loadStreamWithFailover() {
    if (currentLinkIndex >= availableLinks.length) {
        throw new Error('Semua link streaming tidak tersedia. Silakan hubungi admin.');
    }
    
    const currentLink = availableLinks[currentLinkIndex];
    console.log(`Trying stream ${currentLinkIndex + 1}/${availableLinks.length}: ${currentLink.name}`);
    
    // Show video overlay
    showVideoOverlay();
    
    try {
        await loadStream(currentLink);
        console.log(`Stream loaded successfully: ${currentLink.name}`);
        
        // Update stream info
        updateStreamInfo(currentLink);
        
    } catch (error) {
        console.error(`Failed to load stream ${currentLink.name}:`, error);
        
        // Try next stream
        currentLinkIndex++;
        
        if (currentLinkIndex < availableLinks.length) {
            console.log('Trying next stream...');
            setTimeout(() => loadStreamWithFailover(), 2000); // Wait 2 seconds before trying next
        } else {
            hideVideoOverlay();
            throw new Error('Semua link streaming gagal dimuat. Silakan hubungi admin.');
        }
    }
}

// Load a specific stream
async function loadStream(link) {
    return new Promise((resolve, reject) => {
        const streamUrl = link.url;
        console.log('Loading stream URL:', streamUrl);
        
        // Clean up existing HLS instance
        if (hls) {
            hls.destroy();
            hls = null;
        }
        
        // Initialize HLS.js
        if (Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90,
                maxLoadingDelay: 4,
                maxBufferLength: 30,
                maxBufferSize: 60 * 1000 * 1000,
                maxBufferHole: 0.5
            });
            
            let manifestLoaded = false;
            let errorOccurred = false;
            
            // Set up timeout for loading
            const loadTimeout = setTimeout(() => {
                if (!manifestLoaded && !errorOccurred) {
                    errorOccurred = true;
                    hls.destroy();
                    reject(new Error('Stream loading timeout'));
                }
            }, 15000); // 15 second timeout
            
            hls.loadSource(streamUrl);
            hls.attachMedia(videoPlayer);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                if (!errorOccurred) {
                    manifestLoaded = true;
                    clearTimeout(loadTimeout);
                    console.log(`Stream manifest loaded successfully: ${link.name}`);
                    updateQualityOptions();
                    configureLivePlayer();
                    resolve();
                }
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (!errorOccurred) {
                    console.error('HLS error:', data);
                    if (data.fatal) {
                        errorOccurred = true;
                        clearTimeout(loadTimeout);
                        reject(new Error(`HLS fatal error: ${data.type}`));
                    }
                }
            });
            
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            videoPlayer.src = streamUrl;
            
            const loadTimeout = setTimeout(() => {
                reject(new Error('Native HLS loading timeout'));
            }, 15000);
            
            videoPlayer.addEventListener('loadedmetadata', function() {
                clearTimeout(loadTimeout);
                console.log(`Using native HLS support: ${link.name}`);
                configureLivePlayer();
                resolve();
            }, { once: true });
            
            videoPlayer.addEventListener('error', function() {
                clearTimeout(loadTimeout);
                reject(new Error('Native HLS loading error'));
            }, { once: true });
            
        } else {
            reject(new Error('Browser does not support HLS'));
        }
    });
}

// Configure video player for live streaming
function configureLivePlayer() {
    console.log('Configuring live player...');
    
    // Set default volume
    videoPlayer.volume = 0.7;
    volumeSlider.value = 70;

    // Hide loading overlay when video starts playing
    videoPlayer.addEventListener('playing', () => {
        console.log('Video started playing, hiding overlay');
        hideVideoOverlay();
        
        // Start stream timer
        if (!streamStartTime) {
            streamStartTime = Date.now();
            startStreamTimer();
        }
    }, { once: true });
    
    // Show overlay when video is waiting/buffering
    videoPlayer.addEventListener('waiting', () => {
        console.log('Video is buffering');
        // Don't show overlay for short buffering
        setTimeout(() => {
            if (videoPlayer.readyState < 3) {
                showVideoOverlay();
            }
        }, 2000);
    });
    
    // Hide overlay when video can play
    videoPlayer.addEventListener('canplay', () => {
        console.log('Video can play');
        hideVideoOverlay();
    });
    
    // Disable seeking for live streams
    videoPlayer.addEventListener('seeking', function(e) {
        e.preventDefault();
        videoPlayer.currentTime = videoPlayer.duration || 0;
    });
    
    // Auto-play for live streams
    videoPlayer.play().catch(error => {
        console.log('Auto-play prevented by browser:', error);
        showPlayButton();
    });
    
    // Disable right-click on video
    videoPlayer.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
    
    // Update controls
    updateLiveControls();
    
    // Monitor for stream errors
    videoPlayer.addEventListener('error', function(e) {
        console.error('Video player error:', e);
        handleStreamError();
    });
}

// Handle stream errors and attempt failover
function handleStreamError() {
    if (currentLinkIndex < availableLinks.length - 1) {
        console.log('Stream error detected, attempting failover...');
        
        // Try next stream
        currentLinkIndex++;
        showVideoOverlay();
        
        setTimeout(() => {
            loadStreamWithFailover();
        }, 2000);
    } else {
        showError('Semua link streaming bermasalah. Silakan refresh halaman atau hubungi admin.');
    }
}

// Update stream info
function updateStreamInfo(link) {
    if (streamTitle) {
        streamTitle.textContent = link.name || 'Live Streaming Session';
    }
    if (streamDescription) {
        streamDescription.textContent = `Streaming dengan prioritas ${link.priority}`;
    }
    if (streamQuality) {
        streamQuality.textContent = 'HD';
    }
}

// Start stream timer
function startStreamTimer() {
    setInterval(() => {
        if (streamStartTime && streamDuration) {
            const elapsed = Date.now() - streamStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            streamDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// Show play button when auto-play is blocked
function showPlayButton() {
    const playButton = document.createElement('div');
    playButton.className = 'live-play-button';
    playButton.innerHTML = `
        <div class="play-icon"><i class="fas fa-play"></i></div>
        <div class="play-text">Klik untuk memulai live streaming</div>
    `;
    
    playButton.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 2rem;
        border-radius: 1rem;
        text-align: center;
        cursor: pointer;
        z-index: 20;
        transition: all 0.3s ease;
    `;
    
    playButton.addEventListener('click', function() {
        videoPlayer.play();
        playButton.remove();
    });
    
    videoPlayer.parentElement.appendChild(playButton);
}

// Update quality options
function updateQualityOptions() {
    if (!hls) return;
    
    qualitySelect.innerHTML = '<option value="-1">Auto</option>';
    
    hls.levels.forEach((level, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${level.height}p (${Math.round(level.bitrate / 1000)}kbps)`;
        qualitySelect.appendChild(option);
    });
}

// Update controls for live streaming
function updateLiveControls() {
    // Update play/pause button
    const playIcon = playPauseBtn.querySelector('i');
    if (playIcon) {
        playIcon.className = videoPlayer.paused ? 'fas fa-play' : 'fas fa-pause';
    }
    
    // Disable quality selector for live streams if only one quality
    if (hls && hls.levels.length <= 1) {
        qualitySelect.disabled = true;
        qualitySelect.title = 'Kualitas otomatis untuk live streaming';
    }
}

// Initialize chat system
function initializeChat() {
    console.log('Initializing chat system...');
    
    // Add welcome message
    addChatMessage('System', 'Selamat datang di live streaming!', 'system');
    addChatMessage('System', `Anda terhubung sebagai ${currentUser}`, 'system');
    
    // Auto-scroll chat to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add chat message
function addChatMessage(username, message, type = 'user') {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    const timestamp = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    if (type === 'system') {
        messageElement.innerHTML = `
            <div class="text">${message}</div>
            <div class="timestamp">${timestamp}</div>
        `;
    } else {
        messageElement.innerHTML = `
            <div class="username">${username}</div>
            <div class="text">${message}</div>
            <div class="timestamp">${timestamp}</div>
        `;
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Animate message
    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateY(10px)';
    setTimeout(() => {
        messageElement.style.transition = 'all 0.3s ease';
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateY(0)';
    }, 10);
}

// Send chat message
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    addChatMessage(currentUser, message, 'user');
    chatInput.value = '';
    
    // Simulate response (in real implementation, this would be via WebSocket)
    setTimeout(() => {
        const responses = [
            'Terima kasih atas pesannya!',
            'Streaming berjalan lancar!',
            'Selamat menikmati acara!',
            'Jangan lupa like dan subscribe!'
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        addChatMessage('Admin', randomResponse, 'other');
    }, 1000 + Math.random() * 2000);
}

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Video player controls
    playPauseBtn.addEventListener('click', togglePlayPause);
    muteBtn.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', updateVolume);
    qualitySelect.addEventListener('change', changeQuality);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Video player events
    videoPlayer.addEventListener('play', () => {
        const playIcon = playPauseBtn.querySelector('i');
        if (playIcon) playIcon.className = 'fas fa-pause';
        updateLiveControls();
    });
    
    videoPlayer.addEventListener('pause', () => {
        const playIcon = playPauseBtn.querySelector('i');
        if (playIcon) playIcon.className = 'fas fa-play';
        updateLiveControls();
    });
    
    videoPlayer.addEventListener('volumechange', () => {
        const muteIcon = muteBtn.querySelector('i');
        if (muteIcon) {
            muteIcon.className = videoPlayer.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        }
    });
    
    // Chat controls
    sendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Modal controls
    closeErrorBtn.addEventListener('click', () => hideModal(errorModal));
    closeSuccessBtn.addEventListener('click', () => hideModal(successModal));
    
    // Prevent right-click context menu
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Prevent developer tools shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||
            (e.ctrlKey && e.shiftKey && e.key === 'C') ||
            (e.ctrlKey && e.shiftKey && e.key === 'J') ||
            (e.ctrlKey && e.key === 'U')) {
            e.preventDefault();
        }
    });
}

// Setup network monitoring
function setupNetworkMonitoring() {
    networkMonitor = new NetworkMonitor();
    
    networkMonitor.onStatusChange((status) => {
        updateConnectionStatus(status === 'online');
        
        if (status === 'offline') {
            showError('Koneksi internet terputus. Streaming akan dilanjutkan saat koneksi kembali.');
        } else {
            showSuccess('Koneksi internet kembali normal.');
        }
    });
}

// Video player control functions
function togglePlayPause() {
    if (videoPlayer.paused) {
        videoPlayer.play().catch(error => {
            console.error('Play error:', error);
            showError('Tidak dapat memutar video. Silakan refresh halaman.');
        });
    } else {
        videoPlayer.pause();
    }
}

function toggleMute() {
    videoPlayer.muted = !videoPlayer.muted;
}

function updateVolume() {
    videoPlayer.volume = volumeSlider.value / 100;
}

function changeQuality() {
    if (!hls) return;
    
    const selectedLevel = parseInt(qualitySelect.value);
    hls.currentLevel = selectedLevel;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        videoPlayer.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// UI Helper Functions
function showLoadingScreen() {
    loadingScreen.style.display = 'flex';
    mainContainer.classList.add('hidden');
}

function hideLoadingScreen() {
    loadingScreen.style.display = 'none';
    mainContainer.classList.remove('hidden');
}

function showVideoOverlay() {
    if (videoOverlay) {
        videoOverlay.classList.remove('hidden');
        videoOverlay.style.opacity = '1';
        videoOverlay.style.visibility = 'visible';
    }
}

function hideVideoOverlay() {
    if (videoOverlay) {
        videoOverlay.style.opacity = '0';
        videoOverlay.style.visibility = 'hidden';
        setTimeout(() => {
            videoOverlay.classList.add('hidden');
        }, 300);
    }
}

function showModal(modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function hideModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

function showError(message) {
    console.error('Showing error:', message);
    errorMessage.textContent = message;
    showModal(errorModal);
}

function showSuccess(message) {
    console.log('Showing success:', message);
    successMessage.textContent = message;
    showModal(successModal);
}

function updateConnectionStatus(connected) {
    const statusElement = connectionStatus.querySelector('span');
    const iconElement = connectionStatus.querySelector('i');
    
    if (connected) {
        statusElement.textContent = 'Terhubung';
        iconElement.className = 'fas fa-wifi';
        connectionStatus.style.color = 'var(--secondary-color)';
    } else {
        statusElement.textContent = 'Terputus';
        iconElement.className = 'fas fa-wifi-slash';
        connectionStatus.style.color = 'var(--danger-color)';
    }
}

// Utility functions for footer links
function showInfo() {
    showSuccess('Private Streaming Platform v2.0 - Sistem streaming pribadi dengan akses terbatas dan keamanan tinggi.');
}

function showSupport() {
    showSuccess('Untuk bantuan teknis, silakan hubungi administrator melalui Telegram bot.');
}

// Clean up on page unload
window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
});

window.addEventListener('unload', () => {
    if (hls) {
        hls.destroy();
    }
});

console.log('Private Stream script loaded successfully');

