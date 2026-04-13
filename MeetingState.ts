export type Participant = {
  id: string;
  name?: string;
};

export class MeetingState {
  localStream: MediaStream | null = null;
  localParticipant: Participant | null = null;

  private participants = new Map<string, Participant>();

  private cameraStreams = new Map<string, MediaStream | null>();
  private screenStreams = new Map<string, MediaStream | null>();
  private mediaMode = new Map<string, "camera" | "screen">();

  private activeScreenPeerId: string | null = null;

  // ---------------- SCREEN CONTROLLER ----------------
  setActiveScreenPeer(id: string | null) {
    console.log("[STATE] 🎯 active screen peer =", id);
    this.activeScreenPeerId = id;
  }

  getActiveScreenPeer() {
    return this.activeScreenPeerId;
  }

  // ---------------- PARTICIPANTS ----------------
  addParticipant(p: Participant) {
    console.log("[STATE] ➕ participant", p.id);
    this.participants.set(p.id, p);
  }

  removeParticipant(id: string) {
    console.log("[STATE] ➖ remove participant", id);
    this.participants.delete(id);
    this.cameraStreams.delete(id);
    this.screenStreams.delete(id);
    this.mediaMode.delete(id);
  }

  getParticipant(id: string) {
    return this.participants.get(id);
  }

  getParticipants() {
    return Array.from(this.participants.values());
  }

  // ---------------- STREAMS ----------------
  setCameraStream(id: string, stream: MediaStream | null) {
    console.log("[STATE] 🎥 camera stream SET", id);
    this.cameraStreams.set(id, stream);
  }

  setScreenStream(id: string, stream: MediaStream | null) {
    console.log("[STATE] 🖥 screen stream SET", id);
    this.screenStreams.set(id, stream);
  }

  getCameraStream(id: string) {
    return this.cameraStreams.get(id) || null;
  }

  getScreenStream(id: string) {
    return this.screenStreams.get(id) || null;
  }

  setMediaMode(id: string, mode: "camera" | "screen") {
    console.log("[STATE] 🔀 media mode", id, mode);
    this.mediaMode.set(id, mode);
  }

  getMediaMode(id: string) {
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
