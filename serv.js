const PORT = 5121;
const HOST = "localhost"

import url from 'url';
import net from 'net';
import fs from 'fs';
import http from 'http';
import path from 'path';

const INDEX = "index.html"
const basedir = process.cwd();

let mimemap = {
  ".js" : "application/javascript",
  ".cjs" : "application/javascript",
  ".mjs" : "application/javascript",
  ".json" : "text/json",
  ".html" : "text/html",
  ".png" : "image/png",
  ".jpg" : "image/jpeg",
  ".css" : "text/css",
  ".svg" : "image/svg+xml",
  ".obj" : "model/obj",
  ".mtl" : "model/mtl",
  ".stl" : "model/stl",
  ".fbx" : "application/x-octet-stream",
  ".csv" : "text/csv"
};

let getMime = (p) => {
  p = p.toLowerCase().trim();

  for (let k in mimemap) {
    if (p.endsWith(k)) {
      return mimemap[k];
    }
  }

  return "text/plain";
}

export class ServerResponse extends http.ServerResponse {
  _addHeaders() {
    this.setHeader("X-Content-Type-Options", "nosniff");
    this.setHeader("Access-Control-Allow-Origin", "*");
  }

  sendError(code, message) {
    let buf = `<!doctype html>
<html>
<head><title>404</title></head>
<body><div>${message}<div><body>
</html>
`;

    this.statusCode = code;
    this.setHeader('Host', HOST);
    this.setHeader('Content-Type', 'text/html');
    this.setHeader('Content-Length', buf.length);
    this._addHeaders();

    this.writeHead(code)
    this.end(buf);
  }
}

const serv = http.createServer({
  ServerResponse
}, (req, res) => {
  let p = req.url.trim();

  if (!p.startsWith("/")) {
    p = "/" + p
  }

  if (p.endsWith("/docs")) {
    p += "/docs.html";
  } else if (p.endsWith("/docs/")) {
    p += "docs.html";
  }

  console.log(req.method, p);

  if (p == "/") {
    p += INDEX
  }

  p = path.normalize(basedir + p);
  if (p.search(/\.\./) >= 0 || !p.startsWith(basedir)) {
    //normalize failed
    return res.sendError(500, "malformed path");
  }

  let stt;
  try {
    stt = fs.statSync(p);
  } catch(error) {
    return res.sendError(404, "bad path");
  }

  if (stt === undefined || stt.isDirectory() || !stt.isFile()) {
    console.log("access error for", p);
    return res.sendError(404, "bad path");
  }


  let mime = getMime(p);

  let buf = fs.readFileSync(p);

  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  res._addHeaders();
  res.end(buf);
});

serv.listen(PORT, HOST, () => {
  console.log("Server listening on", 'http://' + HOST + ":" + PORT);
});










