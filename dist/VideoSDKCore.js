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
        this.screenSenders = {};
        this.offerLocks = new Set();
        this.roomId = null;
        this.localStream = null;
        this.screenStream = null;
        this.isScreenSharing = false;
        this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();
        localStorage.setItem("vsdk_id", this.myId);
    }
    // ---------------- LOCAL ----------------
    initLocal(video, name) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("[SDK] init local");
            this.localStream = yield navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            video.srcObject = this.localStream;
            this.state.localStream = this.localStream;
            this.state.localParticipant = { id: this.myId, name };
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
                    console.log("[SDK] connected");
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
        Object.values(this.peers).forEach((p) => p.close());
        this.peers = {};
        this.screenSenders = {};
        this.offerLocks.clear();
        this.state.reset();
    }
    // ---------------- HANDLE ----------------
    handle(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
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
                    if (msg.participant)
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
                // ---------------- SCREEN ----------------
                case "SCREEN_SHARE_START": {
                    const peerId = msg.peerId;
                    console.log("[SDK] 🖥 SCREEN START", peerId);
                    this.state.setMediaMode(peerId, "screen");
                    this.state.setActiveScreenPeer(peerId);
                    (_b = (_a = this.events).onScreenShareStart) === null || _b === void 0 ? void 0 : _b.call(_a, peerId);
                    break;
                }
                case "SCREEN_SHARE_STOP": {
                    const peerId = msg.peerId;
                    console.log("[SDK] 📴 SCREEN STOP", peerId);
                    this.state.setMediaMode(peerId, "camera");
                    this.state.setActiveScreenPeer(null);
                    this.state.setScreenStream(peerId, null);
                    (_d = (_c = this.events).onScreenShareStop) === null || _d === void 0 ? void 0 : _d.call(_c, peerId);
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
        // CAMERA ONLY
        (_a = this.localStream) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((t) => {
            pc.addTrack(t, this.localStream);
        });
        pc.ontrack = (event) => {
            var _a, _b, _c, _d;
            const stream = event.streams[0];
            const peerId = id;
            const activeScreen = this.state.getActiveScreenPeer();
            console.log("[SDK] 🎬 ontrack", peerId);
            // ---------------- SCREEN ----------------
            if (activeScreen === peerId) {
                console.log("[SDK] 🖥 SCREEN STREAM RECEIVED", peerId);
                (_b = (_a = this.events).onTrack) === null || _b === void 0 ? void 0 : _b.call(_a, peerId, "screen");
                return;
            }
            // ---------------- CAMERA ----------------
            if (this.state.getActiveScreenPeer() === peerId) {
                console.log("[SDK] 🚫 ignoring camera (screen active)");
                return;
            }
            console.log("[SDK] 🎥 CAMERA STREAM RECEIVED", peerId);
            this.state.setCameraStream(peerId, stream);
            (_d = (_c = this.events).onTrack) === null || _d === void 0 ? void 0 : _d.call(_c, peerId, "camera");
        };
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
            if (this.offerLocks.has(id))
                return;
            this.offerLocks.add(id);
            try {
                if (!this.peers[id])
                    this.peers[id] = this.createPeer(id);
                const pc = this.peers[id];
                const offer = yield pc.createOffer();
                yield pc.setLocalDescription(offer);
                this.send({
                    type: "OFFER",
                    sender: this.myId,
                    target: id,
                    payload: offer.sdp,
                });
            }
            finally {
                this.offerLocks.delete(id);
            }
        });
    }
    handleOffer(sdp, id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peers[id])
                this.peers[id] = this.createPeer(id);
            const pc = this.peers[id];
            yield pc.setRemoteDescription({ type: "offer", sdp });
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
    // ---------------- USER LEFT ----------------
    handleUserLeft(p) {
        var _a, _b, _c;
        (_a = this.peers[p.id]) === null || _a === void 0 ? void 0 : _a.close();
        delete this.peers[p.id];
        this.state.removeParticipant(p.id);
        this.state.setCameraStream(p.id, null);
        this.state.setScreenStream(p.id, null);
        (_c = (_b = this.events).onUserLeft) === null || _c === void 0 ? void 0 : _c.call(_b, p);
    }
    // ---------------- SCREEN SHARE ----------------
    startScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("[SDK] startScreenShare");
            this.screenStream = yield navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            const track = this.screenStream.getVideoTracks()[0];
            this.isScreenSharing = true;
            // IMPORTANT: set active screen IMMEDIATELY
            this.state.setActiveScreenPeer(this.myId);
            this.state.setScreenStream(this.myId, this.screenStream);
            for (const [id, pc] of Object.entries(this.peers)) {
                const sender = this.screenSenders[id];
                if (sender)
                    sender.replaceTrack(track);
                else
                    this.screenSenders[id] = pc.addTrack(track, this.screenStream);
                yield this.reoffer(id);
            }
            this.send({
                type: "SCREEN_SHARE_START",
                sender: this.myId,
                room_id: this.roomId,
                peerId: this.myId,
            });
            track.onended = () => this.stopScreenShare();
        });
    }
    stopScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            console.log("[SDK] stopScreenShare");
            this.state.setActiveScreenPeer(null);
            for (const [id, pc] of Object.entries(this.peers)) {
                const sender = this.screenSenders[id];
                if (sender)
                    pc.removeTrack(sender);
            }
            this.screenSenders = {};
            (_a = this.screenStream) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((t) => t.stop());
            this.screenStream = null;
            this.isScreenSharing = false;
            this.send({
                type: "SCREEN_SHARE_STOP",
                sender: this.myId,
                room_id: this.roomId,
                peerId: this.myId,
            });
        });
    }
    reoffer(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const pc = this.peers[id];
            if (!pc)
                return;
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
    // ---------------- HELPERS ----------------
    addParticipant(p) {
        var _a, _b;
        this.state.addParticipant({ id: p.id, name: p.name });
        (_b = (_a = this.events).onUserJoined) === null || _b === void 0 ? void 0 : _b.call(_a, p);
    }
    send(msg) {
        var _a;
        (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(msg));
    }
}
