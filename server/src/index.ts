import { Socket } from "socket.io";

const { Server } = require("socket.io");

import dotenv from "dotenv";
dotenv.config();

const io = new Server(process.env.PORT, {
  cors: true,
});

io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, user }: { roomId: string; user: string }) => {
    socket.join(roomId);
    console.log(`${user} joined room: ${roomId}`);
    socket.to(roomId).emit("user-joined", { user, socketId: socket.id });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

console.log(`Socket.IO server running on port http://localhost:${process.env.PORT}`);

