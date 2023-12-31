const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1024 * 1024 * 27
});
let sockets = {};

app.use(express.static(__dirname + "/public"));
app.get("/upload", (req, res) => res.sendFile(__dirname + "/public/upload.html"));
app.get("/download", (req, res) => res.sendFile(__dirname + "/public/download.html"));
app.get("/trueP2P", (req, res) => res.sendFile(__dirname + "/public/trueP2P.html"));

io.on('connection', function (client) {
    let isIP = false;
    if (!sockets[client.handshake.headers['cf-connecting-ip'] || client.handshake.address]) {
        isIP = true;
        sockets[client.handshake.headers['cf-connecting-ip'] || client.handshake.address] = client;
        client.emit("useIP", client.handshake.headers['cf-connecting-ip'] || client.handshake.address)
    }

    let alias = "";

    sockets[client.id] = client;
    client.on("download_request", function(id) {
        if (!sockets.hasOwnProperty(id)) return client.emit("download_failed", id);
        client.data.download = {
            id: sockets[id].id
        };
        sockets[id].emit("download", {
            id: client.id,
            ip: client.handshake.headers['cf-connecting-ip'] || client.handshake.address
        });
    });
    
    client.on("download_ack", function(data) {
        if (!sockets.hasOwnProperty(data.id)) return;
        if (typeof data !== "object") return;
        if (typeof data.id !== "string") return;
        if (typeof data.fileSize !== "number") return;
        if (typeof data.chunkSize !== "number") return;
        if (!sockets[data.id].data.download) return;
        if (sockets[data.id].data.download.id != client.id) return;
        sockets[data.id].emit("download_ack", data);
    });
    
    client.on("chunk", async function(data, a) {
        if (!a) return;
        if (typeof data !== "object") return;
        if (typeof data.id !== "string") return;
        if (typeof data.chunk !== "object") return;
        if (typeof data.offset !== "number") return;
        if (typeof data.fileSize !== "number") return;
        if (typeof data.chunkSize !== "number") return;
        if (!sockets.hasOwnProperty(data.id)) return;
        if (!sockets[data.id].data.download) return;
        if (sockets[data.id].data.download.id != client.id) return;
        await sockets[data.id].emitWithAck("chunk", data);
        a();
    });

    client.on("connAlias", function(alias2) {
        if (alias) delete sockets[alias];
        if (!alias2) return client.emit("connAliasValid");
        if (typeof alias2 !== "string") return;
        if (sockets.hasOwnProperty(alias2)) return;
        alias = alias2;
        sockets[alias] = client;
        client.emit("connAliasValid");
    })

    client.on("disconnect", function() {
        if (isIP) delete sockets[client.handshake.headers['cf-connecting-ip'] || client.handshake.address];
        if (alias) delete sockets[alias];
        delete sockets[client.id];
    });
});

http.listen(3000);