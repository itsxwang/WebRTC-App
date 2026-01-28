class PeerService {
  public peer: RTCPeerConnection | null = null;

  constructor() {
    this.initPeer();
  }

  initPeer() {
    if (!this.peer) {
      this.peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      });
    }
  }

  async getAnswer(offer: RTCSessionDescription) {
    if (this.peer) {
      await this.peer.setRemoteDescription(offer);
      const ans = await this.peer.createAnswer();
      await this.peer.setLocalDescription(new RTCSessionDescription(ans));
      return ans;
    }
  }

  async setLocalDescription(ans: RTCSessionDescription) {
    if (this.peer) {
      try {
        await this.peer.setRemoteDescription(new RTCSessionDescription(ans));
      } catch (error) {
        console.log(error);
      }
    }
  }

  async getOffer() {
    if (this.peer) {
      // 🔥 FIX: Ensure we offer "receive" capabilities for Audio & Video
      // even if we (the caller) don't have a track attached yet.
      // This ensures the other peer can send us their video if they have it.
      
      const transceivers = this.peer.getTransceivers();
      
      const hasVideo = transceivers.some(t => t.receiver.track.kind === 'video');
      const hasAudio = transceivers.some(t => t.receiver.track.kind === 'audio');

      if (!hasVideo) {
        this.peer.addTransceiver("video", { direction: "recvonly" });
      }
      if (!hasAudio) {
        this.peer.addTransceiver("audio", { direction: "recvonly" });
      }

      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(new RTCSessionDescription(offer));
      return offer;
    }
  }

  reset() {
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
    this.initPeer();
  }
}

export default new PeerService();