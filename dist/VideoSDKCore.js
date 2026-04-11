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
        this.initiators = new Set();
        this.roomId = null;
        this.localStream = null;
        this.screenStream = null;
        this.isScreenSharing = false;
        this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();
        localStorage.setItem("vsdk_id", this.myId);
    }
    // ---------------- LOCAL MEDIA ----------------
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
            };
            this.state.localStream = this.localStream;
        });
    }
    // ---------------- CONNECT ----------------
    connect(roomId, name) {
        return __awaiter(this, void 0, void 0, function* () {
            this.roomId = roomId;
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
                this.ws.onmessage = (e) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handle(JSON.parse(e.data));
                });
                this.ws.onerror = reject;
            });
        });
    }
    // ---------------- SIGNAL HANDLER ----------------
    handle(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            if (msg.sender === this.myId)
                return;
            switch (msg.type) {
                case "EXISTING_USERS":
                    for (const p of msg.participants || []) {
                        if (!(p === null || p === void 0 ? void 0 : p.id) || p.id === this.myId)
                            continue;
                        this.state.addParticipant(p);
                        (_b = (_a = this.events).onUserJoined) === null || _b === void 0 ? void 0 : _b.call(_a, p);
                        yield this.createOffer(p.id);
                    }
                    break;
                case "USER_JOINED": {
                    const p = msg.participant;
                    if (!(p === null || p === void 0 ? void 0 : p.id) || p.id === this.myId)
                        return;
                    this.state.addParticipant(p);
                    (_d = (_c = this.events).onUserJoined) === null || _d === void 0 ? void 0 : _d.call(_c, p);
                    break;
                }
                case "OFFER":
                    yield this.handleOffer(msg.payload, msg.sender);
                    break;
                case "ANSWER": {
                    const pc = this.peers[msg.sender];
                    if (!pc)
                        return;
                    if (pc.signalingState !== "have-local-offer")
                        return;
                    yield pc.setRemoteDescription({
                        type: "answer",
                        sdp: msg.payload,
                    });
                    break;
                }
                case "ICE":
                    try {
                        yield ((_e = this.peers[msg.sender]) === null || _e === void 0 ? void 0 : _e.addIceCandidate(JSON.parse(msg.payload)));
                    }
                    catch (err) {
                        console.warn("ICE error:", err);
                    }
                    break;
                case "USER_LEFT":
                    this.closePeer(msg.peerId);
                    this.state.removeParticipant(msg.peerId);
                    (_g = (_f = this.events).onUserLeft) === null || _g === void 0 ? void 0 : _g.call(_f, msg.peerId);
                    break;
            }
        });
    }
    // ---------------- PEER CREATION ----------------
    createPeer(id) {
        if (!this.localStream) {
            throw new Error("No local stream");
        }
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        // add tracks
        this.localStream.getTracks().forEach((track) => {
            const sender = pc.addTrack(track, this.localStream);
            if (track.kind === "video") {
                pc._videoSender = sender;
            }
        });
        // incoming stream
        pc.ontrack = (e) => {
            var _a, _b;
            this.state.setStream(id, e.streams[0]);
            (_b = (_a = this.events).onTrack) === null || _b === void 0 ? void 0 : _b.call(_a, e.streams[0], id);
        };
        // ICE
        pc.onicecandidate = (e) => {
            if (!e.candidate)
                return;
            this.send({
                type: "ICE",
                payload: JSON.stringify(e.candidate),
                sender: this.myId,
                target: id,
            });
        };
        return pc;
    }
    // ---------------- OFFER ----------------
    createOffer(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.initiators.has(id))
                return;
            this.initiators.add(id);
            if (!this.peers[id]) {
                this.peers[id] = this.createPeer(id);
            }
            const pc = this.peers[id];
            if (pc.signalingState !== "stable")
                return;
            const offer = yield pc.createOffer();
            yield pc.setLocalDescription(offer);
            this.send({
                type: "OFFER",
                payload: offer.sdp,
                sender: this.myId,
                target: id,
            });
        });
    }
    // ---------------- ANSWER ----------------
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
                payload: answer.sdp,
                sender: this.myId,
                target: id,
            });
        });
    }
    // ---------------- SCREEN SHARE ----------------
    startScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.localStream)
                throw new Error("No local stream");
            this.screenStream = yield navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            const screenTrack = this.screenStream.getVideoTracks()[0];
            for (const pc of Object.values(this.peers)) {
                const sender = pc._videoSender;
                if (sender) {
                    yield sender.replaceTrack(screenTrack);
                }
            }
            this.isScreenSharing = true;
            screenTrack.onended = () => {
                this.stopScreenShare();
            };
            yield this.renegotiateAllPeers();
        });
    }
    stopScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.localStream)
                return;
            const cameraTrack = this.localStream
                .getVideoTracks()
                .find((t) => t.readyState === "live");
            if (!cameraTrack)
                return;
            for (const pc of Object.values(this.peers)) {
                const sender = pc._videoSender;
                if (sender) {
                    yield sender.replaceTrack(cameraTrack);
                }
            }
            (_a = this.screenStream) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((t) => t.stop());
            this.screenStream = null;
            this.isScreenSharing = false;
        });
    }
    // force sync peers after screen change
    renegotiateAllPeers() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const id of Object.keys(this.peers)) {
                this.initiators.delete(id);
                yield this.createOffer(id);
            }
        });
    }
    // ---------------- CLOSE PEER ----------------
    closePeer(id) {
        var _a;
        (_a = this.peers[id]) === null || _a === void 0 ? void 0 : _a.close();
        delete this.peers[id];
        this.initiators.delete(id);
        this.state.removeStream(id);
    }
    // ---------------- SEND ----------------
    send(msg) {
        var _a;
        (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(msg));
    }
}
