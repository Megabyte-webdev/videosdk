export class MeetingState {
    constructor() {
        this.localParticipant = null;
        this.participants = new Map();
        this.activeScreenPeerId = null;
    }
    // ---------------- PARTICIPANTS ----------------
    addParticipant(p) {
        this.participants.set(p.id, {
            id: p.id,
            name: p.name,
            media: Object.assign({ cameraStream: null, screenStream: null, micEnabled: true, camEnabled: true, isScreenSharing: false }, p.media),
        });
    }
    removeParticipant(id) {
        this.participants.delete(id);
    }
    getParticipant(id) {
        return this.participants.get(id) || null;
    }
    getParticipants() {
        return Array.from(this.participants.values());
    }
    // ---------------- MEDIA ----------------
    setCameraStream(id, stream) {
        const p = this.participants.get(id);
        if (!p)
            return;
        p.media.cameraStream = stream;
    }
    setScreenStream(id, stream) {
        const p = this.participants.get(id);
        if (!p)
            return;
        p.media.screenStream = stream;
        p.media.isScreenSharing = !!stream;
    }
    // ---------------- SCREEN CONTROL ----------------
    setActiveScreenPeer(id) {
        this.activeScreenPeerId = id;
    }
    getActiveScreenPeer() {
        return this.activeScreenPeerId;
    }
    // ---------------- RESET ----------------
    reset() {
        this.participants.clear();
        this.activeScreenPeerId = null;
        this.localParticipant = null;
    }
}
