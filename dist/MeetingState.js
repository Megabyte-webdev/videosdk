export class MeetingState {
    constructor() {
        this.localStream = null;
        this.localParticipant = null;
        this.participants = new Map();
        this.cameraStreams = new Map();
        this.screenStreams = new Map();
        this.mediaMode = new Map();
        this.activeScreenPeerId = null;
    }
    // ---------------- SCREEN CONTROLLER ----------------
    setActiveScreenPeer(id) {
        console.log("[STATE] 🎯 active screen peer =", id);
        this.activeScreenPeerId = id;
    }
    getActiveScreenPeer() {
        return this.activeScreenPeerId;
    }
    // ---------------- PARTICIPANTS ----------------
    addParticipant(p) {
        console.log("[STATE] ➕ participant", p.id);
        this.participants.set(p.id, p);
    }
    removeParticipant(id) {
        console.log("[STATE] ➖ remove participant", id);
        this.participants.delete(id);
        this.cameraStreams.delete(id);
        this.screenStreams.delete(id);
        this.mediaMode.delete(id);
    }
    getParticipant(id) {
        return this.participants.get(id);
    }
    getParticipants() {
        return Array.from(this.participants.values());
    }
    // ---------------- STREAMS ----------------
    setCameraStream(id, stream) {
        console.log("[STATE] 🎥 camera stream SET", id);
        this.cameraStreams.set(id, stream);
    }
    setScreenStream(id, stream) {
        console.log("[STATE] 🖥 screen stream SET", id);
        this.screenStreams.set(id, stream);
    }
    getCameraStream(id) {
        return this.cameraStreams.get(id) || null;
    }
    getScreenStream(id) {
        return this.screenStreams.get(id) || null;
    }
    setMediaMode(id, mode) {
        console.log("[STATE] 🔀 media mode", id, mode);
        this.mediaMode.set(id, mode);
    }
    getMediaMode(id) {
        return this.mediaMode.get(id) || "camera";
    }
    reset() {
        console.log("[STATE] 🔄 reset");
        this.participants.clear();
        this.cameraStreams.clear();
        this.screenStreams.clear();
        this.mediaMode.clear();
        this.activeScreenPeerId = null;
    }
}
