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
    notify(type) {
        this.send({
            type,
            room_id: this.roomId,
            user_id: this.myId,
        });
    }
    constructor(url, state, events = {}) {
        this.url = url;
        this.state = state;
        this.events = events;
        this.ws = null;
        this.peers = {};
        this.initiators = new Set();
        this.roomId = null;
        this.sessionId = null;
        this.localStream = null;
        this.screenStream = null;
        this.isScreenSharing = false;
        this.screenSenders = {};
        this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();
        localStorage.setItem("vsdk_id", this.myId);
    }
    initLocal(video, name) {
        return __awaiter(this, void 0, void 0, function* () {
            this.localStream = yield navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            video.srcObject = this.localStream;
            this.state.localStream = this.localStream;
            this.state.localParticipant = {
                id: this.myId,
                name,
            };
        });
    }
    connect(roomId, name) {
        return __awaiter(this, void 0, void 0, function* () {
            this.roomId = roomId;
            if (this.ws) {
                try {
                    this.ws.onopen = null;
                    this.ws.onmessage = null;
                    this.ws.onerror = null;
                    this.ws.close();
                }
                catch (_a) { }
            }
            this.peers = {};
            this.initiators.clear();
            this.state.reset(); // IMPORTANT: you DO have this
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
                this.ws.onerror = (err) => {
                    reject(err);
                };
                this.ws.onmessage = (e) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handle(JSON.parse(e.data));
                });
                this.ws.onclose = () => {
                    console.warn("WebSocket closed");
                };
            });
        });
    }
    handle(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
            console.log("HANDLE MSG:", msg);
            if (msg.sender === this.myId) {
                console.log("Ignoring self message");
                return;
            }
            switch (msg.type) {
                case "EXISTING_USERS":
                    for (const p of msg.participants || []) {
                        if (!(p === null || p === void 0 ? void 0 : p.id) || p.id === this.myId)
                            continue;
                        // prevent duplicate state
                        if ((_b = (_a = this.state).getParticipant) === null || _b === void 0 ? void 0 : _b.call(_a, p.id))
                            continue;
                        this.state.addParticipant({
                            id: p.id,
                            name: p.name,
                            sessionId: p.session_id,
                        });
                        (_d = (_c = this.events).onUserJoined) === null || _d === void 0 ? void 0 : _d.call(_c, {
                            id: p.id,
                            name: p.name,
                            sessionId: p.session_id,
                        });
                        yield this.createOffer(p.id);
                    }
                    break;
                case "USER_JOINED": {
                    const p = msg.participant;
                    if (!(p === null || p === void 0 ? void 0 : p.id) || p.id === this.myId)
                        return;
                    this.state.addParticipant({
                        id: p.id,
                        name: p.name,
                        sessionId: p.session_id,
                    });
                    (_f = (_e = this.events).onUserJoined) === null || _f === void 0 ? void 0 : _f.call(_e, {
                        id: p.id,
                        name: p.name,
                        sessionId: p.session_id,
                    });
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
                        yield ((_g = this.peers[msg.sender]) === null || _g === void 0 ? void 0 : _g.addIceCandidate(JSON.parse(msg.payload)));
                    }
                    catch (e) {
                        console.warn("ICE error", e);
                    }
                    break;
                case "USER_LEFT": {
                    const p = msg.participant;
                    if (!(p === null || p === void 0 ? void 0 : p.id))
                        return;
                    this.closePeer(p.id);
                    this.state.removeParticipant(p.id);
                    (_j = (_h = this.events).onUserLeft) === null || _j === void 0 ? void 0 : _j.call(_h, p);
                    break;
                }
                case "SCREEN_SHARE_START":
                    (_l = (_k = this.events).onScreenShareStart) === null || _l === void 0 ? void 0 : _l.call(_k, msg.peerId);
                    break;
                case "SCREEN_SHARE_STOP":
                    this.state.setScreenStream(msg.peerId, null);
                    (_o = (_m = this.events).onScreenShareStop) === null || _o === void 0 ? void 0 : _o.call(_m, msg.peerId);
                    break;
                case "PEER_REJOINED":
                    this.closePeer(msg.peerId);
                    this.initiators.delete(msg.peerId);
                    yield this.createOffer(msg.peerId);
                    break;
            }
        });
    }
    createPeer(id) {
        if (!this.localStream)
            throw new Error("No local stream");
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        this.localStream.getTracks().forEach((track) => {
            pc.addTrack(track, this.localStream);
        });
        if (this.screenStream) {
            const track = this.screenStream.getVideoTracks()[0];
            if (track) {
                pc.addTrack(track, this.screenStream);
            }
        }
        pc.ontrack = (event) => {
            var _a, _b;
            console.log(event);
            const stream = event.streams[0] || new MediaStream([event.track]);
            const track = event.track;
            const isScreen = track.kind === "video" && track.label.toLowerCase().includes("screen");
            if (isScreen) {
                this.state.setScreenStream(id, stream);
            }
            else if (track.kind === "video") {
                this.state.setCameraStream(id, stream);
            }
            (_b = (_a = this.events).onTrack) === null || _b === void 0 ? void 0 : _b.call(_a, id);
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
            console.log("HANDLE OFFER FROM:", id);
            if (!this.peers[id]) {
                console.log("Creating peer because none exists");
                this.peers[id] = this.createPeer(id);
            }
            const pc = this.peers[id];
            console.log("Setting remote description...");
            yield pc.setRemoteDescription({ type: "offer", sdp });
            console.log("Creating answer...");
            const answer = yield pc.createAnswer();
            console.log("Setting local answer...");
            yield pc.setLocalDescription(answer);
            console.log("Sending ANSWER");
            this.send({
                type: "ANSWER",
                payload: answer.sdp,
                sender: this.myId,
                target: id,
            });
        });
    }
    startScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            this.screenStream = yield navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            const track = this.screenStream.getVideoTracks()[0];
            for (const pc of Object.values(this.peers)) {
                pc.addTrack(track, this.screenStream);
            }
            this.isScreenSharing = true;
            this.notify("SCREEN_SHARE_START");
            track.onended = () => this.stopScreenShare();
            yield this.renegotiate();
        });
    }
    stopScreenShare() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            for (const pc of Object.values(this.peers)) {
                const senders = pc.getSenders();
                for (const sender of senders) {
                    if (((_a = sender.track) === null || _a === void 0 ? void 0 : _a.id) === ((_c = (_b = this.screenStream) === null || _b === void 0 ? void 0 : _b.getVideoTracks()[0]) === null || _c === void 0 ? void 0 : _c.id)) {
                        pc.removeTrack(sender);
                    }
                }
            }
            (_d = this.screenStream) === null || _d === void 0 ? void 0 : _d.getTracks().forEach((t) => t.stop());
            this.screenStream = null;
            this.isScreenSharing = false;
            this.state.media.forEach((m, id) => {
                this.state.setScreenStream(id, null);
            });
            this.notify("SCREEN_SHARE_STOP");
            yield this.renegotiate();
        });
    }
    renegotiate() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const id of Object.keys(this.peers)) {
                this.initiators.delete(id);
                yield this.createOffer(id);
            }
        });
    }
    closePeer(id) {
        var _a;
        (_a = this.peers[id]) === null || _a === void 0 ? void 0 : _a.close();
        delete this.peers[id];
        this.initiators.delete(id);
        this.state.removeMedia(id);
    }
    send(msg) {
        var _a;
        (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(msg));
    }
}
