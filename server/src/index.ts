import { Server, Socket } from "socket.io";
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

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
const socketToMediaState = new Map<
  string,
  { video: boolean; audio: boolean }
>();
const waitingRooms = new Set<string>();

io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  io.emit("users:change", {
    total: io.engine.clientsCount,
  });

  socketToUser.set(socket.id, "Anonymous");
  // Initialize with false/false
  socketToMediaState.set(socket.id, { video: false, audio: false });

  socket.on(
    "room:join",
    ({
      roomId,
      user,
      mediaState,
      ignoreRooms,
    }: {
      roomId: string | null;
      ignoreRooms: string[];
      user: string;
      mediaState: { video: boolean; audio: boolean };
    }) => {
      let finalRoomId = roomId;

      // 1. Logic for Random Matching (User didn't provide a Room ID)
      if (!finalRoomId) {
        let waitingRoomId: string | undefined = undefined;

        // Convert Set to Array once to filter it
        const availableRooms = Array.from(waitingRooms);

        // Find the first room that is NOT in the ignore list
        if (ignoreRooms && ignoreRooms.length > 0) {
          waitingRoomId = availableRooms.find(
            (id) => !ignoreRooms.includes(id),
          );
        } else {
          // If no ignore list, just take the first available room
          waitingRoomId = availableRooms[0];
        }

        if (waitingRoomId) {
          // Join the existing waiting room
          finalRoomId = waitingRoomId;
          // 🔥 FIX: Remove the SPECIFIC room we joined, not the first one blindly
          waitingRooms.delete(waitingRoomId);
          console.log("removed from waitingRooms", waitingRooms);
        } else {
          // Create a new room
          finalRoomId = randomBytes(15).toString("hex");
          waitingRooms.add(finalRoomId);
        }
      }

      // 2. Check for Full Room
      if (io.sockets.adapter.rooms.get(finalRoomId)?.size === 2) {
        socket.emit("server:err", {
          message: "This Room is Already FULL!",
        });
        return;
      }

      // 3. Gather Existing User Data
      let existingUser: string | undefined = Array.from(
        io.sockets.adapter.rooms.get(finalRoomId!) || [],
      ).pop();

      let existingUserName: string | undefined = socketToUser.get(
        existingUser || "",
      );

      let existingUserMediaState:
        | { video: boolean; audio: boolean }
        | undefined = undefined;
      if (existingUser) {
        existingUserMediaState = socketToMediaState.get(existingUser);
      }

      // 4. Update State
      socketToUser.set(socket.id, user);
      if (mediaState) {
        socketToMediaState.set(socket.id, mediaState);
      }

      socket.join(finalRoomId!);

      console.log(`${user} joined room: ${finalRoomId}`);
      console.log(waitingRooms,"pineapple")

      // 5. Send Response
      // 🔥 FIX: Always send finalRoomId. The frontend needs it to update state correctly.
      socket.emit("room:join", {
        roomId: finalRoomId,
        user,
        existingUser,
        existingUserName,
        existingUserMediaState,
      });

      // 6. Notify the Room
      socket.to(finalRoomId!).emit("user:joined", {
        user,
        id: socket.id,
        roomId: finalRoomId,
        mediaState: mediaState || { video: false, audio: false },
      });
    },
  );

  socket.on("room:leave", ({ randomMatch, roomId }) => {
    // Check the size BEFORE leaving
    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;

    socket.leave(roomId);

    // Logic:
    // If roomSize was 1 (just me), it is now empty -> Remove from queue.
    // If roomSize was 2 (me + stranger), it now has 1 person -> Add to queue (so they can find a match).

    if (roomSize === 1) {
      waitingRooms.delete(roomId);
    } else if (roomSize === 2) {
      // If it was a random match room, put it back in the queue for the remaining user
      if (randomMatch) {
        // Safety check
        waitingRooms.add(roomId);
      }
    }
    console.log(waitingRooms,"pineapple")

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
    io.emit("users:change", {
      total: io.engine.clientsCount,
    });

    socketToUser.delete(socket.id);

    const rooms = Array.from(socket.rooms);
    rooms.forEach((room) => {
      if (room !== socket.id) {
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

        socket.to(room).emit("user:leave", {});

        // If I was the only one in the room (size 1) and I disconnect -> Room is now empty -> Remove from queue
        // If there were 2 people (size 2) and I disconnect -> Room has 1 person -> Add to queue
        if (roomSize === 1) {
          waitingRooms.delete(room);
        } else if (roomSize === 2) {
          waitingRooms.add(room);
        }
      }
      console.log(waitingRooms,"pineapple")

    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected red and angle: ${socket.id}`);
    socketToUser.delete(socket.id);
    socketToMediaState.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
