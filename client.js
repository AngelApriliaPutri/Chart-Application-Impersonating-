const io = require("socket.io-client"); //Import modul
const readline = require("readline");
const crypto = require('crypto');

const socket = io("http://localhost:3000"); //Sambungkan ke server

const rl = readline.createInterface({ //Membuat interface
    input: process.stdin,
    output: process.stdout,
    prompt: "> "
});

let registeredUsername = ""; // Username yang sudah di regist
let username = ""; // Username yang aktif (bisa berubah)
const users = new Map(); // Menyimpan username dan public key

// Membuat RSA Key Pair 
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, // public key untuk memverifikasi pesan yang dikirim
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' } // private key untuk sign pesan yang dikirim
});

socket.on("connect", () => {
    console.log("Connected to the server"); // Ketika connect ke server

    rl.question("Enter your username: ", (input) => { // Minta inputan username
        username = input;
        registeredUsername = input;
        console.log(`Welcome, ${username} to the chat`);

        // username dan public key dikirim ke server untuk register
        socket.emit("registerPublicKey", {
            username,
            publicKey,
        });
        rl.prompt();

        rl.on("line", (message) => {
            if (message.trim()) {
                const match = message.match(/^!impersonate (\w+)$/);//prompt kalau mau impersonate user lain
                if (match) {
                    username = match[1]; // mengubah username 
                    console.log(`Now impersonating as ${username}`);
                } else if (message.match(/^!exit$/)) { //prompt saat berhenti impersonate
                    username = registeredUsername;
                    console.log(`Now you are ${username}`);
                } else {
                    const signature = crypto.sign("sha256", Buffer.from(message), privateKey);

                    // pesan yang terkirim akan ada signaturenya dan private key untuk keaslian
                    socket.emit("message", { 
                        username, 
                        message, 
                        signature: signature.toString("base64"),
                        isImpersonating: username !== registeredUsername,
                        impersonatedUser: username !== registeredUsername ? username : null
                    });
                }
            }
            rl.prompt();
        });
    });
});

// Jumlah user yang sudah terdaftar
socket.on("init", (keys) => {
    keys.forEach(([user, key]) => users.set(user, key));
    console.log(`\nThere are currently ${users.size} users in the chat`);
    rl.prompt();
});

// Mendaftarkan pengguna baru
socket.on("newUser", (data) => {
    const { username, publicKey } = data;
    users.set(username, publicKey);
    console.log(`${username} joined the chat`);
    rl.prompt();
});

// Menerima pesan dari server dan melakukan verifikasi
socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage, signature, isImpersonating } = data;

  if (senderUsername !== username) {
      const publicKey = users.get(senderUsername);

      if (publicKey) { //Memverifikasi signature dengan public key
          const isVerified = crypto.verify(
              "sha256",
              Buffer.from(senderMessage),
              publicKey,
              Buffer.from(signature, "base64")
          );

          // Jika verifikasi gagal maka ada label tambahan, jika berhasil pesannya saja
          const fakeUserNotice = isImpersonating ? " (this is a fake user)" : "";
          if (isVerified) {
              if (username === senderUsername) {
                  console.log(`(You as ${senderUsername}): ${senderMessage}${fakeUserNotice}`);
              } else {
                  console.log(`${senderUsername}: ${senderMessage}${fakeUserNotice}`);
              }
          } else {
              console.log(`${senderUsername}: ${senderMessage} (this is a fake user)`);
          }
      } else {
          console.log(`${senderUsername}: ${senderMessage} (public key not found)`); //Kalau misal impersonate client yang tidak ada di server 
      }

      rl.prompt();
  }
});


socket.on("impersonationAlert", (data) => {
    console.log(data.message); // Menampilkan pesan "someone is impersonating you now"
    rl.prompt();
});

socket.on("disconnect", () => {
    console.log("Server disconnected, Exiting...");
    rl.close();
    process.exit(0);
});

rl.on("SIGINT", () => {
    console.log("\nExiting...");
    socket.disconnect();
    rl.close();
    process.exit(0);
});
