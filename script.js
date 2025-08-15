const API_BASE_URL = 'https://streamingjkt-bot-f88553c55cf8.herokuapp.com';

// Enhanced Streaming Application with Stream Availability Check
class StreamingApp {
    constructor() {
        this.token = null;
        this.deviceFingerprint = null;
        this.socket = null;
        this.hls = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.heartbeatInterval = null;
        
        // DOM elements
        this.videoPlayer = document.getElementById("videoPlayer");
        this.playButton = document.getElementById("playButton");
        this.loadingOverlay = document.getElementById("loadingOverlay");
        this.loadingText = document.getElementById("loadingText");
        this.connectionStatus = document.getElementById("connectionStatus");
        this.viewerCount = document.getElementById("viewerCount");
        this.chatMessages = document.getElementById("chatMessages");
        this.chatInput = document.getElementById("chatInput");
        this.sendButton = document.getElementById("sendButton");
        this.errorModal = document.getElementById("errorModal");
        this.errorMessage = document.getElementById("errorMessage");
        this.deviceFingerprintElement = document.getElementById("deviceFingerprint");
        
        this.init();
    }
    
    async init() {
        try {
            this.updateLoadingText("Initializing application...");
            
            // Get token from URL
            this.token = this.getTokenFromURL();
            if (!this.token) {
                this.showError("No access token provided. Please use a valid link.");
                return;
            }
            
            console.log("Initializing with token:", this.token.substring(0, 8) + "...");
            
            // Generate device fingerprint
            this.updateLoadingText("Generating device fingerprint...");
            this.deviceFingerprint = await this.getDeviceFingerprint();
            
            if (this.deviceFingerprintElement) {
                this.deviceFingerprintElement.textContent = this.deviceFingerprint.substring(0, 16) + "...";
            }
            
            // Validate token
            this.updateLoadingText("Validating access token...");
            const isValid = await this.validateToken();
            if (!isValid) {
                return; // Error already shown in validateToken
            }
            
            // Check stream availability
            this.updateLoadingText("Checking stream availability...");
            const streamAvailable = await this.checkStreamAvailability();
            if (!streamAvailable) {
                return; // Will show appropriate message
            }
            
            // Initialize streaming
            this.updateLoadingText("Initializing stream...");
            await this.initializeStreaming();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Connect to real-time services
            this.updateLoadingText("Connecting to real-time services...");
            this.connectSocket();
            
        } catch (error) {
            console.error("Initialization error:", error);
            this.showError("Failed to initialize application: " + error.message);
        }
    }
    
    getTokenFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get("token");
    }
    
    async getDeviceFingerprint() {
        try {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            ctx.textBaseline = "top";
            ctx.font = "14px Arial";
            ctx.fillText("Device fingerprint", 2, 2);
            const canvasFingerprint = canvas.toDataURL();
            
            // Try to get audio context fingerprint (with fallback)
            let audioFingerprint = "";
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const analyser = audioContext.createAnalyser();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(analyser);
                analyser.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 1000;
                gainNode.gain.value = 0;
                
                oscillator.start();
                
                const frequencyData = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(frequencyData);
                audioFingerprint = Array.from(frequencyData).join(",");
                
                oscillator.stop();
                audioContext.close();
            } catch (audioError) {
                console.warn("Audio fingerprinting failed, using fallback:", audioError.message);
                audioFingerprint = "audio_unavailable";
            }
            
            const fingerprint = [
                navigator.userAgent,
                navigator.language,
                screen.width + "x" + screen.height,
                screen.colorDepth,
                new Date().getTimezoneOffset(),
                navigator.platform,
                navigator.cookieEnabled,
                canvasFingerprint,
                audioFingerprint,
                navigator.hardwareConcurrency || "unknown",
                navigator.deviceMemory || "unknown"
            ].join("|");
            
            // Generate SHA-256 hash
            const encoder = new TextEncoder();
            const data = encoder.encode(fingerprint);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
            
            console.log("Generated device fingerprint:", hashHex.substring(0, 16) + "...");
            return hashHex;
        } catch (error) {
            console.error("Device fingerprint generation error:", error);
            // Fallback fingerprint
            const fallback = navigator.userAgent + "|" + screen.width + "x" + screen.height + "|" + Date.now();
            const encoder = new TextEncoder();
            const data = encoder.encode(fallback);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        }
    }
    
    async validateToken() {
        try {
            const response = await fetch(`${API_BASE_URL}/validate-token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                })
            });
            
            const data = await response.json();
            console.log("Token validation response:", data);
            
            if (!data.valid) {
                // Use the error message from backend, fallback to generic message
                throw new Error(data.error || data.message || "Token tidak valid");
            }
            
            return true;
        } catch (error) {
            console.error("Token validation error:", error);
            this.showError(error.message);
            return false;
        }
    }
    
    async checkStreamAvailability() {
        try {
            const response = await fetch(`${API_BASE_URL}/get-m3u-links`);
            const data = await response.json();
            
            if (!data.success || !data.links || data.links.length === 0) {
                // Stream not available - show appropriate message
                this.showStreamNotAvailable(data.error || "Stream has not started yet. Please wait for the administrator to begin the stream.");
                return false;
            }
            
            return true;
        } catch (error) {
            console.error("Stream availability check error:", error);
            this.showStreamNotAvailable("Unable to check stream availability. Please try again later.");
            return false;
        }
    }
    
    showStreamNotAvailable(message) {
        // Hide loading overlay
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = "none";
        }
        
        // Show stream not available modal
        const modalHtml = `
            <div id="streamNotAvailableModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>
                            <i class="fas fa-clock"></i>
                            Stream Not Available
                        </h3>
                    </div>
                    <div class="modal-body">
                        <div style="text-align: center; padding: 20px;">
                            <div style="font-size: 64px; color: #ff6b6b; margin-bottom: 20px;">
                                <i class="fas fa-broadcast-tower"></i>
                            </div>
                            <h3 style="color: #333; margin-bottom: 15px;">Stream Has Not Started Yet</h3>
                            <p style="color: #666; margin-bottom: 20px;">${message}</p>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                                <p style="margin: 0; color: #495057;">
                                    <i class="fas fa-info-circle" style="color: #17a2b8;"></i>
                                    Your token is valid and ready to use. Please wait for the stream to begin.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button onclick="window.location.reload()" class="btn btn-primary">
                            <i class="fas fa-sync-alt"></i>
                            Refresh Page
                        </button>
                        <button onclick="this.parentElement.parentElement.parentElement.style.display=\'none\'" class="btn btn-secondary">
                            <i class="fas fa-times"></i>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML("beforeend", modalHtml);
        
        // Update connection status
        if (this.connectionStatus) {
            this.connectionStatus.textContent = "Stream Not Started";
            this.connectionStatus.style.color = "#ff6b6b";
        }
    }
    
    async initializeStreaming() {
        try {
            // Get M3U links
            const response = await fetch(`${API_BASE_URL}/get-m3u-links`);
            const data = await response.json();
            
            if (!data.success || !data.links || data.links.length === 0) {
                throw new Error("No stream links available");
            }
            
            const streamUrl = data.links[0].url;
            console.log("Initializing stream with URL:", streamUrl);
            
            // Initialize HLS
            if (Hls.isSupported()) {
                this.hls = new Hls({
                    debug: false,
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });
                
                this.hls.loadSource(streamUrl);
                this.hls.attachMedia(this.videoPlayer);
                
                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log("HLS manifest parsed successfully");
                    this.hideLoading();
                    this.showPlayButton();
                });
                
                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error("HLS error:", data);
                    if (data.fatal) {
                        this.handleStreamError(data);
                    }
                });
                
            } else if (this.videoPlayer.canPlayType("application/vnd.apple.mpegurl")) {
                // Native HLS support (Safari)
                this.videoPlayer.src = streamUrl;
                this.videoPlayer.addEventListener("loadedmetadata", () => {
                    console.log("Native HLS loaded successfully");
                    this.hideLoading();
                    this.showPlayButton();
                });
                
                this.videoPlayer.addEventListener("error", (e) => {
                    console.error("Native HLS error:", e);
                    this.handleStreamError(e);
                });
            } else {
                throw new Error("HLS is not supported in this browser");
            }
            
        } catch (error) {
            console.error("Stream initialization error:", error);
            this.showError("Failed to initialize stream: " + error.message);
        }
    }
    
    handleStreamError(error) {
        console.error("Stream error:", error);
        
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`Retrying stream initialization (${this.retryCount}/${this.maxRetries})...`);
            
            setTimeout(() => {
                this.initializeStreaming();
            }, 2000 * this.retryCount);
        } else {
            this.showError("Stream playback failed after multiple attempts. Please refresh the page.");
        }
    }
    
    showPlayButton() {
        if (this.playButton) {
            this.playButton.style.display = "flex";
            this.playButton.addEventListener("click", () => {
                this.playVideo();
            });
        }
    }
    
    async playVideo() {
        try {
            if (this.playButton) {
                this.playButton.style.display = "none";
            }
            
            this.videoPlayer.muted = false; // Unmute for actual playback
            await this.videoPlayer.play();
            
            console.log("Video playback started successfully");
            
            if (this.connectionStatus) {
                this.connectionStatus.textContent = "Streaming";
                this.connectionStatus.style.color = "#28a745";
            }
            
        } catch (error) {
            console.error("Video play error:", error);
            
            // If autoplay failed, show play button again
            if (this.playButton) {
                this.playButton.style.display = "flex";
            }
            
            // Show user-friendly error
            this.showError("Unable to start video playback. Please try clicking the play button again.");
        }
    }
    
    connectSocket() {
        try {
            this.socket = io(API_BASE_URL, {
                transports: ["websocket", "polling"],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 2000
            });
            
            this.socket.on("connect", () => {
                console.log("Socket connected successfully");
                this.isConnected = true;
                
                if (this.connectionStatus) {
                    this.connectionStatus.textContent = "Connected";
                    this.connectionStatus.style.color = "#28a745";
                }
                
                // Join stream room
                this.socket.emit("join_stream", {
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                });
                
                // Start heartbeat
                this.startHeartbeat();
            });
            
            this.socket.on("disconnect", () => {
                console.log("Socket disconnected");
                this.isConnected = false;
                
                if (this.connectionStatus) {
                    this.connectionStatus.textContent = "Disconnected";
                    this.connectionStatus.style.color = "#dc3545";
                }
                
                this.stopHeartbeat();
            });
            
            this.socket.on("viewer_count", (data) => {
                this.updateViewerCount(data.count);
            });
            
            this.socket.on("new_message", (data) => {
                this.addChatMessage(data.username, data.message, data.timestamp);
            });
            
            this.socket.on("error", (error) => {
                console.error("Socket error:", error);
                this.showError("Real-time connection error: " + error.message);
            });
            
        } catch (error) {
            console.error("Socket connection error:", error);
            // Don't show error for socket connection issues, as it's not critical
        }
    }
    
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.isConnected) {
                this.socket.emit("heartbeat", {
                    token: this.token
                });
            }
        }, 30000); // Every 30 seconds
    }
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    updateViewerCount(count) {
        if (this.viewerCount) {
            this.viewerCount.textContent = count;
        }
        
        // Also update chat user count
        const chatUserCount = document.getElementById("chatUserCount");
        if (chatUserCount) {
            chatUserCount.textContent = count;
        }
    }
    
    addChatMessage(username, message, timestamp) {
        if (!this.chatMessages) return;
        
        const messageElement = document.createElement("div");
        messageElement.className = "chat-message";
        
        const time = new Date(timestamp).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit"
        });
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${this.escapeHtml(username)}</span>
                <span class="timestamp">${time}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message)}</div>
        `;
        
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
    
    setupEventListeners() {
        // Chat functionality
        if (this.sendButton && this.chatInput) {
            this.sendButton.addEventListener("click", () => {
                this.sendChatMessage();
            });
            
            this.chatInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    this.sendChatMessage();
                }
            });
        }
        
        // Error modal close handlers
        const closeError = document.getElementById("closeError");
        const closeErrorBtn = document.getElementById("closeErrorBtn");
        
        if (closeError) {
            closeError.addEventListener("click", () => {
                this.hideError();
            });
        }
        
        if (closeErrorBtn) {
            closeErrorBtn.addEventListener("click", () => {
                this.hideError();
            });
        }
        
        // Video player events
        if (this.videoPlayer) {
            this.videoPlayer.addEventListener("play", () => {
                console.log("Video started playing");
            });
            
            this.videoPlayer.addEventListener("pause", () => {
                console.log("Video paused");
            });
            
            this.videoPlayer.addEventListener("error", (e) => {
                console.error("Video player error:", e);
            });
        }
    }
    
    sendChatMessage() {
        if (!this.socket || !this.isConnected || !this.chatInput) return;
        
        const message = this.chatInput.value.trim();
        if (!message) return;
        
        if (message.length > 500) {
            this.showError("Message too long. Maximum 500 characters allowed.");
            return;
        }
        
        this.socket.emit("send_message", {
            token: this.token,
            message: message
        });
        
        this.chatInput.value = "";
    }
    
    updateLoadingText(text) {
        if (this.loadingText) {
            this.loadingText.textContent = text;
        }
        console.log("Loading:", text);
    }
    
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = "none";
        }
    }
    
    showError(message) {
        console.error("Error:", message);
        
        if (this.errorMessage && this.errorModal) {
            this.errorMessage.textContent = message;
            this.errorModal.style.display = "flex";
            this.errorModal.classList.add("show");
        }
        
        // Hide loading overlay
        this.hideLoading();
    }
    
    hideError() {
        if (this.errorModal) {
            this.errorModal.style.display = "none";
            this.errorModal.classList.remove("show");
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        if (this.hls) {
            this.hls.destroy();
        }
        
        this.stopHeartbeat();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    window.streamingApp = new StreamingApp();
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
    if (window.streamingApp) {
        window.streamingApp.disconnect();
    }
});
