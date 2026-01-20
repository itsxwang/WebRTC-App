import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { PiMicrophone } from "react-icons/pi";
import { PiMicrophoneSlash } from "react-icons/pi";
import { IoVideocamOutline } from "react-icons/io5";
import { IoVideocamOffOutline } from "react-icons/io5";
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
  const [clientVideStream, setClientVideStream] = useState<MediaStream | null>(
    null,
  );
  const [remoteVideStream] = useState<MediaStream | null>(null);
  const [remoteAudioStream] = useState<MediaStream | null>(null);
  const [clientAudioStream, setClientAudioStream] =
    useState<MediaStream | null>(null);

  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string | null>(null);

  /* ---------------- Callbacks ---------------- */

  // callbacks for usually remote cleint

  // Helper: Attaches your existing video/audio state to the peer connection
  // const attachTracks = useCallback(() => {
  //   // Add Video Track if it exists
  //   if (clientVideStream) {
  //     clientVideStream.getTracks().forEach((track) => {
  //       // check if track is already added to avoid errors
  //       const senders = peer.peer.getSenders();
  //       if (!senders.find((s) => s.track?.id === track.id)) {
  //         peer.peer.addTrack(track, clientVideStream);
  //       }
  //     });
  //   }
  //   // Add Audio Track if it exists
  //   if (clientAudioStream) {
  //     clientAudioStream.getTracks().forEach((track) => {
  //       const senders = peer.peer.getSenders();
  //       if (!senders.find((s) => s.track?.id === track.id)) {
  //         peer.peer.addTrack(track, clientAudioStream);
  //       }
  //     });
  //   }
  // }, [clientVideStream, clientAudioStream]);

  // const handleCallUser = useCallback(
  //   async (remoteUserId: string) => {
  //     // 1. Attach media BEFORE creating offer
  //     // attachTracks();

  //     const offer = await peer.getOffer();
  //     socketRef.current?.emit("user:call", {
  //       to: remoteUserId,
  //       offer,
  //     });
  //   },
  //   []
  // );

  // const handleIncommingCall = useCallback(
  //   async ({ from, offer }: { from: string; offer: RTCSessionDescription }) => {
  //     console.log("📞 Incoming call from", from);
  //     setRemoteSocketId(from); // Set the sender as the remote user

  //     // 1. Attach media BEFORE creating answer
  //     attachTracks();

  //     const ans = await peer.getAnswer(offer);
  //     socketRef.current?.emit("call:accepted", {
  //       to: from,
  //       ans,
  //     });
  //   },
  //   [attachTracks]
  // );

  // callbacks for usually local cleint

  const joinRoom = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || !isConnected) return;
    const newRoomId = crypto.randomUUID();
    if (!(roomId?.trim())) {
      setRoomId(newRoomId);
    }
    setStarted(true);

    socket.emit("room:join", {
      roomId: roomId?.trim() || newRoomId,
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
      console.log(existingUser);
      if (existingUser) {
        setRemoteSocketId(existingUser);
        setRemoteUserName(existingUserName);
        socketRef.current?.on("user:leave", () => {
          console.log("👋 User left room");
          setRemoteSocketId(null);
          setRemoteUserName(null);
        });
      }
    },
    [],
  );

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    socket.emit("room:leave", roomId);

    console.log("⬅️ Left room:", roomId);

    setStarted(false);
    setRemoteSocketId(null);
    setRemoteUserName(null);
  }, [roomId]);

  const joinNextRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !isConnected || !roomId) return;

    const newRoomId = crypto.randomUUID();

    socket.emit("room:leave", roomId);
    socket.emit("room:join", {
      roomId: newRoomId,
      user: userName,
    });

    setRoomId(newRoomId);

    // Reset remote state
    setRemoteSocketId(null);
    setRemoteUserName(null);

    console.log("🔁 Switched to room:", newRoomId);
  }, [isConnected, roomId, userName]);

  const handleUserLeft = useCallback(() => {
    console.log("👋 User left room");
    setRemoteSocketId(null);
    setRemoteUserName(null);
  }, []);

  const handleUserJoined = useCallback(
    ({ user, id }: { user: string; id: string }) => {
      console.log("👋 User joined:", user);
      setRemoteUserName(user);
      setRemoteSocketId(id);

      // Listen for their leave
      socketRef.current?.on("user:leave", handleUserLeft);

      // 🔥 CRITICAL FIX: Initiate the call immediately when they join
      // handleCallUser(id);
    },
    [handleUserLeft],
  );

  // camera and audio handlers
  const toggleClientVideo = useCallback(async () => {
    if (clientVideStream) {
      clientVideStream.getTracks().forEach((track) => track.stop());
      setClientVideStream(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      setClientVideStream(stream);
      // if (remoteSocketId) handleCallUser(remoteSocketId);

      // 🔥 SEND VIDEO TO PEER
      if (remoteSocketId) {
        stream.getTracks().forEach((track) => {
          peer.peer.addTrack(track, stream);
        });
      }
    } catch (err) {
      console.error("Video error:", err);
    }
  }, [clientVideStream, remoteSocketId]);

  const toggleClientAudio = useCallback(async () => {
    if (clientAudioStream) {
      clientAudioStream.getTracks().forEach((track) => track.stop());
      setClientAudioStream(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      setClientAudioStream(stream);

      // 🔥 SEND AUDIO TO PEER
      if (remoteSocketId) {
        stream.getTracks().forEach((track) => {
          peer.peer.addTrack(track, stream);
        });
      }
    } catch (err) {
      console.error("Audio error:", err);
    }
  }, [clientAudioStream, remoteSocketId]);

  // const handleCallAccepted = useCallback(
  //   async ({ ans }: { from: string; ans: RTCSessionDescription }) => {
  //     await peer.setLocalDescription(ans);
  //     console.log("✅ Call accepted");
  //   },
  //   []
  // );

  /* ---------------- use effects ---------------- */

  // useEffect(() => {
  //   peer.peer.ontrack = (event) => {
  //     console.log("🎥 Remote track received");
  //     setRemoteVideStream(event.streams[0]);
  //   };
  //   return () => {
  //     peer.peer.ontrack = null;
  //   };
  // }, []);
  useEffect(() => {
    let socket = socketRef.current;
    if (!socket) {
      socket = io(SOCKET_URL, {
        transports: ["websocket"], // important
      });
    }

    socketRef.current = socket;

    // socket.on("ice:candidate", ({ candidate }) => {
    //   peer.peer.addIceCandidate(new RTCIceCandidate(candidate));
    // });

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setIsConnected(false);
    });

    // 👇 THESE MUST BE OUTSIDE disconnect
    socket.on("room:join", handleJoinRoom);
    socket.on("user:joined", handleUserJoined);

    // socket.on("call:accepted", handleCallAccepted);

    // socket.on("incomming:call", handleIncommingCall);

    socket.on("connect_error", (err) => {
      console.error("🔥 Connect error:", err.message);
    });

    return () => {
      socket.off("room:join", handleJoinRoom);
      socket.off("user:joined", handleUserJoined);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    handleJoinRoom,
    handleUserJoined,
    // handleIncommingCall,
    // handleCallAccepted,
  ]);

  // useEffect(() => {
  //   peer.peer.onicecandidate = (event) => {
  //     if (event.candidate && remoteSocketId) {
  //       socketRef.current?.emit("ice:candidate", {
  //         to: remoteSocketId,
  //         candidate: event.candidate,
  //       });
  //     }
  //   };
  //   return () => {
  //     peer.peer.onicecandidate = null;
  //   };
  // }, [remoteSocketId]);

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
              {clientVideStream ? (
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(video) => {
                    if (video && clientVideStream) {
                      video.srcObject = clientVideStream;
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
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
                <button
                  onClick={toggleClientVideo}
                  className="p-3 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  {clientVideStream ? (
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
                  {clientAudioStream ? (
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

            <div className="w-full max-w-sm md:max-w-2xl aspect-video bg-linear-to-br from-blue-900/60 via-slate-800/80 to-cyan-800/60 rounded-3xl shadow-2xl border border-cyan-400/30 hover:border-blue-400/70 transition-all duration-300 hover:shadow-blue-400/30 backdrop-blur-md backdrop-saturate-150">
              {remoteSocketId ? (
                <>
                  {remoteVideStream ? (
                    <video
                      autoPlay
                      playsInline
                      className="rounded-3xl w-full h-full object-cover"
                      ref={(video) => {
                        if (video) {
                          video.srcObject = remoteVideStream;
                        }
                      }}
                    />
                  ) : (
                    <div className="flex flex-col justify-center items-center h-full text-center p-4">
                      <IoVideocamOffOutline className="text-6xl md:text-8xl text-gray-400 mb-4 animate-pulse" />
                      <p className="text-gray-400 text-lg md:text-xl">
                        {remoteUserName ? remoteUserName : ""}
                      </p>
                    </div>
                  )}

                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
                    <button className="p-3 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer">
                      {remoteVideStream ? (
                        <IoVideocamOutline className="text-2xl text-green-400" />
                      ) : (
                        <IoVideocamOffOutline className="text-2xl text-red-400" />
                      )}
                    </button>

                    <button className="p-3 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer">
                      {remoteAudioStream ? (
                        <PiMicrophone className="text-2xl text-green-400" />
                      ) : (
                        <PiMicrophoneSlash className="text-2xl text-red-400" />
                      )}
                    </button>
                  </div>
                </>
              ) : ""}
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
