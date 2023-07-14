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
        "help": {
            type: "boolean",
            short: "h",
            default: false
        },
        "downloadid": {
            type: "string",
            short: "i"
        },
        "show-download-id": {
            type: "string",
            short: "d",
            multiple: true
        },
        "stop-after-download": {
            type: "boolean",
            short: "o"
        },
        "chunk": {
            type: "string",
            short: "c",
            default: "1048576"
        }
    },
    allowPositionals: true
});
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

if (params.values.help) {
    console.log("nodeup ... [infile]");
    console.log("\t--server, -s <server-url> : server url");
    console.log("\t--help, -h : show the help page");
    console.log("\t--downloadid, -i <download-id> : download alias");
    console.log("\t--show-download-id, -d : show download id. can be socket, ip, alias.");
    console.log("\t--stop-after-download, -o : stop running after one download");
    console.log("\t--chunk, -c : set chunk size, bytes");
    console.log("\t[infile] : file that will be the result of the upload");
} else {
    let socket = io(params.values.server);
    socket.on("connect", function() {
        let correctOptions = (params.values["show-download-id"] || []).filter(a => ["socket", "ip", "alias"].includes(a));
        socket.emit("connAlias", params.values.downloadid);
        socket.once("useIP", (b) => correctOptions = correctOptions.map(a => a == "ip" ? b : a));
        socket.once("connAliasValid", () => correctOptions = correctOptions.map(a => a == "alias" ? params.values.downloadid : a));
        correctOptions = correctOptions.map(a => a == "socket" ? socket.id : a);
        if (correctOptions.includes("ip") || correctOptions.includes("alias")) setTimeout(() => console.log(correctOptions.join(",")), 1000);
        else console.log(correctOptions.join(","));
        socket.once("download", async function downloadHandler(handshakeData) {
            let file = params.positionals[0];
            let fileStream = fs.openSync(file, "r");
            let fileSize = fs.statSync(file).size;
            socket.emit("download_ack", {
                id: handshakeData.id,
                fileSize: fileSize,
                chunkSize: Number(params.values.chunk)
            });
            if (!params.values["stop-after-download"]) socket.once("download", downloadHandler);
            if (params.values["stop-after-download"]) process.exit(0);

            let offset = 0;
            let buf = Buffer.alloc(Math.min(fileSize - offset, Number(params.values.chunk)));
            fs.readSync(fileStream, buf, 0, Math.min(fileSize - offset, Number(params.values.chunk)), offset);
            while (offset <= fileSize) {
                await emitWithAck(socket, "chunk", {
                    id: handshakeData.id,
                    chunk: buf,
                    offset: offset,
                    fileSize: fileSize,
                    chunkSize: Number(params.values.chunk)
                });
                offset = offset + Number(params.values.chunk);
                if (offset >= fileSize) break;
                buf = Buffer.alloc(Math.min(fileSize - offset, Number(params.values.chunk)));
                fs.readSync(fileStream, buf, 0, Math.min(fileSize - offset, Number(params.values.chunk)), offset);
            }
        });
    });
}

function emitWithAck(socket, ...args) {
    return new Promise(function(resolve) {
        socket.emit(...args, (...b) => resolve(...b));
    });
}