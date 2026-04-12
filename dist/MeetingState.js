export class MeetingState {
    constructor() {
        this.participants = new Map();
        this.media = new Map();
        this.localParticipant = null;
        this.localStream = null;
    }
    // ---------------- PARTICIPANTS ----------------
    addParticipant(p) {
        const existing = this.participants.get(p.id);
        if ((existing === null || existing === void 0 ? void 0 : existing.sessionId) === p.sessionId)
            return false;
        this.participants.set(p.id, Object.assign(Object.assign({}, existing), p));
        return true;
    }
    removeParticipant(id) {
        this.participants.delete(id);
        this.media.delete(id);
    }
    getParticipants() {
        return Array.from(this.participants.values());
    }
    getParticipant(id) {
        return this.participants.get(id);
    }
    // ---------------- SAFE MEDIA SETTERS ----------------
    setCameraStream(id, stream) {
        const existing = this.media.get(id) || {};
        this.media.set(id, Object.assign(Object.assign({}, existing), { cameraStream: stream }));
    }
    setScreenStream(id, stream) {
        const existing = this.media.get(id) || {};
        this.media.set(id, Object.assign(Object.assign({}, existing), { screenStream: stream || undefined }));
    }
    getMedia(id) {
        return this.media.get(id) || null;
    }
    getCameraStream(id) {
        var _a;
        return ((_a = this.media.get(id)) === null || _a === void 0 ? void 0 : _a.cameraStream) || null;
    }
    getScreenStream(id) {
        var _a;
        return ((_a = this.media.get(id)) === null || _a === void 0 ? void 0 : _a.screenStream) || null;
    }
    removeMedia(id) {
        this.media.delete(id);
    }
    reset() {
        this.participants.clear();
        this.media.clear();
        this.localParticipant = null;
        this.localStream = null;
    }
}
