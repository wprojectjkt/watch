// Real-time Private Streaming Website with WebSocket Support
class PrivateStreamingApp {
    constructor() {
        this.token = null;
        this.deviceFingerprint = null;
        this.socket = null;
        this.isConnected = false;
        this.viewerCount = 0;
        this.username = null;
        this.hls = null; // HLS instance
        this.heartbeatInterval = null; // keep interval id so we can clear it
        this.originalTitle = document.title || "Private Stream";

        this.init();
    }

    // ---------- LIFECYCLE ----------
    init() {
        // Quick sanity checks for required globals
        if (typeof API_CONFIG === "undefined" || !API_CONFIG?.BOT_API_URL) {
            console.error("API_CONFIG.BOT_API_URL is missing");
            this.showError("Konfigurasi API tidak ditemukan. Pastikan API_CONFIG.BOT_API_URL terdefinisi.");
            return;
        }
        if (typeof io === "undefined") {
            console.warn("Socket.IO client (io) tidak terdeteksi. Pastikan <script src=\"/socket.io/socket.io.js\"> dimuat.");
        }
        if (typeof Hls === "undefined") {
            console.warn("hls.js tidak terdeteksi. Untuk non-Safari, streaming HLS butuh hls.js.");
        }

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

    disconnect() {
        // Clean up resources on unload or manual call
        try {
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.clearHeartbeat();
            if (this.hls) {
                try { this.hls.destroy(); } catch (_) {}
                this.hls = null;
            }
        } catch (e) {
            console.debug("disconnect cleanup error", e);
        }
    }

    // ---------- UTILS ----------
    getTokenFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get("token");
    }

