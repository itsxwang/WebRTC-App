import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { PiMicrophone } from "react-icons/pi";
import { PiMicrophoneSlash } from "react-icons/pi";
import { IoVideocamOutline } from "react-icons/io5";
import { IoVideocamOffOutline } from "react-icons/io5";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:5000";

function App() {
  const socketRef = useRef<Socket | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [userName, setUserName] = useState("Anonymous");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [clientVideStream, setClientVideStream] = useState<MediaStream | null>(
    null
  );
  const [clientAudioStream, setClientAudioStream] =
    useState<MediaStream | null>(null);

  /* ---------------- Socket Lifecycle ---------------- */
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /* ---------------- Room Actions ---------------- */
  const joinRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !isConnected || roomId) return;

    const newRoomId = crypto.randomUUID();
    setRoomId(newRoomId);
    setStarted(true);

    socket.emit("join-room", {
      roomId: newRoomId,
      user: userName,
    });

    console.log("➡️ Joined room:", newRoomId);
  }, [isConnected, roomId, userName]);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    socket.emit("leave-room", roomId);

    console.log("⬅️ Left room:", roomId);

    setRoomId(null);
    setStarted(false);
  }, [roomId]);

  const joinNextRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !isConnected || !roomId) return;

    const newRoomId = crypto.randomUUID();

    socket.emit("leave-room", roomId);
    socket.emit("join-room", {
      roomId: newRoomId,
      user: userName,
    });

    setRoomId(newRoomId);

    console.log("🔁 Switched to room:", newRoomId);
  }, [isConnected, roomId, userName]);

  // camera and audio handlers
  const toggleClientVideo = useCallback(() => {
    if (clientVideStream) {
      // Turn off video
      clientVideStream.getVideoTracks().forEach((track) => track.stop());
      setClientVideStream(null);
    } else {
      // Turn on video
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((stream) => {
          setClientVideStream(stream);
        })
        .catch((error) => {
          console.error("Error accessing media devices.", error);
        });
    }
  }, [clientVideStream]);

  const toggleClientAudio = useCallback(() => {
    if (clientAudioStream) {
      // Turn off audio
      clientAudioStream.getAudioTracks().forEach((track) => track.stop());
      setClientAudioStream(null);
    } else {
      // Turn on audio
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          setClientAudioStream(stream);
        })
        .catch((error) => {
          console.error("Error accessing audio devices.", error);
        });
    }
  }, [clientAudioStream]);

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
              INTERACT IN REAL TIME
              {/* underline */}
              <div className="relative flex justify-center mt-2 mb-4">
                <span className="block w-40 sm:w-56 md:w-72 h-2 rounded-full bg-linear-to-r from-blue-400 via-cyan-300 to-blue-500 shadow-xl shadow-cyan-400/40 blur-[1px] opacity-90"></span>
                <span className="absolute top-1 left-1/2 -translate-x-1/2 w-32 sm:w-44 md:w-60 h-2 rounded-full bg-linear-to-r from-cyan-200 via-white/60 to-cyan-200 opacity-40 blur"></span>
              </div>
            </h1>
            <p className="text-gray-400 text-sm md:text-lg">
              Connect, Share, Collaborate
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
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-8 w-full">
            <div className="w-full max-w-sm md:max-w-2xl aspect-video bg-linear-to-br from-blue-900/60 via-slate-800/80 to-cyan-800/60 rounded-3xl shadow-2xl border border-cyan-400/30 hover:border-blue-400/70 transition-all duration-300 hover:shadow-blue-400/30 backdrop-blur-md backdrop-saturate-150">
              {clientVideStream ? (
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(video) => {
                    if (video) {
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

              {/* Video toggle button */}
              {/* <div className="absolute top-4 right-4">
                <button
                  onClick={toggleClientVideo}
                  className={`${clientVideStream ? "text-green-500" : "text-gray-500"}  p-3 rounded-full hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer`}
                >
                  <RiVideoOnLine
                    className={`text-2xl ${
                      clientVideStream ? "text-green-400" : "text-gray-400"
                    }`}
                  />
                </button>
              </div> */}

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
            <div className="w-full max-w-sm md:max-w-2xl aspect-video bg-linear-to-br from-cyan-900/60 via-slate-800/80 to-blue-800/60 rounded-3xl shadow-2xl border border-blue-400/30 hover:border-cyan-400/70 transition-all duration-300 hover:shadow-cyan-400/30 backdrop-blur-md backdrop-saturate-150">
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
                <button
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
        <div className="roomInputBox absolute bottom-8 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-8 flex flex-col items-center z-10 roomInputBox">
          <div>
            <label
              htmlFor="room-id"
              className="text-cyan-300 text-sm font-semibold mb-2 drop-shadow-md"
            >
              ── Enter Room ID (Optional) ──
            </label>
          </div>
          <input
            id="room-id"
            type="text"
            value={roomId || ""}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room ID"
            className="text-center w-56 px-4 py-2 rounded-lg border-2 border-cyan-400/60 backdrop-blur-md text-white text-sm font-mono shadow-lg focus:outline-none focus:border-blue-400 transition-all duration-200 placeholder:text-cyan-200/70"
            maxLength={36}
            autoComplete="off"
          />
        </div>
      </div>
    </>
  );
}

export default App;
