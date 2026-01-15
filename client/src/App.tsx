import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

function App() {
  const user = useRef("User-" + crypto.randomUUID().slice(0, 8));
  const [start, setStart] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    console.log(`Current user: ${user.current}`);
    if (!start) {
      socketRef.current?.disconnect();
      return;
    }
    const socket = io(import.meta.env.VITE_BACKEND_URL);
    socketRef.current = socket;
    const roomId = crypto.randomUUID();
    socket.emit("join-room", { roomId, user: user.current });
    console.log(`Joining room: ${roomId}`);
  }, [start]);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
        {/* Heading - fixed at top */}
        <div className="flex justify-center w-full pt-8 md:pt-16 pb-4 md:pb-8 px-4">
          <div className="text-center max-w-full">
            <h1 className="text-2xl sm:text-4xl md:text-6xl lg:text-7xl  font-mono font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-3">
              INTERACT IN REAL TIME
              {/* underline */}
              <div className="relative flex justify-center mt-2 mb-4">
                <span className="block w-40 sm:w-56 md:w-72 h-1.5 rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 shadow-lg shadow-cyan-400/40 blur-[1px]">
                  &nbsp;
                </span>
                <span className="absolute top-[1] left-1/2 -translate-x-1/2 w-40 sm:w-56 md:w-72 h-1 rounded-full bg-gradient-to-r from-cyan-200 via-white/60 to-cyan-200 opacity-50 blur"></span>
              </div>
            </h1>
            <p className="text-gray-400 text-sm md:text-lg">
              Connect, Share, Collaborate
            </p>
          </div>
        </div>

        {/* Center section - vertically centered videos and button */}
        <div className="flex flex-col justify-center items-center flex-grow gap-6 md:gap-8 w-full px-4 md:px-8 mb-8 md:mb-16">
          {/* 2 videos box */}
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-8 w-full">
            <div className="w-full max-w-sm md:max-w-2xl aspect-video bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl shadow-2xl border border-slate-600 hover:border-blue-500 transition-all duration-300 hover:shadow-blue-500/20"></div>
            <div className="w-full max-w-sm md:max-w-2xl aspect-video bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl shadow-2xl border border-slate-600 hover:border-cyan-500 transition-all duration-300 hover:shadow-cyan-500/20"></div>
          </div>

          <button
            onClick={() => setStart((prev) => !prev)}
            className="px-6 md:px-14 py-3 md:py-4 cursor-pointer bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full font-bold text-base md:text-lg shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all duration-300"
          >
            {start ? "Stop" : "Start"}
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
