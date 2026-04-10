import express from 'express';
import ViteExpress from 'vite-express';
import bodyParser from 'body-parser';
import path from 'path';
import cors from 'cors';
import http from 'http';
import fs from 'fs';

import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

let publicFolder = path.join(__dirname, '..', '..', 'public'); // path.resolve(__dirname, '/../../public')
console.log(`public folder: ${publicFolder}`);
app.use(express.static(publicFolder));
app.use(bodyParser.urlencoded({ extended: true }));

let config = JSON.parse(fs.readFileSync(__dirname + '/../../public/config.json'));

const httpServer = http.createServer(app);

/*
import { Server } from 'socket.io';
const io = new Server(httpServer, {
  cors: {
    // replace with your actual origin
    origin: ["http://0.0.0.0:3000"],
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('a user connected!');
  socket.on('ping', (arg) => {
    socket.emit('state', ok);
});
*/

httpServer.listen(3000, () => {
  console.log("Server is listening!");
});
  
ViteExpress.bind(app, httpServer);
