var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class VideoSDKCore {
    constructor(url, state, events = {}) {
        this.url = url;
        this.state = state;
        this.events = events;
        this.ws = null;
        this.peers = {};
        this.roomId = null;
        this.localStream = null;
        this.screenStream = null;
        this.isScreenSharing = false;
        this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();
        localStorage.setItem("vsdk_id", this.myId);
    }
    // ---------------- LOCAL INIT ----------------
    initLocal(video, name) {
        return __awaiter(this, void 0, void 0, function* () {
            this.localStream = yield navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            video.srcObject = this.localStream;
            this.state.localParticipant = {
                id: this.myId,
                name,
                media: {
                    cameraStream: this.localStream,
                    screenStream: null,
                    micEnabled: true,
                    camEnabled: true,
                    isScreenSharing: false,
                },
            };
        });
    }
    // ---------------- CONNECT ----------------
    connect(roomId, name) {
        return __awaiter(this, void 0, void 0, function* () {
            this.roomId = roomId;
            this.reset();
            return new Promise((resolve, reject) => {
                this.ws = new WebSocket(this.url);
                this.ws.onopen = () => {
                    this.send({
                        type: "JOIN",
                        room_id: roomId,
                        user_id: this.myId,
                        sender_name: name,
                    });
                    resolve();
                };
                this.ws.onerror = reject;
                this.ws.onmessage = (e) => this.handle(JSON.parse(e.data));
            });
        });
    }
    // ---------------- RESET ----------------
    reset() {
        Object.values(this.peers).forEach((pc) => pc.close());
        this.peers = {};
        this.state.reset();
    }
    // ---------------- SIGNAL HANDLER ----------------
    handle(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (msg.sender === this.myId)
                return;
            switch (msg.type) {
                case "EXISTING_USERS":
                    for (const p of msg.participants || []) {
                        this.addParticipant(p);
                        yield this.createOffer(p.id);
                    }
                    break;
                case "USER_JOINED":
                    this.addParticipant(msg.participant);
                    break;
                case "USER_LEFT":
                    this.handleUserLeft(msg.participant);
                    break;
                case "OFFER":
                    yield this.handleOffer(msg.payload, msg.sender);
                    break;
                case "ANSWER":
                    yield this.handleAnswer(msg);
                    break;
                case "ICE":
                    yield this.handleIce(msg);
                    break;
                case "CHAT_MESSAGE": {
                    let newMsg = msg.data;
                    this.state.addMessage({
                        id: newMsg.id,
                        sender: newMsg.sender_id,
                        name: newMsg.sender_name,
                        message: newMsg.message,
                        timestamp: newMsg.timestamp,
                        target: newMsg.target,
                    });
                    (_b = (_a = this.events).onMessage) === null || _b === void 0 ? void 0 : _b.call(_a, newMsg);
                    break;
                }
                case "SCREEN_SHARE_START": {
                    const p = this.state.getParticipant(msg.sender);
                    if (p) {
                        p.media.isScreenSharing = true;
                    }
                    break;
                }
                case "SCREEN_SHARE_STOP": {
                    const p = this.state.getParticipant(msg.sender);
                    if (p) {
                        p.media.isScreenSharing = false;
                    }
                    break;
                }
            }
        });
    }
    // ---------------- PEER ----------------
    createPeer(id) {
        var _a;
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        // add local tracks
        (_a = this.localStream) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((track) => {
            pc.addTrack(track, this.localStream);
        });
        // ---------------- ON TRACK ----------------
        pc.ontrack = (event) => {
            var _a, _b, _c, _d;
            console.log("Track", event);
            const stream = event.streams[0];
            const participant = this.state.getParticipant(id);
            if (!participant)
                return;
            if (participant.media.isScreenSharing) {
                this.state.setScreenStream(id, stream);
                (_b = (_a = this.events).onTrack) === null || _b === void 0 ? void 0 : _b.call(_a, id, "screen");
                return;
            }
            this.state.setCameraStream(id, stream);
            (_d = (_c = this.events).onTrack) === null || _d === void 0 ? void 0 : _d.call(_c, id, "camera");
        };
        // ICE
        pc.onicecandidate = (e) => {
            if (!e.candidate)
                return;
            this.send({
                type: "ICE",
                sender: this.myId,
                target: id,
                payload: JSON.stringify(e.candidate),
            });
        };
        return pc;
    }
    // ---------------- OFFER ----------------
    createOffer(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peers[id]) {
                this.peers[id] = this.createPeer(id);
            }
            const pc = this.peers[id];
            const offer = yield pc.createOffer();
            yield pc.setLocalDescription(offer);
            this.send({
                type: "OFFER",
                sender: this.myId,
                target: id,
                payload: offer.sdp,
            });
        });
    }
    handleOffer(sdp, id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peers[id]) {
                this.peers[id] = this.createPeer(id);
            }
            const pc = this.peers[id];
            yield pc.setRemoteDescription({
                type: "offer",
                sdp,
            });
            const answer = yield pc.createAnswer();
            yield pc.setLocalDescription(answer);
            this.send({
                type: "ANSWER",
                sender: this.myId,
                target: id,
                payload: answer.sdp,
            });
        });
    }
    handleAnswer(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            const pc = this.peers[msg.sender];
            if (!pc)
                return;
            yield pc.setRemoteDescription({
                type: "answer",
                sdp: msg.payload,
            });
        });
    }
    handleIce(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield ((_a = this.peers[msg.sender]) === null || _a === void 0 ? void 0 : _a.addIceCandidate(JSON.parse(msg.payload)));
        });
    }
    // ---------------- SCREEN SHARE ----------------
    startScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            this.screenStream = yield navigator.mediaDevices.getDisplayMedia({
                video: true,
            });
            const track = this.screenStream.getVideoTracks()[0];
            this.isScreenSharing = true;
            if (this.state.localParticipant) {
                this.state.localParticipant.media.screenStream = this.screenStream;
                this.state.localParticipant.media.isScreenSharing = true;
            }
            // replace camera track (PROPER WAY)
            for (const id in this.peers) {
                const pc = this.peers[id];
                const sender = pc.getSenders().find((s) => { var _a; return ((_a = s.track) === null || _a === void 0 ? void 0 : _a.kind) === "video"; });
                yield (sender === null || sender === void 0 ? void 0 : sender.replaceTrack(track));
            }
            this.send({
                type: "SCREEN_SHARE_START",
                sender: this.myId,
            });
            track.onended = () => this.stopScreenShare();
        });
    }
    stopScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            (_a = this.screenStream) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((t) => t.stop());
            this.screenStream = null;
            this.isScreenSharing = false;
            if (this.state.localParticipant) {
                this.state.localParticipant.media.screenStream = null;
                this.state.localParticipant.media.isScreenSharing = false;
            }
            const camTrack = (_b = this.localStream) === null || _b === void 0 ? void 0 : _b.getVideoTracks()[0];
            if (camTrack) {
                for (const id in this.peers) {
                    const pc = this.peers[id];
                    const sender = pc.getSenders().find((s) => { var _a; return ((_a = s.track) === null || _a === void 0 ? void 0 : _a.kind) === "video"; });
                    yield (sender === null || sender === void 0 ? void 0 : sender.replaceTrack(camTrack));
                }
            }
            this.send({
                type: "SCREEN_SHARE_STOP",
                sender: this.myId,
            });
        });
    }
    // ---------------- HELPERS ----------------
    addParticipant(p) {
        var _a, _b;
        this.state.addParticipant({
            id: p.id,
            name: p.name,
        });
        (_b = (_a = this.events).onUserJoined) === null || _b === void 0 ? void 0 : _b.call(_a, this.state.getParticipant(p.id));
    }
    handleUserLeft(p) {
        var _a, _b, _c;
        (_a = this.peers[p.id]) === null || _a === void 0 ? void 0 : _a.close();
        delete this.peers[p.id];
        this.state.removeParticipant(p.id);
        (_c = (_b = this.events).onUserLeft) === null || _c === void 0 ? void 0 : _c.call(_b, p);
    }
    send(msg) {
        var _a;
        (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(msg));
    }
    sendChat(payload) {
        var _a, _b;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn("WS not connected");
            return;
        }
        if (!this.roomId) {
            console.warn("No roomId set");
            return;
        }
        const senderName = ((_a = this.state.localParticipant) === null || _a === void 0 ? void 0 : _a.name) || "Anonymous";
        this.send({
            type: "CHAT_MESSAGE",
            message: payload.text.trim(),
            user_id: this.myId,
            sender_name: senderName,
            room_id: this.roomId,
            payload: {
                target: payload.isPrivate ? (_b = payload === null || payload === void 0 ? void 0 : payload.replyTo) === null || _b === void 0 ? void 0 : _b.id : null,
                reply_to: (payload === null || payload === void 0 ? void 0 : payload.replyTo) || null,
            },
            client_ts: Date.now(),
        });
    }
    cleanupLocal() {
        var _a, _b;
        Object.values(this.peers).forEach((pc) => pc.close());
        this.peers = {};
        (_a = this.localStream) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((t) => t.stop());
        (_b = this.screenStream) === null || _b === void 0 ? void 0 : _b.getTracks().forEach((t) => t.stop());
        this.localStream = null;
        this.screenStream = null;
        this.state.reset();
    }
    disconnect() {
        if (!this.ws)
            return;
        this.send({
            type: "LEAVE",
            sender: this.myId,
            room_id: this.roomId,
        });
        // close socket AFTER notifying server
        this.ws.close();
        this.ws = null;
        this.cleanupLocal();
    }
}
