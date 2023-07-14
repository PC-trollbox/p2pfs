const io = require("socket.io-client");
const fs = require("fs");
const util = require("util");
const params = util.parseArgs({
    options: {
        server: {
            type: "string",
            short: "s",
            default: "https://p2pfs-repl.pcprojects.tk/"
        },
        "show-download-stats": {
            type: "boolean",
            short: "d",
            default: false
        },
        "help": {
            type: "boolean",
            short: "h",
            default: false
        },
        "downloadid": {
            type: "string",
            short: "i"
        }
    },
    allowPositionals: true
});
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

if (params.values.help) {
    console.log("nodedown ... [endfile]");
    console.log("\t--server, -s <server-url> : server url");
    console.log("\t--show-download-stats, -d : show download stats");
    console.log("\t--help, -h : show the help page");
    console.log("\t--downloadid, -i <download-id> : download ID in the form of socket ID, IP or alias");
    console.log("\t[endfile] : file that will be the result of the download");
} else {
    let socket = io(params.values.server);
    socket.on("connect", function() {
        let invalidate = false;
        socket.emit("download_request", params.values.downloadid);
        socket.once("disconnect", () => invalidate = true);
        socket.once("download_ack", function(handshakeData) {
            if (invalidate) return;
            let endFile = params.positionals[0] ? fs.createWriteStream(params.positionals[0]) : process.stdout;
            let speeds = [];
            let transferredBytesPerSecond = 0;
            let previousSpeedDate = Date.now();
            socket.once("chunk", function chunkHandler(chunkData, ack) {
                if (invalidate) return;
                endFile.write(chunkData.chunk);
                if (params.values["show-download-stats"]) {
                    transferredBytesPerSecond += handshakeData.chunkSize;
                    if (previousSpeedDate + 1000 < Date.now()) {
                        previousSpeedDate = Date.now();
                        speeds.push(transferredBytesPerSecond);
                        transferredBytesPerSecond = 0;
                    }
                    process.stderr.write("\rdownloaded " + bytesToReadable(Math.min(chunkData.offset + handshakeData.chunkSize, handshakeData.fileSize)) + " out of " + bytesToReadable(handshakeData.fileSize) + " | " + bytesToReadable(avg(speeds)) + "/s");
                }
                ack();
                socket.once("chunk", chunkHandler);
                if ((chunkData.offset + handshakeData.chunkSize) >= handshakeData.fileSize) process.exit(0);
            });
        });
    });
}

function bytesToReadable(bytes) {
    bytes = Math.floor(bytes);
    let readable = "";
    if (Math.floor(bytes / 1024 / 1024 / 1024)) readable = readable + Math.floor(bytes / 1024 / 1024 / 1024) + " GB ";
    if (Math.floor(bytes / 1024 / 1024 % 1024)) readable = readable + Math.floor(bytes / 1024 / 1024 % 1024) + " MB ";
    if (Math.floor(bytes / 1024 % 1024)) readable = readable + Math.floor(bytes / 1024 % 1024) + " KB ";
    if (Math.floor(bytes % 1024)) readable = readable + (bytes % 1024) + " B ";
    readable = readable.trim();
    return readable;
}