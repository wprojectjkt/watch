// Real-time Private Streaming Website with WebSocket Support
class PrivateStreamingApp {
    constructor() {
        this.token = null;
        this.deviceFingerprint = null;
        this.socket = null;
        this.isConnected = false;
        this.viewerCount = 0;
        this.username = null;
        this.hls = null; // Add HLS instance here
        
        this.init();
    }
    
    init() {
        // Get token from URL
        this.token = this.getTokenFromURL();
        if (!this.token) {
            this.showError("Token akses tidak ditemukan dalam URL.");
            return;
        }
        
        // Generate device fingerprint
        this.deviceFingerprint = this.generateDeviceFingerprint();
        
        // Initialize UI
        this.initializeUI();
        
        // Validate token and start app
        this.validateTokenAndStart();
    }
    
    getTokenFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get("token");
    }
    
    generateDeviceFingerprint() {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillText("Device fingerprint", 2, 2);
        
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + "x" + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL()
        ].join("|");
        
        return btoa(fingerprint).substring(0, 32);
    }
    
    initializeUI() {
        // Set username from localStorage or generate random
        this.username = localStorage.getItem("streaming_username") || this.generateUsername();
        localStorage.setItem("streaming_username", this.username);
        
        // Initialize viewer count display
        this.updateViewerCount(0);
        
        // Initialize chat
        this.initializeChat();
        
        // Add event listeners
        this.addEventListeners();

        // Close error modal
        document.getElementById("closeError").addEventListener("click", () => {
            this.hideError();
        });
    }
    
    generateUsername() {
        const adjectives = ["Cool", "Smart", "Fast", "Bright", "Happy", "Lucky", "Strong", "Wise"];
        const nouns = ["Viewer", "User", "Guest", "Friend", "Fan", "Watcher"];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 1000);
        return `${adj}${noun}${num}`;
    }
    
    initializeChat() {
        const chatInput = document.getElementById("chatInput");
        const sendButton = document.getElementById("sendButton");
        
        if (chatInput && sendButton) {
            chatInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            sendButton.addEventListener("click", () => {
                this.sendMessage();
            });
        }
        
        // Add system message
        this.addChatMessage("System", "Selamat datang di live streaming!", true);
    }
    
    addEventListeners() {
        // Handle page visibility change
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.handlePageHidden();
            } else {
                this.handlePageVisible();
            }
        });
        
        // Handle page unload
        window.addEventListener("beforeunload", () => {
            this.disconnect();
        });
        
        // Handle connection errors
        window.addEventListener("online", () => {
            this.handleConnectionRestored();
        });
        
        window.addEventListener("offline", () => {
            this.handleConnectionLost();
        });
    }
    
    async validateTokenAndStart() {
        try {
            this.showLoadingOverlay("Memvalidasi token akses...");
            
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/validate-token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                })
            });
            
            const result = await response.json();
            
            if (result.valid) {
                await this.markTokenUsed();
                await this.loadStream();
                this.connectWebSocket();
            } else {
                this.showError(result.error || "Token tidak valid.");
            }
        } catch (error) {
            console.error("Token validation error:", error);
            this.showError("Kesalahan jaringan. Periksa koneksi internet Anda.");
        }
    }
    
    async markTokenUsed() {
        try {
            await fetch(`${API_CONFIG.BOT_API_URL}/mark-token-used`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint,
                    ip_address: "client_ip"
                })
            });
        } catch (error) {
            console.error("Mark token used error:", error);
        }
    }
    
    async loadStream() {
        try {
            this.showLoadingOverlay("Memuat stream...");
            
            const response = await fetch(`${API_CONFIG.BOT_API_URL}/get-m3u-links`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                })
            });
            
            const result = await response.json();
            
            if (result.success && result.links && result.links.length > 0) {
                const streamUrl = result.links[0].url;
                this.initializeVideoPlayer(streamUrl);
            } else {
                this.showError("Tidak ada stream yang tersedia.");
            }
        } catch (error) {
            console.error("Load stream error:", error);
            this.showError("Gagal memuat stream.");
        }
    }
    
    initializeVideoPlayer(streamUrl) {
        const video = document.getElementById("videoPlayer");
        if (!video) {
            this.showError("Video player tidak ditemukan.");
            return;
        }
        
        if (Hls.isSupported()) {
            this.hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });
            
            this.hls.loadSource(streamUrl);
            this.hls.attachMedia(video);
            
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log("HLS stream loaded successfully");
                // Only hide overlay and setup events when video is actually playing
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                console.error("HLS error:", data);
                if (data.fatal) {
                    this.showError("Stream error: " + data.details);
                }
            });

            // Listen for the 'playing' event to hide the loading overlay
            video.addEventListener("playing", () => {
                console.log("Video is playing, hiding overlay.");
                this.hideLoadingOverlay();
                this.setupVideoEvents(video);
            });

            // If video can't autoplay, show play button
            video.play().catch(error => {
                console.log("Auto-play prevented:", error);
                this.showPlayButton();
            });

        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            // Native HLS support (Safari)
            video.src = streamUrl;
            video.addEventListener("loadedmetadata", () => {
                console.log("Native HLS stream loaded successfully");
                // Only hide overlay and setup events when video is actually playing
            });

            video.addEventListener("playing", () => {
                console.log("Native video is playing, hiding overlay.");
                this.hideLoadingOverlay();
                this.setupVideoEvents(video);
            });

            video.play().catch(error => {
                console.log("Native auto-play prevented:", error);
                this.showPlayButton();
            });

        } else {
            this.showError("Browser Anda tidak mendukung HLS streaming.");
        }
    }
    
    setupVideoEvents(video) {
        // Disable seeking for live streams
        video.addEventListener("seeking", (e) => {
            // Allow seeking only in the last 30 seconds for live streams
            // Or, if it's a VOD, allow full seeking
            if (video.duration && !isNaN(video.duration) && video.duration > 0 && (video.duration - video.currentTime > 30)) {
                e.preventDefault(); // Prevent seeking if it's a live stream and not near end
                video.currentTime = video.duration - 1; // Jump to near live edge
            }
        });
        
        // Handle play/pause
        video.addEventListener("play", () => {
            this.updatePlayButton(false);
        });
        
        video.addEventListener("pause", () => {
            this.updatePlayButton(true);
        });
    }
    
    connectWebSocket() {
        try {
            // Use Socket.IO client
            this.socket = io(API_CONFIG.BOT_API_URL, {
                transports: ["websocket", "polling"],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            this.socket.on("connect", () => {
                console.log("WebSocket connected");
                this.isConnected = true;
                this.updateConnectionStatus(true);
                
                // Join stream
                this.socket.emit("join_stream", {
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                });
            });
            
            this.socket.on("disconnect", () => {
                console.log("WebSocket disconnected");
                this.isConnected = false;
                this.updateConnectionStatus(false);
            });
            
            this.socket.on("joined_stream", (data) => {
                console.log("Joined stream:", data);
                this.addChatMessage("System", `Anda bergabung dengan ${data.viewer_count} penonton lainnya.`, true);
                this.startHeartbeat();
            });
            
            this.socket.on("viewer_count_update", (data) => {
                this.updateViewerCount(data.count);
            });
            
            this.socket.on("new_message", (data) => {
                this.addChatMessage(data.username, data.message, false, data.timestamp);
            });
            
            this.socket.on("error", (data) => {
                console.error("WebSocket error:", data);
                this.addChatMessage("System", `Error: ${data.message}`, true);
            });
            
            this.socket.on("connect_error", (error) => {
                console.error("WebSocket connection error:", error);
                this.updateConnectionStatus(false);
            });
            
        } catch (error) {
            console.error("WebSocket initialization error:", error);
            this.updateConnectionStatus(false);
        }
    }
    
    startHeartbeat() {
        // Send heartbeat every 15 seconds
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.isConnected) {
                this.socket.emit("heartbeat");
            }
        }, 15000);
    }
    
    sendMessage() {
        const chatInput = document.getElementById("chatInput");
        if (!chatInput || !this.socket || !this.isConnected) return;
        
        const message = chatInput.value.trim();
        if (!message) return;
        
        if (message.length > 200) {
            this.showError("Pesan terlalu panjang (maksimal 200 karakter).");
            return;
        }
        
        this.socket.emit("send_message", {
            username: this.username,
            message: message
        });
        
        chatInput.value = "";
    }
    
    addChatMessage(username, message, isSystem = false, timestamp = null) {
        const chatMessages = document.getElementById("chatMessages");
        if (!chatMessages) return;
        
        const messageElement = document.createElement("div");
        messageElement.className = `chat-message ${isSystem ? "system-message" : ""}`;
        
        const timeStr = timestamp || new Date().toLocaleTimeString("id-ID", { 
            hour: "2-digit", 
            minute: "2-digit" 
        });
        
        if (isSystem) {
            messageElement.innerHTML = `
                <div class="message-content system">
                    <span class="message-text">${this.escapeHtml(message)}</span>
                    <span class="message-time">${timeStr}</span>
                </div>
            `;
        } else {
            const isOwnMessage = username === this.username;
            messageElement.innerHTML = `
                <div class="message-content ${isOwnMessage ? "own-message" : ""}">
                    <div class="message-header">
                        <span class="username">${this.escapeHtml(username)}</span>
                        <span class="message-time">${timeStr}</span>
                    </div>
                    <div class="message-text">${this.escapeHtml(message)}</div>
                </div>
            `;
        }
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Remove old messages if too many
        while (chatMessages.children.length > 100) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
    }
    
    updateViewerCount(count) {
        this.viewerCount = count;
        const viewerCountElement = document.getElementById("viewerCount");
        if (viewerCountElement) {
            viewerCountElement.textContent = count;
        }
        
        // Update page title
        document.title = `Private Stream (${count} penonton)`;
    }
    
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById("connectionStatus");
        if (statusElement) {
            statusElement.className = `connection-status ${connected ? "connected" : "disconnected"}`;
            statusElement.textContent = connected ? "Terhubung" : "Terputus";
        }
    }
    
    updatePlayButton(show) {
        const playButton = document.getElementById("playButton");
        if (playButton) {
            playButton.style.display = show ? "block" : "none";
        }
    }
    
    showPlayButton() {
        const playButton = document.getElementById("playButton");
        if (playButton) {
            playButton.style.display = "block";
            playButton.onclick = () => {
                const video = document.getElementById("videoPlayer");
                if (video) {
                    video.play();
                    playButton.style.display = "none";
                }
            };
        }
    }
    
    showLoadingOverlay(message) {
        const overlay = document.getElementById("loadingOverlay");
        const loadingText = document.getElementById("loadingText");
        
        if (overlay && loadingText) {
            loadingText.textContent = message;
            overlay.style.display = "flex";
        }
    }
    
    hideLoadingOverlay() {
        const overlay = document.getElementById("loadingOverlay");
        if (overlay) {
            overlay.style.display = "none";
        }
    }
    
    showError(message) {
        const modal = document.getElementById("errorModal");
        const errorMessage = document.getElementById("errorMessage");
        
        if (modal && errorMessage) {
            errorMessage.textContent = message;
            modal.classList.add("show"); // Use class for showing modal
        }
    }
    
    hideError() {
        const modal = document.getElementById("errorModal");
        if (modal) {
            modal.classList.remove("show"); // Use class for hiding modal
        }
    }
    
    handlePageHidden() {
        // Reduce heartbeat frequency when page is hidden
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = setInterval(() => {
                if (this.socket && this.isConnected) {
                    this.socket.emit("heartbeat");
                }
            }, 30000); // 30 seconds when hidden
        }
    }
    
    handlePageVisible() {
        // Restore heartbeat frequency when page is visible
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.startHeartbeat(); // Restart with original frequency
        }
    }

    escapeHtml(text) {
    if (!text) return "";
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Initialize the app when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    window.streamingApp = new PrivateStreamingApp();
});
