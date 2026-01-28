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

io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  socketToUser.set(socket.id, "Anonymous");

  socket.on(
    "room:join",
    ({ roomId, user }: { roomId: string; user: string }) => {
      let existingUser: string | undefined = Array.from(
        io.sockets.adapter.rooms.get(roomId) || [],
      ).pop();

      let existingUserName: string | undefined = socketToUser.get(
        existingUser || "",
      );

      socketToUser.set(socket.id, user);
      socket.join(roomId);

      console.log(`${user} joined room: ${roomId}`);

      socket.emit("room:join", {
        roomId,
        user,
        existingUser,
        existingUserName,
      });

      socket.to(roomId).emit("user:joined", {
        user,
        id: socket.id,
        roomId,
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

  // 🔥 NEW: Handle Media State Sync (Icons)
  socket.on("media:state", ({ to, mediaState }) => {
    io.to(to).emit("media:state", { from: socket.id, mediaState });
  });

  socket.on("disconnecting", () => {
    // Notify room before full disconnect
    const rooms = Array.from(socket.rooms);
    // rooms[0] is usually socket.id, rooms[1] is the joined room
    rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit("user:leave", {});
      }
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    socketToUser.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});