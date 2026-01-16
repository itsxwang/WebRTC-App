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
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
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
        io.sockets.adapter.rooms.get(roomId) || []
      ).pop();

      let existingUserName: string | undefined = socketToUser.get(
        existingUser || ""
      );

      socketToUser.set(socket.id, user);
      socket.join(roomId);

      console.log(`${user} joined room: ${roomId}`);

      // this to tell new user that he joined successfully - we can also do io.to(socket.id).emit = does same thing
      socket.emit("room:join", {
        roomId,
        user,
        existingUser,
        existingUserName,
      });

      // this one to tell existing users that new user joined
      socket.to(roomId).emit("user:joined", {
        user,
        id: socket.id,
        roomId,
      });
    }
  );

  socket.on("room:leave", (roomId) => {
    socket.leave(roomId);
    io.to(roomId).emit("user:leave", {});
    console.log(`${socket.id} left ${roomId}`);
  });

  socket.on(
    "user:call",
    ({ to, offer }: { to: string; offer: RTCSessionDescription }) => {
      io.to(to).emit("incomming:call", {
        from: socket.id,
        offer,
      });
    }
  );

  socket.on(
    "call:accepted",
    ({ to, ans }: { to: string; ans: RTCSessionDescription }) => {
      io.to(to).emit("call:accepted", {
        from: socket.id,
        ans,
      });
    }
  );

  socket.on("ice:candidate", ({ to, candidate }) => {
    io.to(to).emit("ice:candidate", { candidate });
  });

  // disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

console.log(
  `Socket.IO server running on port http://localhost:${process.env.PORT}`
);

const PORT = process.env.PORT || 3000;

io.engine.on("connection_error", (err) => {
  console.log("ENGINE ERROR");
  console.log(err.code);
  console.log(err.message);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
