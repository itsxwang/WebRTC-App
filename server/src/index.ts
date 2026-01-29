import { Server, Socket } from "socket.io";
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "*",
  }),
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev
    methods: ["GET", "POST"],
  },
});

const socketToUser = new Map<string, string>();
const socketToMediaState = new Map<string, { video: boolean; audio: boolean }>();

io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  socketToUser.set(socket.id, "Anonymous");
  // Initialize with false/false
  socketToMediaState.set(socket.id, { video: false, audio: false });

  socket.on(
    "room:join",
    ({ roomId, user, mediaState }: { roomId: string; user: string; mediaState: { video: boolean; audio: boolean } }) => {
      // check if in room 2 peers already their, if yes -> then emit - server:err
      if (io.sockets.adapter.rooms.get(roomId)?.size === 2) {
        socket.emit("server:err", {
          message: "This Room is Already FULL!",
        });
        return;
      }  

      let existingUser: string | undefined = Array.from(
        io.sockets.adapter.rooms.get(roomId) || [],
      ).pop();

      let existingUserName: string | undefined = socketToUser.get(
        existingUser || "",
      );
      
      let existingUserMediaState: { video: boolean; audio: boolean } | undefined = undefined;
      if (existingUser) {
        existingUserMediaState = socketToMediaState.get(existingUser);
      }

      socketToUser.set(socket.id, user);
      
      // Update the joiner's state immediately
      if (mediaState) {
        socketToMediaState.set(socket.id, mediaState);
      }
      
      socket.join(roomId);

      console.log(`${user} joined room: ${roomId}`);

      // Send existing user details + THEIR media state to the joiner
      socket.emit("room:join", {
        roomId,
        user,
        existingUser,
        existingUserName,
        existingUserMediaState, 
      });

      // Notify the room (existing user) about the new guy + send NEW GUY'S media state
      socket.to(roomId).emit("user:joined", {
        user,
        id: socket.id,
        roomId,
        mediaState: mediaState || { video: false, audio: false }
      });
    },
  );

  socket.on("room:leave", (roomId) => {
    socket.leave(roomId);
    io.to(roomId).emit("user:leave", {});
    console.log(`${socket.id} left ${roomId}`);
  });

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("ice:candidate", ({ to, candidate }) => {
    io.to(to).emit("ice:candidate", { candidate });
  });

  // 🔥 FIXED: Always update server state, even if 'to' is null (User is alone)
  socket.on("media:state", ({ to, mediaState }) => {
    socketToMediaState.set(socket.id, mediaState);
    
    // Only forward to remote peer if they exist
    if (to) {
      io.to(to).emit("media:state", { from: socket.id, mediaState });
    }
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit("user:leave", {});
      }
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    socketToUser.delete(socket.id);
    socketToMediaState.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});