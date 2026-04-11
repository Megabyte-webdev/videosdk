export type Participant = {
  id: string;
  name: string;
};

export class MeetingState {
  participants = new Map<string, Participant>();
  streams = new Map<string, MediaStream>();

  localParticipant: Participant | null = null;
  localStream: MediaStream | null = null;

  // ---------------- PARTICIPANTS ----------------
  addParticipant(p: Participant) {
    if (this.participants.has(p.id)) return false;

    this.participants.set(p.id, p);

    return true;
  }

  removeParticipant(id: string) {
    this.participants.delete(id);
    this.streams.delete(id);
  }

  getParticipant(id: string) {
    return this.participants.get(id) || null;
  }

  getParticipants() {
    return Array.from(this.participants.values());
  }

  clearParticipants() {
    this.participants.clear();
  }

  // ---------------- STREAMS ----------------
  setStream(id: string, stream: MediaStream) {
    this.streams.set(id, stream);
  }

  getStream(id: string) {
    return this.streams.get(id) || null;
  }

  removeStream(id: string) {
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
