import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { PiMicrophone, PiMicrophoneSlash } from "react-icons/pi";
import { IoVideocamOutline, IoVideocamOffOutline } from "react-icons/io5";
import peer from "./service/peer";
import { MdOutlinePersonOutline } from "react-icons/md";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:3000";

interface IgnoredRoom {
  id: string;
  timestamp: number;
}
function App() {
  /* ---------------- States ---------------- */

  const socketRef = useRef<Socket | null>(null);

  const [totalUsers, setTotalUsers] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [userName, setUserName] = useState("Anonymous");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [findingRoom, setFindingRoom] = useState(false);

  // Local Media logic
  const localStreamRef = useRef<MediaStream>(new MediaStream());
  const [, setLocalMediaTrigger] = useState(0);

  // Persistent Senders
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteMediaState, setRemoteMediaState] = useState({
    audio: false,
    video: false,
  });

  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string | null>(null);
  const [serverErrorMsg, setServerErrorMsg] = useState<string | null>(null);
  const isMakingOffer = useRef(false);

  /* ---------------- Helpers ---------------- */

  const getValidIgnoredRooms = useCallback(() => {
    const raw = localStorage.getItem("ignoreRooms");
    const parsed: IgnoredRoom[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();

    // Keep rooms that are less than 10 seconds old (10000ms)
    // ! Make it 300000 in real
    const valid = parsed.filter((item) => now - item.timestamp < 10000);

    // Update storage with only valid rooms
    localStorage.setItem("ignoreRooms", JSON.stringify(valid));

    // Return just the IDs for the server
    return valid.map((item) => item.id);
  }, []);

  const addToIgnoreList = useCallback((idToIgnore: string) => {
    const raw = localStorage.getItem("ignoreRooms");
    const parsed: IgnoredRoom[] = raw ? JSON.parse(raw) : [];

    // Add new room with current timestamp
    const updated = [...parsed, { id: idToIgnore, timestamp: Date.now() }];

    localStorage.setItem("ignoreRooms", JSON.stringify(updated));
  }, []);

  const sendMediaState = useCallback(
    (videoEnabled: boolean, audioEnabled: boolean) => {
      if (socketRef.current) {
        socketRef.current.emit("media:state", {
          to: remoteSocketId,
          mediaState: { video: videoEnabled, audio: audioEnabled },
        });
      }
    },
    [remoteSocketId],
  );

  const syncLocalTracks = useCallback(() => {
    if (!peer.peer) return;

    const stream = localStreamRef.current;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && !videoSenderRef.current) {
      // If connection is new/reset, add the track
      videoSenderRef.current = peer.peer.addTrack(videoTrack, stream);
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack && !audioSenderRef.current) {
      audioSenderRef.current = peer.peer.addTrack(audioTrack, stream);
    }
  }, []);

  /* ---------------- Callbacks ---------------- */

  const handleCopyRoomId = useCallback(async (roomId: string) => {
    try {
      await navigator.clipboard.writeText(roomId);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleUsersChange = useCallback(({ total }: { total: number }) => {
    setTotalUsers(total);
  }, []);

  // Handle Server Error (Room Full)
  const handleServerErr = useCallback(({ message }: { message: string }) => {
    setServerErrorMsg(message);
    setStarted(false); // Reset UI back to "Start"
  }, []);

  const joinRoom = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || !isConnected) return;

    // Clear previous errors
    setServerErrorMsg(null);

    const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
    const hasAudio = localStreamRef.current.getAudioTracks().length > 0;

    if (!roomId) {
      localStorage.setItem("randomatch", "true");
    }

    const ignoreList = getValidIgnoredRooms();

    socket.emit("room:join", {
      roomId: roomId ? roomId.trim() : null,
      ignoreRooms: ignoreList,
      user: userName,
      mediaState: { video: hasVideo, audio: hasAudio },
    });
    setFindingRoom(true);

    if (roomId) {
      setRoomId(roomId);
    }
    setStarted(true);
  }, [isConnected, roomId, userName, getValidIgnoredRooms]);

  const handleJoinRoom = useCallback(
    (data: {
      roomId: string | null;
      user: string;
      existingUser: string;
      existingUserName: string;
      existingUserMediaState?: { video: boolean; audio: boolean };
    }) => {
      const { existingUser, existingUserName, existingUserMediaState } = data;

      setFindingRoom(false);
      if (data.roomId) {
        console.log("Joined Room:", data.roomId);
        setRoomId(data.roomId);
      }
      if (existingUser) {
        setRemoteSocketId(existingUser);
        setRemoteUserName(existingUserName);

        if (existingUserMediaState) {
          setRemoteMediaState(existingUserMediaState);
        }
      }
    },
    [],
  );

  // Triggered when WE leave the room
  const cleanupMedia = useCallback(() => {
    // Reset Senders but KEEP tracks alive in localStreamRef
    isMakingOffer.current = false;
    videoSenderRef.current = null;
    audioSenderRef.current = null;

    setRemoteStream(null);
    setRemoteMediaState({ audio: false, video: false });
    setRemoteSocketId(null);
    setRemoteUserName(null);

    // Kill the connection
    peer.reset();

    setLocalMediaTrigger((prev) => prev + 1);
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;
    socket.emit("room:leave", {
      roomId,
      randomMatch: localStorage.getItem("randomatch"),
    });

    if (localStorage.getItem("randomatch")) {
      console.log("Leaving Room:", started);
      localStorage.removeItem("randomatch");
      setRoomId(null);
    }

    setStarted(false);

    addToIgnoreList(roomId);

    cleanupMedia();
  }, [addToIgnoreList, roomId, cleanupMedia, started]);

  const joinNextRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !isConnected || !roomId) return;

    // Clear previous errors
    setServerErrorMsg(null);

    cleanupMedia();

    addToIgnoreList(roomId);

    socket.emit("room:leave", { roomId, randomMatch: true });

    const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
    const hasAudio = localStreamRef.current.getAudioTracks().length > 0;

    localStorage.setItem("randomatch", "true");

    const ignoreList = getValidIgnoredRooms();
    console.log("Ignoring:", ignoreList);
    socket.emit("room:join", {
      roomId: null,
      ignoreRooms: ignoreList,
      user: userName,
      mediaState: { video: hasVideo, audio: hasAudio },
    });
  }, [
    isConnected,
    roomId,
    userName,
    cleanupMedia,
    getValidIgnoredRooms,
    addToIgnoreList,
  ]);

  // 🔥 CRITICAL FIX: Triggered when THEY leave the room
  const handleUserLeft = useCallback(() => {
    setRemoteSocketId(null);
    setRemoteUserName(null);
    setRemoteStream(null);
    setRemoteMediaState({ audio: false, video: false });

    // 🔥 WE MUST RESET THE CONNECTION HERE.
    // If we don't, we are holding a "zombie" connection to the old user.
    // When a new user (or the same one) joins, we need a fresh start.
    peer.reset();
    videoSenderRef.current = null;
    audioSenderRef.current = null;
  }, []);

  const handleCallUser = useCallback(
    async (remoteSocketId: string) => {
      // 🔥 FIX: Lock negotiation to prevent 'negotiationneeded'
      // from firing automatically while we build the initial offer.
      isMakingOffer.current = true;

      try {
        syncLocalTracks(); // This triggers the event, but we blocked it above.
        const offer = await peer.getOffer();
        socketRef.current?.emit("user:call", { to: remoteSocketId, offer });
      } catch (err) {
        console.error("Call user failed:", err);
      } finally {
        // Release lock so future renegotiations (mute/unmute) work
        isMakingOffer.current = false;
      }
    },
    [syncLocalTracks],
  );

  const handleIncommingCall = useCallback(
    async ({ from, offer }: { from: string; offer: RTCSessionDescription }) => {
      setRemoteSocketId(from);

      // 🔥 FIX: Lock here too. We are Answering, so we must not let
      // the browser trigger a new Offer when we add our tracks.
      isMakingOffer.current = true;

      try {
        syncLocalTracks();
        const ans = await peer.getAnswer(offer);
        socketRef.current?.emit("call:accepted", { to: from, ans });
      } catch (err) {
        console.error("Incoming call failed:", err);
      } finally {
        isMakingOffer.current = false;
      }
    },
    [syncLocalTracks],
  );

  const handleCallAccepted = useCallback(
    ({ ans }: { ans: RTCSessionDescription }) => {
      peer.setLocalDescription(ans);
    },
    [],
  );

  const handleUserJoined = useCallback(
    ({
      user,
      id,
      mediaState,
    }: {
      user: string;
      id: string;
      mediaState?: { video: boolean; audio: boolean };
    }) => {
      setRemoteUserName(user);
      setRemoteSocketId(id);
      if (mediaState) {
        setRemoteMediaState(mediaState);
      }
      handleCallUser(id);
    },
    [handleCallUser],
  );

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }: { from: string; offer: RTCSessionDescription }) => {
      const ans = await peer.getAnswer(offer);
      socketRef.current?.emit("peer:nego:done", { to: from, ans });
    },
    [],
  );

  const handleNegoNeedFinal = useCallback(
    async ({ ans }: { ans: RTCSessionDescription }) => {
      await peer.setLocalDescription(ans);
    },
    [],
  );

  const handleRemoteMediaState = useCallback(
    ({ mediaState }: { mediaState: { video: boolean; audio: boolean } }) => {
      setRemoteMediaState(mediaState);
    },
    [],
  );

  /* ---------------- Toggle Logic ---------------- */

  const toggleClientVideo = useCallback(async () => {
    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      // 1. Turning OFF
      videoTrack.stop();
      localStreamRef.current.removeTrack(videoTrack);
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(null);
      }
      sendMediaState(false, localStreamRef.current.getAudioTracks().length > 0);
    } else {
      // 2. Turning ON
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        const newTrack = stream.getVideoTracks()[0];
        localStreamRef.current.addTrack(newTrack);

        // If connection is active/stable, attach immediately
        if (peer.peer && peer.peer.signalingState !== "closed") {
          if (videoSenderRef.current) {
            await videoSenderRef.current.replaceTrack(newTrack);
          } else {
            videoSenderRef.current = peer.peer.addTrack(
              newTrack,
              localStreamRef.current,
            );
          }
        }

        sendMediaState(
          true,
          localStreamRef.current.getAudioTracks().length > 0,
        );
      } catch (err) {
        console.error(err);
      }
    }
    setLocalMediaTrigger((prev) => prev + 1);
  }, [sendMediaState]);

  const toggleClientAudio = useCallback(async () => {
    const audioTrack = localStreamRef.current.getAudioTracks()[0];

    if (audioTrack) {
      // 1. Turning OFF
      audioTrack.stop();
      localStreamRef.current.removeTrack(audioTrack);
      if (audioSenderRef.current) {
        await audioSenderRef.current.replaceTrack(null);
      }
      sendMediaState(localStreamRef.current.getVideoTracks().length > 0, false);
    } else {
      // 2. Turning ON
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        const newTrack = stream.getAudioTracks()[0];
        localStreamRef.current.addTrack(newTrack);

        if (peer.peer && peer.peer.signalingState !== "closed") {
          if (audioSenderRef.current) {
            await audioSenderRef.current.replaceTrack(newTrack);
          } else {
            audioSenderRef.current = peer.peer.addTrack(
              newTrack,
              localStreamRef.current,
            );
          }
        }

        sendMediaState(
          localStreamRef.current.getVideoTracks().length > 0,
          true,
        );
      } catch (err) {
        console.error(err);
      }
    }
    setLocalMediaTrigger((prev) => prev + 1);
  }, [sendMediaState]);

  const handleNegoNeeded = useCallback(async () => {
    if (isMakingOffer.current) return;
    isMakingOffer.current = true;
    try {
      const offer = await peer.getOffer();
      socketRef.current?.emit("peer:nego:needed", {
        offer,
        to: remoteSocketId,
      });
    } finally {
      isMakingOffer.current = false;
    }
  }, [remoteSocketId]);

  /* ---------------- Effects ---------------- */

  // Re-bind negotiation listener whenever 'started' or peer resets
  useEffect(() => {
    if (!peer.peer) return;
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    return () => {
      peer.peer?.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded, started, remoteSocketId]); // remoteSocketId dependency helps re-bind on new call

  // Effect 1: Initialize Connection (Run Only Once)
  useEffect(() => {
    // 1. Create connection
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    // 2. Set basic connection state
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    // 3. Cleanup on unmount only
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // <--- Empty Array means "Never disconnect unless I close the tab"

  // Effect 2: Bind Event Listeners (Runs when handlers update)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Attach Listeners
    socket.on("room:join", handleJoinRoom);
    socket.on("user:joined", handleUserJoined);
    socket.on("user:leave", handleUserLeft);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);
    socket.on("media:state", handleRemoteMediaState);
    socket.on("server:err", handleServerErr);
    socket.on("ice:candidate", async ({ candidate }) => {
      try {
        if (peer.peer) {
          await peer.peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.error(e);
      }
    });

    // Remove Listeners (But keep socket connected!)
    return () => {
      socket.off("room:join", handleJoinRoom);
      socket.off("user:joined", handleUserJoined);
      socket.off("user:leave", handleUserLeft);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
      socket.off("media:state", handleRemoteMediaState);
      socket.off("server:err", handleServerErr);
      socket.off("ice:candidate");
    };
  }, [
    // These dependencies trigger a re-bind, but NOT a re-connect
    handleJoinRoom,
    handleUserJoined,
    handleUserLeft,
    handleIncommingCall,
    handleCallAccepted,
    handleNegoNeedIncomming,
    handleNegoNeedFinal,
    handleRemoteMediaState,
    handleServerErr,
  ]);

  useEffect(() => {
    if (!peer.peer) return;
    peer.peer.onicecandidate = (event) => {
      if (event.candidate && remoteSocketId) {
        socketRef.current?.emit("ice:candidate", {
          to: remoteSocketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };
  }, [remoteSocketId, started]);

  useEffect(() => {
    if (!peer.peer) return;
    const handleTrack = (event: RTCTrackEvent) => {
      setRemoteStream(event.streams[0]);
    };
    peer.peer.addEventListener("track", handleTrack);
    return () => peer.peer?.removeEventListener("track", handleTrack);
  }, [started, remoteSocketId]);

  const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
  const hasAudio = localStreamRef.current.getAudioTracks().length > 0;

  // listen for total users changes
  useEffect(() => {
    socketRef.current?.on("users:change", handleUsersChange);
    return () => {
      socketRef.current?.off("users:change", handleUsersChange);
    };
  }, [handleUsersChange]);

  let roomIdLabel = "";
  if (findingRoom) {
    roomIdLabel = "Finding Room...";
  } else if (started) {
    roomIdLabel = "── Click on ID Input to COPY ──";
  } else {
    roomIdLabel = "── Leave Room ID Blank for Random match ──";
  }
  return (
    <>
      <div className="flex min-h-screen flex-col bg-linear-to-br from-blue-950 via-slate-900 to-cyan-900 text-white relative overflow-hidden">
        <div className="absolute top-3 right-3 sm:top-5 sm:right-6 px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl bg-slate-900/40 backdrop-blur-md border border-cyan-400/30 text-white shadow-xl shadow-cyan-900/20 transition-all duration-300 group z-50">
          <div className="flex flex-col items-center justify-center">
            {/* The Number */}
            <div className="text-sm sm:text-lg font-mono font-bold leading-none bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              {totalUsers}
            </div>

            {/* The Icon - Always below */}
            <div className="flex items-center gap-1 mt-0.5">
              <MdOutlinePersonOutline className="text-cyan-400 text-xs sm:text-sm" />
              <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-cyan-200/60 font-bold">
                Live
              </span>
              {/* Little green live indicator dot */}
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
            </div>
          </div>
        </div>
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-linear-to-br from-blue-500/30 via-cyan-400/20 to-transparent rounded-full blur-3xl z-0"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-linear-to-tr from-cyan-400/30 via-blue-500/20 to-transparent rounded-full blur-2xl z-0"></div>

        <div className="flex justify-center w-full pt-8 md:pt-16 pb-4 md:pb-8 px-4">
          <div className="text-center max-w-full">
            <h1 className="text-2xl sm:text-4xl md:text-6xl lg:text-7xl font-mono font-bold bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-3 drop-shadow-[0_2px_16px_rgba(0,255,255,0.25)]">
              STRANGERS 360
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

        <div className="flex flex-col justify-center items-center grow gap-6 md:gap-8 w-full px-4 md:px-8 mb-8 md:mb-28">
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
              } text-center w-full px-5 py-3 rounded-2xl border-2 border-cyan-400/60 backdrop-blur-md text-white text-lg font-mono shadow-lg focus:outline-none focus:border-blue-400 transition-all duration-200 placeholder:text-cyan-200/70`}
              maxLength={32}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-8 w-full">
            {/* Local Video Section */}
            <div className="w-full max-w-sm md:max-w-2xl aspect-video bg-linear-to-br from-blue-900/60 via-slate-800/80 to-cyan-800/60 rounded-3xl shadow-2xl border border-cyan-400/30 hover:border-blue-400/70 transition-all duration-300 hover:shadow-blue-400/30 backdrop-blur-md backdrop-saturate-150 relative">
              {hasVideo ? (
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(video) => {
                    if (video) video.srcObject = localStreamRef.current;
                  }}
                  className="rounded-3xl w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col justify-center items-center h-full text-center p-4">
                  <IoVideocamOffOutline className="text-6xl md:text-8xl text-gray-400 mb-4 animate-pulse" />
                </div>
              )}
              <div className="absolute bottom-0.5 md:bottom-1 left-1/2 transform -translate-x-1/2 flex gap-4 z-10">
                <button
                  onClick={toggleClientVideo}
                  className={`p-1 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer`}
                >
                  {hasVideo ? (
                    <IoVideocamOutline className="text-2xl text-green-400" />
                  ) : (
                    <IoVideocamOffOutline className="text-2xl text-red-400" />
                  )}
                </button>
                <button
                  onClick={toggleClientAudio}
                  className={`p-3 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer`}
                >
                  {hasAudio ? (
                    <PiMicrophone className="text-2xl text-green-400" />
                  ) : (
                    <PiMicrophoneSlash className="text-2xl text-red-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Remote Video Section */}
            <div className="relative w-full max-w-sm md:max-w-2xl aspect-video bg-linear-to-br from-blue-900/60 via-slate-800/80 to-cyan-800/60 rounded-3xl shadow-2xl border border-cyan-400/30 hover:border-blue-400/70 transition-all duration-300 hover:shadow-blue-400/30 backdrop-blur-md backdrop-saturate-150 overflow-hidden">
              {remoteSocketId ? (
                <>
                  {remoteStream && (
                    <audio
                      autoPlay
                      playsInline
                      ref={(audio) => {
                        if (audio) audio.srcObject = remoteStream;
                      }}
                    />
                  )}

                  {remoteMediaState.video && remoteStream ? (
                    <video
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover rounded-3xl"
                      ref={(video) => {
                        if (video) video.srcObject = remoteStream;
                      }}
                    />
                  ) : (
                    <div className="flex flex-col justify-center items-center h-full text-center p-4">
                      {/* FIX 1: Icon is now alone in flex container, ensuring perfect alignment with local peer */}
                      <IoVideocamOffOutline className="text-6xl md:text-8xl text-gray-400 mb-4 animate-pulse" />

                      {/* FIX 2: Name moved to absolute top to avoid overlapping buttons at bottom */}
                      {remoteUserName && (
                        <p className="absolute bottom-10 md:bottom-10 text-gray-300 text-lg md:text-xl font-medium font-sans drop-shadow-md  px-4 py-1 rounded-full ">
                          {remoteUserName}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="absolute bottom-0.5 md:bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-4 z-10">
                    <button className="p-2.5 sm:p-3 rounded-full">
                      {remoteMediaState.video ? (
                        <IoVideocamOutline className="text-xl sm:text-2xl text-green-400" />
                      ) : (
                        <IoVideocamOffOutline className="text-xl sm:text-2xl text-red-400" />
                      )}
                    </button>
                    <button className="p-2.5 sm:p-3 rounded-full">
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

          <div className="flex flex-row gap-4 mt-2">
            <button
              onClick={() => (started ? leaveRoom() : joinRoom())}
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
                className="cursor-pointer px-8 md:px-16 py-3 md:py-4 bg-linear-to-r from-yellow-400 via-yellow-300 to-yellow-500 rounded-full font-bold text-base md:text-lg shadow-xl shadow-yellow-200/30 hover:shadow-yellow-400/50 hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-yellow-200/40 hover:border-yellow-400/60 focus:outline-none focus:ring-2 focus:ring-yellow-200/40"
              >
                Next
              </button>
            )}
          </div>
        </div>

        <div className="room-id-container">
          {serverErrorMsg && (
            <div className="mb-4 text-center">
              <span className="inline-block px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 font-bold backdrop-blur-md animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                ⚠️ {serverErrorMsg}
              </span>
            </div>
          )}
          <label
            htmlFor="room-id"
            className={`${
              started ? "animate-pulse" : "block"
            } text-cyan-300 text-sm font-semibold mb-2 drop-shadow-md transition-all duration-200`}
          >
            {roomIdLabel}
          </label>
          {started ? (
            <button
              onClick={() => {
                handleCopyRoomId(roomId || "");
              }}
              className="truncate bg-gray-700/50 border-none text-center w-56 px-4 py-2 rounded-lg border-2 border-cyan-400/60 backdrop-blur-md text-white text-sm font-mono shadow-lg focus:outline-none transition-all duration-200 active:scale-75"
            >
              {roomId}
            </button>
          ) : (
            <input
              disabled={started}
              id="room-id"
              type="text"
              value={roomId || ""}
              onChange={(e) => {
                if (serverErrorMsg) {
                  setServerErrorMsg(null);
                }
                setRoomId(e.target.value);
              }}
              placeholder="Custom Room ID"
              className={`text-center w-56 px-4 py-2 rounded-lg border-2 border-cyan-400/60 backdrop-blur-md text-white text-sm font-mono shadow-lg focus:outline-none focus:border-blue-400 transition-all duration-200 placeholder:text-cyan-200/70`}
              maxLength={36}
              autoComplete="off"
            />
          )}
        </div>
      </div>
    </>
  );
}
export default App;