    generateDeviceFingerprint() {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        try {
            ctx.textBaseline = "top";
            ctx.font = "14px Arial";
            ctx.fillText("Device fingerprint", 2, 2);
        } catch (_) {}
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            `${screen.width}x${screen.height}`,
            new Date().getTimezoneOffset(),
            (canvas.toDataURL ? canvas.toDataURL() : "")
        ].join("|");
        return btoa(unescape(encodeURIComponent(fingerprint))).substring(0, 32);
    }

    // simple fetch with timeout helper
    async fetchJSON(url, options = {}, timeoutMs = 10000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            const text = await res.text();
            let json;
            try { json = text ? JSON.parse(text) : {}; } catch (e) { throw new Error("Respon bukan JSON valid"); }
            if (!res.ok) {
                const msg = json?.error || `HTTP ${res.status}`;
                throw new Error(msg);
            }
            return json;
        } finally {
            clearTimeout(id);
        }
    }

    // ---------- UI ----------
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
        const closeBtn = document.getElementById("closeError");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                this.hideError();
            });
        }

        // Play button
        const playButton = document.getElementById("playButton");
        if (playButton) {
            playButton.addEventListener("click", async () => {
                const video = document.getElementById("videoPlayer");
                if (video) {
                    try { await video.play(); } catch (e) { console.debug("manual play failed", e); }
                    this.updatePlayButton(false);
                }
            });
        }
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

    // ---------- AUTH & STREAM ----------
    async validateTokenAndStart() {
        try {
            this.showLoadingOverlay("Memvalidasi token akses...");

            const result = await this.fetchJSON(`${API_CONFIG.BOT_API_URL}/validate-token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                })
            });

            if (result.valid) {
                // Fire and forget; server sebaiknya membaca IP dari request, bukan dari client
                this.markTokenUsed().catch(() => {});
                await this.loadStream();
                this.connectWebSocket();
            } else {
                this.showError(result.error || "Token tidak valid.");
            }
        } catch (error) {
            console.error("Token validation error:", error);
            this.showError(error.message || "Kesalahan jaringan. Periksa koneksi internet Anda.");
        }
    }

    async markTokenUsed() {
        try {
            await this.fetchJSON(`${API_CONFIG.BOT_API_URL}/mark-token-used`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                    // ip_address: diisi di server dari IP request
                })
            });
        } catch (error) {
            console.warn("Mark token used warning:", error?.message || error);
        }
    }

    async loadStream() {
        try {
            this.showLoadingOverlay("Memuat stream...");

            const result = await this.fetchJSON(`${API_CONFIG.BOT_API_URL}/get-m3u-links`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: this.token,
                    device_fingerprint: this.deviceFingerprint
                })
            });

            if (result.success && result.links && result.links.length > 0) {
                const streamUrl = result.links[0].url;
                this.initializeVideoPlayer(streamUrl);
            } else {
                this.showError(result.error || "Tidak ada stream yang tersedia.");
            }
        } catch (error) {
            console.error("Load stream error:", error);
            this.showError(error.message || "Gagal memuat stream.");
        }
    }

    initializeVideoPlayer(streamUrl) {
        const video = document.getElementById("videoPlayer");
        if (!video) {
            this.showError("Video player tidak ditemukan.");
            return;
        }

        // clean previous instance if any
        if (this.hls) {
            try { this.hls.destroy(); } catch (_) {}
            this.hls = null;
        }

        const tryAutoplay = async () => {
            try {
                await video.play();
                this.updatePlayButton(false);
            } catch (error) {
                console.log("Auto-play prevented:", error);
                this.showPlayButton();
            }
        };

        if (window.Hls && Hls.isSupported()) {
            this.hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });

            this.hls.loadSource(streamUrl);
            this.hls.attachMedia(video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log("HLS stream loaded successfully");
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                console.error("HLS error:", data);
                if (data.fatal) {
                    this.showError("Stream error: " + data.details);
                }
            });

            video.addEventListener("playing", () => {
                console.log("Video is playing, hiding overlay.");
                this.hideLoadingOverlay();
                this.setupVideoEvents(video);
            }, { once: true });

            tryAutoplay();
        } else if (video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl")) {
            // Native HLS support (Safari)
            video.src = streamUrl;

            video.addEventListener("loadedmetadata", () => {
                console.log("Native HLS stream loaded successfully");
            }, { once: true });

            video.addEventListener("playing", () => {
                console.log("Native video is playing, hiding overlay.");
                this.hideLoadingOverlay();
                this.setupVideoEvents(video);
            }, { once: true });

            tryAutoplay();
        } else {
            this.showError("Browser Anda tidak mendukung HLS streaming.");
        }
    }

    setupVideoEvents(video) {
        // Disable seeking for live streams
        const onSeeking = (e) => {
            const dur = video.duration;
            // If duration is finite and > 0, treat as VOD; else it's live.
            const isVOD = Number.isFinite(dur) && dur > 0;
            if (!isVOD) {
                // Live: prevent seeking; jump to live edge if possible
                e.preventDefault?.();
                try {
                    if (this.hls && typeof this.hls.liveSyncPosition === "number") {
                        video.currentTime = this.hls.liveSyncPosition;
                    } else {
                        // Fallback: simply resume playing (browser keeps live edge)
                        const ct = video.seekable?.end?.(0);
                        if (typeof ct === "number") video.currentTime = ct;
                    }
                } catch (_) {}
            } else {
                // VOD: allow seeking but keep within last 30 seconds guard if desired
                if (dur - video.currentTime > 30) {
                    // optional: allow full seeking -> comment out next 2 lines if not needed
                    // e.preventDefault?.();
                    // video.currentTime = Math.max(0, dur - 1);
                }
            }
        };
        video.removeEventListener("seeking", onSeeking); // ensure single binding
        video.addEventListener("seeking", onSeeking);

        // Handle play/pause
        video.addEventListener("play", () => this.updatePlayButton(false));
        video.addEventListener("pause", () => this.updatePlayButton(true));
    }

    // ---------- WEBSOCKET ----------
    connectWebSocket() {
        try {
            if (!window.io) {
                console.error("Socket.IO client tidak ditemukan");
                return;
            }
            // Guard: close existing
            if (this.socket) {
                try { this.socket.disconnect(); } catch (_) {}
                this.socket = null;
            }

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
                this.clearHeartbeat();
            });

            this.socket.on("joined_stream", (data) => {
                console.log("Joined stream:", data);
                this.addChatMessage("System", `Anda bergabung dengan ${data?.viewer_count ?? 0} penonton lainnya.`, true);
                this.startHeartbeat();
            });

            this.socket.on("viewer_count_update", (data) => {
                this.updateViewerCount(Number(data?.count ?? 0));
            });

            this.socket.on("new_message", (data) => {
                this.addChatMessage(String(data?.username || "Anon"), String(data?.message || ""), false, data?.timestamp);
            });

            this.socket.on("error", (data) => {
                console.error("WebSocket error:", data);
                this.addChatMessage("System", `Error: ${data?.message || data}`, true);
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
        this.clearHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.isConnected) {
                this.socket.emit("heartbeat");
            }
        }, 15000);
    }

    clearHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
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
                    <span class="message-text">${this.escapeHtml(String(message))}</span>
                    <span class="message-time">${this.escapeHtml(String(timeStr))}</span>
                </div>
            `;
        } else {
            const isOwnMessage = username === this.username;
            messageElement.innerHTML = `
                <div class="message-content ${isOwnMessage ? "own-message" : ""}">
                    <div class="message-header">
                        <span class="username">${this.escapeHtml(String(username))}</span>
                        <span class="message-time">${this.escapeHtml(String(timeStr))}</span>
                    </div>
                    <div class="message-text">${this.escapeHtml(String(message))}</div>
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
            viewerCountElement.textContent = String(count);
        }
        // Update page title
        document.title = `${this.originalTitle} (${count} penonton)`;
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
        this.updatePlayButton(true);
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
        } else {
            alert(message);
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

    handleConnectionRestored() {
        this.addChatMessage("System", "Koneksi internet kembali tersambung.", true);
        if (!this.isConnected) {
            this.connectWebSocket();
        }
    }

    handleConnectionLost() {
        this.addChatMessage("System", "Koneksi internet terputus.", true);
        this.updateConnectionStatus(false);
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
        return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    window.streamingApp = new PrivateStreamingApp();
});
