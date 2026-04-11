export class MeetingState {
    constructor() {
        this.participants = new Map();
        this.streams = new Map();
        this.localParticipant = null;
        this.localStream = null;
    }
    // ---------------- PARTICIPANTS ----------------
    addParticipant(p) {
        if (this.participants.has(p.id))
            return false;
        this.participants.set(p.id, p);
        return true;
    }
    removeParticipant(id) {
        this.participants.delete(id);
        this.streams.delete(id);
    }
    getParticipant(id) {
        return this.participants.get(id) || null;
    }
    getParticipants() {
        return Array.from(this.participants.values());
    }
    clearParticipants() {
        this.participants.clear();
    }
    // ---------------- STREAMS ----------------
    setStream(id, stream) {
        this.streams.set(id, stream);
    }
    getStream(id) {
        return this.streams.get(id) || null;
    }
    removeStream(id) {
        this.streams.delete(id);
    }
    getStreams() {
        return Array.from(this.streams.entries());
    }
    clearStreams() {
        this.streams.clear();
    }
    // ---------------- RESET ----------------
    reset() {
        this.participants.clear();
        this.streams.clear();
        this.localParticipant = null;
        this.localStream = null;
    }
}
