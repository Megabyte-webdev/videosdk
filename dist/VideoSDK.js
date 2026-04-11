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
        this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();
        localStorage.setItem("vsdk_id", this.myId);
    }
    // ---------------- STREAM ----------------
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
    // ---------------- MESSAGE HANDLER ----------------
    handle(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (msg.sender === this.myId)
                return;
            switch (msg.type) {
                case "EXISTING_USERS":
                    for (const p of msg.participants || []) {
                        if (!this.state.addParticipant(p))
                            continue;
                        (_b = (_a = this.events).onUserJoined) === null || _b === void 0 ? void 0 : _b.call(_a, p);
                        yield this.createOffer(p.id);
                    }
                    break;
                case "USER_JOINED": {
                    const p = msg.participant;
                    if (!(p === null || p === void 0 ? void 0 : p.id))
                        return;
                    if (!this.state.addParticipant(p))
                        return;
                    (_d = (_c = this.events).onUserJoined) === null || _d === void 0 ? void 0 : _d.call(_c, p);
                    yield this.createOffer(p.id);
                    break;
                }
                case "USER_LEFT":
                    this.state.removeParticipant(msg.peerId);
                    this.closePeer(msg.peerId);
                    (_f = (_e = this.events).onUserLeft) === null || _f === void 0 ? void 0 : _f.call(_e, msg.peerId);
                    break;
                case "OFFER":
                    yield this.handleOffer(msg.payload, msg.sender);
                    break;
                case "ANSWER":
                    yield ((_g = this.peers[msg.sender]) === null || _g === void 0 ? void 0 : _g.setRemoteDescription({
                        type: "answer",
                        sdp: msg.payload,
                    }));
                    break;
                case "ICE":
                    yield ((_h = this.peers[msg.sender]) === null || _h === void 0 ? void 0 : _h.addIceCandidate(JSON.parse(msg.payload)));
                    break;
            }
        });
    }
    // ---------------- PEER ----------------
    createPeer(id) {
        if (!this.localStream)
            throw new Error("No local stream");
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        this.localStream
            .getTracks()
            .forEach((t) => pc.addTrack(t, this.localStream));
        pc.ontrack = (e) => {
            var _a, _b;
            this.state.setStream(id, e.streams[0]);
            (_b = (_a = this.events).onTrack) === null || _b === void 0 ? void 0 : _b.call(_a, e.streams[0], id);
        };
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
    handleOffer(sdp, id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peers[id]) {
                this.peers[id] = this.createPeer(id);
            }
            const pc = this.peers[id];
            yield pc.setRemoteDescription({ type: "offer", sdp });
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
    closePeer(id) {
        var _a;
        (_a = this.peers[id]) === null || _a === void 0 ? void 0 : _a.close();
        delete this.peers[id];
        this.initiators.delete(id);
    }
    send(msg) {
        var _a;
        (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(msg));
    }
}
