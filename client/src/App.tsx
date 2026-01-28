import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { PiMicrophone, PiMicrophoneSlash } from "react-icons/pi";
import { IoVideocamOutline, IoVideocamOffOutline } from "react-icons/io5";
import peer from "./service/peer";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:3000";

function App() {
  /* ---------------- States ---------------- */

  const socketRef = useRef<Socket | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [userName, setUserName] = useState("Anonymous");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  // Combined Local Stream State
  // We use a Ref for the actual MediaStream to keep the ID constant (Critical for WebRTC)
  // We use state (myStream) only to trigger UI re-renders
  const localStreamRef = useRef<MediaStream>(new MediaStream());
  const [myStream, setMyStream] = useState<MediaStream | null>(null);

  // References to WebRTC Senders (Fixes the "2-3 times" bug)
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  // Icon State for Remote Peer
  const [remoteMediaState, setRemoteMediaState] = useState({
    audio: false,
    video: false,
  });

  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string | null>(null);
  const isMakingOffer = useRef(false);

  /* ---------------- Helpers ---------------- */

  // Helper: Send our media state (Icon status) to the remote peer
  const sendMediaState = useCallback(
    (videoEnabled: boolean, audioEnabled: boolean) => {
      if (socketRef.current && remoteSocketId) {
        socketRef.current.emit("media:state", {
          to: remoteSocketId,
          mediaState: { video: videoEnabled, audio: audioEnabled },
        });
      }
    },
    [remoteSocketId]
  );

  // Helper: Force UI update for local stream
  const refreshLocalStreamState = () => {
    // We create a new object wrapper to force React to re-render, 
    // but the underlying tracks are from the stable localStreamRef
    setMyStream(new MediaStream(localStreamRef.current.getTracks()));
  };

  /* ---------------- Callbacks ---------------- */

  const joinRoom = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || !isConnected) return;
    const newRoomId = roomId?.trim() || crypto.randomUUID();
    
    setRoomId(newRoomId);
    setStarted(true);

    socket.emit("room:join", {
      roomId: newRoomId,
      user: userName,
    });
  }, [isConnected, roomId, userName]);

  const handleJoinRoom = useCallback(
    (data: {
      roomId: string;
      user: string;
      existingUser: string;
      existingUserName: string;
    }) => {
      const { roomId, user, existingUser, existingUserName } = data;
      console.log("⬅️ Successfully Joined room:", roomId, user);
      
      if (existingUser) {
        setRemoteSocketId(existingUser);
        setRemoteUserName(existingUserName);
      }
    },
    [],
  );

  const cleanupMedia = useCallback(() => {
    // Stop all tracks in the ref
    localStreamRef.current.getTracks().forEach((t) => {
        t.stop();
        localStreamRef.current.removeTrack(t);
    });
    setMyStream(null);

    // Reset Senders
    videoSenderRef.current = null;
    audioSenderRef.current = null;
    
    // Clear Peer Connection Tracks
    peer.peer.getSenders().forEach((sender) => peer.peer.removeTrack(sender));

    // Reset Remote
    setRemoteStream(null);
    setRemoteMediaState({ audio: false, video: false });
    setRemoteSocketId(null);
    setRemoteUserName(null);
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    socket.emit("room:leave", roomId);
    console.log("⬅️ Left room:", roomId);

    setStarted(false);
    cleanupMedia();
  }, [roomId, cleanupMedia]);

  const joinNextRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !isConnected || !roomId) return;

    cleanupMedia();

    const newRoomId = crypto.randomUUID();
    socket.emit("room:leave", roomId);
    socket.emit("room:join", {
      roomId: newRoomId,
      user: userName,
    });

    setRoomId(newRoomId);
    console.log("🔁 Switched to room:", newRoomId);
  }, [isConnected, roomId, userName, cleanupMedia]);

  const handleUserLeft = useCallback(() => {
    console.log("👋 User left room");
    setRemoteSocketId(null);
    setRemoteUserName(null);
    setRemoteStream(null);
    setRemoteMediaState({ audio: false, video: false });
  }, []);

  const handleCallUser = useCallback(async (remoteSocketId: string) => {
    const offer = await peer.getOffer();
    socketRef.current?.emit("user:call", { to: remoteSocketId, offer });
  }, []);

  const handleIncommingCall = useCallback(
    async ({ from, offer }: { from: string; offer: RTCSessionDescription }) => {
      setRemoteSocketId(from);
      const ans = await peer.getAnswer(offer);
      console.log(`Incomming call!, ${ans} `);
      socketRef.current?.emit("call:accepted", { to: from, ans });
    },
    [],
  );

  const handleCallAccepted = useCallback(
    ({ ans }: { ans: RTCSessionDescription }) => {
      peer.setLocalDescription(ans);
      console.log("Call Accepted!, ", ans);
    },
    [],
  );

  const handleUserJoined = useCallback(
    ({ user, id }: { user: string; id: string }) => {
      console.log("👋 User joined:", user);
      setRemoteUserName(user);
      setRemoteSocketId(id);
      
      // Call immediately
      handleCallUser(id);
    },
    [handleCallUser],
  );

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }: { from: string; offer: RTCSessionDescription }) => {
      console.log("handleNegoNeedIncomming", offer);
      const ans = await peer.getAnswer(offer);
      socketRef.current?.emit("peer:nego:done", { to: from, ans });
    },
    [],
  );

  const handleNegoNeedFinal = useCallback(
    async ({ ans }: { ans: RTCSessionDescription }) => {
      console.log("handleNegoNeedFinal completed", ans);
      await peer.setLocalDescription(ans);
    },
    [],
  );

  // Icon Sync Handler
  const handleRemoteMediaState = useCallback(
    ({ mediaState }: { mediaState: { video: boolean; audio: boolean } }) => {
      setRemoteMediaState(mediaState);
    },
    [],
  );

  /* ---------------- Media Toggles (Fixed) ---------------- */

  const toggleClientVideo = useCallback(async () => {
    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    // 1. Turning OFF
    if (videoTrack) {
      videoTrack.stop();
      localStreamRef.current.removeTrack(videoTrack);
      refreshLocalStreamState();

      // Replace sender track with null (keeps connection, stops video)
      if (videoSenderRef.current) {
        videoSenderRef.current.replaceTrack(null);
      }

      const hasAudio = localStreamRef.current.getAudioTracks().length > 0;
      sendMediaState(false, hasAudio);
      return;
    }

    // 2. Turning ON
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false, 
      });
      const newTrack = stream.getVideoTracks()[0];

      localStreamRef.current.addTrack(newTrack);
      refreshLocalStreamState();

      if (remoteSocketId) {
        if (videoSenderRef.current) {
          // If we have a sender, just reuse it (Fast, no nego needed usually)
          await videoSenderRef.current.replaceTrack(newTrack);
        } else {
          // If first time, add track to peer attached to our STABLE stream ID
          const sender = peer.peer.addTrack(newTrack, localStreamRef.current);
          videoSenderRef.current = sender;
        }
      }
      
      const hasAudio = localStreamRef.current.getAudioTracks().length > 0;
      sendMediaState(true, hasAudio);

    } catch (err) {
      console.error("Video error:", err);
    }
  }, [remoteSocketId, sendMediaState]);

  const toggleClientAudio = useCallback(async () => {
    const audioTrack = localStreamRef.current.getAudioTracks()[0];

    // 1. Turning OFF
    if (audioTrack) {
      audioTrack.stop();
      localStreamRef.current.removeTrack(audioTrack);
      refreshLocalStreamState();

      if (audioSenderRef.current) {
        audioSenderRef.current.replaceTrack(null);
      }

      const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
      sendMediaState(hasVideo, false);
      return;
    }

    // 2. Turning ON
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const newTrack = stream.getAudioTracks()[0];

      localStreamRef.current.addTrack(newTrack);
      refreshLocalStreamState();

      if (remoteSocketId) {
        if (audioSenderRef.current) {
          await audioSenderRef.current.replaceTrack(newTrack);
        } else {
          // Pass localStreamRef.current so it shares the ID with video
          const sender = peer.peer.addTrack(newTrack, localStreamRef.current);
          audioSenderRef.current = sender;
        }
      }

      const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
      sendMediaState(hasVideo, true);

    } catch (err) {
      console.error("Audio error:", err);
    }
  }, [remoteSocketId, sendMediaState]);

  const handleNegoNeeded = useCallback(async () => {
    if (isMakingOffer.current) return;
    isMakingOffer.current = true;
    try {
      const offer = await peer.getOffer();
      socketRef.current?.emit("peer:nego:needed", { offer, to: remoteSocketId });
    } catch (e) {
      console.error(e);
    } finally {
      isMakingOffer.current = false;
    }
  }, [remoteSocketId]);

  /* ---------------- useEffects ---------------- */

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded]);

  useEffect(() => {
    let socket = socketRef.current;
    if (!socket) {
      socket = io(SOCKET_URL, {
        transports: ["websocket"],
      });
      socketRef.current = socket;
    }

    const onConnect = () => {
      console.log("✅ Socket connected:", socket?.id);
      setIsConnected(true);
    };
    const onDisconnect = () => {
      console.log("❌ Socket disconnected");
      setIsConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:join", handleJoinRoom);
    socket.on("user:joined", handleUserJoined);
    socket.on("user:leave", handleUserLeft);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);
    socket.on("media:state", handleRemoteMediaState); // Icon Sync

    socket.on("ice:candidate", async ({ candidate }) => {
      try {
        await peer.peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("🔥 Connect error:", err.message);
    });

    return () => {
      socket?.off("connect", onConnect);
      socket?.off("disconnect", onDisconnect);
      socket?.off("room:join", handleJoinRoom);
      socket?.off("user:joined", handleUserJoined);
      socket?.off("user:leave", handleUserLeft);
      socket?.off("incomming:call", handleIncommingCall);
      socket?.off("call:accepted", handleCallAccepted);
      socket?.off("peer:nego:needed", handleNegoNeedIncomming);
      socket?.off("peer:nego:final", handleNegoNeedFinal);
      socket?.off("media:state", handleRemoteMediaState);
      socket?.off("ice:candidate");
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [
    handleNegoNeedFinal,
    handleNegoNeedIncomming,
    handleJoinRoom,
    handleUserJoined,
    handleCallAccepted,
    handleIncommingCall,
    handleRemoteMediaState,
    handleUserLeft
  ]);

  useEffect(() => {
    const onIceCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate && remoteSocketId) {
        socketRef.current?.emit("ice:candidate", {
          to: remoteSocketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };
    peer.peer.onicecandidate = onIceCandidate;
    return () => {
      peer.peer.onicecandidate = null;
    };
  }, [remoteSocketId]);

  // Track Handling: Simplified because we now send consistent streams
  useEffect(() => {
    const handleTrack = (event: RTCTrackEvent) => {
      console.log("📥 Remote track received", event.track.kind);
      // Since we use shared Stream IDs, event.streams[0] is usually stable.
      // But we can ensure we update state correctly.
      setRemoteStream(event.streams[0]); 
    };

    peer.peer.addEventListener("track", handleTrack);
    return () => {
      peer.peer.removeEventListener("track", handleTrack);
    };
  }, []);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-linear-to-br from-blue-950 via-slate-900 to-cyan-900 text-white relative overflow-hidden">
        {/* Soft background blur shapes */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-linear-to-br from-blue-500/30 via-cyan-400/20 to-transparent rounded-full blur-3xl z-0"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-linear-to-tr from-cyan-400/30 via-blue-500/20 to-transparent rounded-full blur-2xl z-0"></div>
        {/* Heading - fixed at top */}
        <div className="flex justify-center w-full pt-8 md:pt-16 pb-4 md:pb-8 px-4">
          <div className="text-center max-w-full">
            <h1 className="text-2xl sm:text-4xl md:text-6xl lg:text-7xl font-mono font-bold bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-3 drop-shadow-[0_2px_16px_rgba(0,255,255,0.25)]">
              STRANGERS 360
              {/* underline */}
              <div className="relative flex justify-center mt-2 mb-4">
                <span className="block w-40 sm:w-56 md:w-72 h-2 rounded-full bg-linear-to-r from-blue-400 via-cyan-300 to-blue-500 shadow-xl shadow-cyan-400/40 blur-[1px] opacity-90"></span>
                <span className="absolute top-1 left-1/2 -translate-x-1/2 w-32 sm:w-44 md:w-60 h-2 rounded-full bg-linear-to-r from-cyan-200 via-white/60 to-cyan-200 opacity-40 blur"></span>
              </div>
            </h1>
            <p className="text-gray-400 text-sm md:text-lg">
              Find, Share - Enjoy
            </p>
          </div>
        </div>

        {/* Center section - vertically centered videos and button */}
        <div className="flex flex-col justify-center items-center grow gap-6 md:gap-8 w-full px-4 md:px-8 mb-8 md:mb-28">
          {/* User name input box */}
          <div className="w-full max-w-xs mb-4">
            <input
              disabled={started}
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name..."
              className={`${
                started
                  ? "cursor-auto bg-gray-700/50 border-none"
                  : "cursor-auto"
              } text-center w-full px-5 py-3 rounded-2xl border-2 border-cyan-400/60  backdrop-blur-md text-white text-lg font-mono shadow-lg focus:outline-none focus:border-blue-400  transition-all duration-200 placeholder:text-cyan-200/70`}
              maxLength={32}
              autoComplete="off"
            />
          </div>
          {/* 2 videos box */}

          {/* Local Client video  */}
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-8 w-full">
            <div className="w-full max-w-sm md:max-w-2xl aspect-video bg-linear-to-br from-blue-900/60 via-slate-800/80 to-cyan-800/60 rounded-3xl shadow-2xl border border-cyan-400/30 hover:border-blue-400/70 transition-all duration-300 hover:shadow-blue-400/30 backdrop-blur-md backdrop-saturate-150">
              {myStream && myStream.getVideoTracks().length > 0 ? (
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(video) => {
                    if (video && myStream) {
                      video.srcObject = myStream;
                    }
                  }}
                  className="rounded-3xl w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col justify-center items-center h-full text-center p-4">
                  <IoVideocamOffOutline className="text-6xl md:text-8xl text-gray-400 mb-4 animate-pulse" />
                </div>
              )}

              {/* Camera and microphone toggle buttons */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4 ">
                <button
                  onClick={toggleClientVideo}
                  className="p-3 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  {myStream && myStream.getVideoTracks().length > 0 ? (
                    <IoVideocamOutline
                      className={`text-2xl 
                        text-green-400
                      `}
                    />
                  ) : (
                    <IoVideocamOffOutline
                      className={`text-2xl 
                        text-red-400
                      `}
                    />
                  )}
                </button>
                <button
                  onClick={toggleClientAudio}
                  className={`p-3 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer`}
                >
                  {myStream && myStream.getAudioTracks().length > 0 ? (
                    <PiMicrophone
                      className={`text-2xl
                         text-green-400
                      `}
                    />
                  ) : (
                    <PiMicrophoneSlash
                      className={`text-2xl
                         text-red-400
                      `}
                    />
                  )}
                </button>
              </div>
            </div>
            
            {/* Remote client */}
            <div className="relative w-full max-w-sm md:max-w-2xl aspect-video bg-linear-to-br from-blue-900/60 via-slate-800/80 to-cyan-800/60 rounded-3xl shadow-2xl border border-cyan-400/30 hover:border-blue-400/70 transition-all duration-300 hover:shadow-blue-400/30 backdrop-blur-md backdrop-saturate-150 overflow-hidden">
              {remoteSocketId ? (
                <>
                  {remoteStream ? (
                    <video
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover rounded-3xl"
                      ref={(video) => {
                        if (video && remoteStream) {
                          video.srcObject = remoteStream;
                        }
                      }}
                    />
                  ) : (
                    <div className="flex flex-col justify-center items-center h-full text-center p-4">
                      <IoVideocamOffOutline className="text-6xl md:text-8xl text-gray-400 mb-4 animate-pulse" />
                      {remoteUserName && (
                        <p className="text-gray-300 text-lg md:text-xl font-medium font-sans mt-2">
                          {remoteUserName}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Status buttons – Using Synced State */}
                  <div className="absolute bottom-0.5 md:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-4 z-10">
                    <button className="p-2.5 sm:p-3 rounded-full">
                      {remoteMediaState.video ? (
                        <IoVideocamOutline className="text-xl sm:text-2xl text-green-400" />
                      ) : (
                        <IoVideocamOffOutline className="text-xl sm:text-2xl text-red-400" />
                      )}
                    </button>
                    <button className="p-2.5 sm:p-3 rounded-full ">
                      {remoteMediaState.audio ? (
                        <PiMicrophone className="text-xl sm:text-2xl text-green-400" />
                      ) : (
                        <PiMicrophoneSlash className="text-xl sm:text-2xl text-red-400" />
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-lg">
                  Waiting for someone...
                </div>
              )}
            </div>
          </div>

          {/* Start/Stop and Next button */}
          <div className="flex flex-row gap-4 mt-2">
            <button
              onClick={() => {
                if (started) {
                  leaveRoom();
                } else {
                  joinRoom();
                }
              }}
              disabled={userName.trim() === "" || !isConnected}
              className={`${
                userName.trim() === "" || !isConnected
                  ? "opacity-50 cursor-not-allowed"
                  : "opacity-100 cursor-pointer"
              } px-8 md:px-16 py-3 md:py-4 bg-linear-to-r from-blue-500 via-cyan-400 to-blue-400 rounded-full font-bold text-base md:text-lg shadow-xl shadow-cyan-400/30 hover:shadow-blue-400/50 hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-cyan-300/40 hover:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40`}
            >
              {!isConnected ? "Connecting..." : started ? "Stop" : "Start"}
            </button>
            {started && (
              <button
                onClick={() => joinNextRoom()}
                disabled={userName.trim() === ""}
                className={`${
                  userName.trim() === ""
                    ? "opacity-50 cursor-not-allowed"
                    : "opacity-100 cursor-pointer"
                } px-8 md:px-16 py-3 md:py-4 bg-linear-to-r from-yellow-400 via-yellow-300 to-yellow-500 rounded-full font-bold text-base md:text-lg shadow-xl shadow-yellow-200/30 hover:shadow-yellow-400/50 hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-yellow-200/40 hover:border-yellow-400/60 focus:outline-none focus:ring-2 focus:ring-yellow-200/40`}
              >
                Next
              </button>
            )}
          </div>
        </div>

        {/* Room ID input box - Centered on mobile, Right on desktop */}
        <div className="room-id-container">
          <label
            htmlFor="room-id"
            className={`${
              started ? "opacity-50" : "block"
            } text-cyan-300 text-sm font-semibold mb-2 drop-shadow-md transition-all duration-200`}
          >
            ── Enter Room ID (Optional) ──
          </label>
          <input
            disabled={started}
            id="room-id"
            type="text"
            value={roomId || ""}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room ID"
            className={`${
              started ? "bg-gray-700/50 border-none" : ""
            } text-center w-56 px-4 py-2 rounded-lg border-2 border-cyan-400/60 backdrop-blur-md text-white text-sm font-mono shadow-lg focus:outline-none focus:border-blue-400 transition-all duration-200 placeholder:text-cyan-200/70`}
            maxLength={36}
            autoComplete="off"
          />
        </div>
      </div>
    </>
  );
}
export default App;