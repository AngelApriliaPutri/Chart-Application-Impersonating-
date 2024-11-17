const http = require("http"); //Import modul yang digunakan
const socketIo = require("socket.io"); 

const server = http.createServer(); //Membuat server
const io = socketIo(server);

const users = new Map(); // Menyimpan username dan public key
const socketsByUsername = new Map(); // Menyimpan socket ID berdasarkan username

io.on("connection", (socket) => {
  console.log(`Client ${socket.id} connected`); // Saat ada client baru connect

  socket.emit("init", Array.from(users.entries())); //Mengirim data client yang sudah terhubung

  socket.on("registerPublicKey", (data) => { //Mendaftarkan public key user yang baru join
    const { username, publicKey } = data;
    users.set(username, publicKey); 
    socketsByUsername.set(username, socket.id); 
    console.log(`${username} registered with public key.`);

    io.emit("newUser", { username, publicKey }); //Untuk broadcast ke semua user
  });

  socket.on("message", (data) => { // Menangani pesan yang dikirim oleh client
    const { username, message, signature, isImpersonating, impersonatedUser } = data;

    io.sockets.sockets.forEach((clientSocket) => {
      if (clientSocket.id !== socketsByUsername.get(impersonatedUser)) { // Jika socket.id bukan milik impersonateduser, message dikirim seperti biasa
        clientSocket.emit("message", { 
          username, 
          message, 
          signature, 
          isImpersonating 
        });
      }

      if (clientSocket.id === socketsByUsername.get(impersonatedUser)) {
        clientSocket.emit("impersonationAlert", {
          message: `Someone is impersonating you now.` //User yang sedang di impersonate akan muncul pesan ini
        });
      }
    });
  });

  // Kondisi saat disconnect
  socket.on("disconnect", () => { // Semua client yang ada di map akan dihapus
    console.log(`Client ${socket.id} disconnected`);
    const username = Array.from(socketsByUsername.keys()).find(key => socketsByUsername.get(key) === socket.id);
    if (username) {
      users.delete(username);
      socketsByUsername.delete(username);
    }
  });
});

const port = 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
