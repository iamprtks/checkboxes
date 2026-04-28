import http from "node:http"
import path from "node:path";

import express from "express";
//pnpm install socket.io
import { Server } from "socket.io";
import { publisher, subscriber, redis } from './redis-connection.js'

const CHECKBOX_SIZE = 100;
const CHECKBOX_STATE_KEY = 'checkbox-state'

const state = {
    checkboxes: new Array(CHECKBOX_SIZE).fill(false)
}

async function main(){
    const PORT = process.env.PORT ?? 8000;

    const app = express();
    const server = http.createServer(app);

    const io = new Server();
    io.attach(server);

    await subscriber.subscribe('internal-server:checkbox:change');
    subscriber.on('message', (channel, message)=>{
        if(channel === 'internal-server:checkbox:change'){
            const { index, checked} = JSON.parse(message);
            state.checkboxes[index]=checked;
            io.emit('server:checkbox:change', { index, checked })
        }
    })

    //socket IO Handler
    io.on('connection',(socket)=>{
        console.log(`Socket connected`,{id:socket.id})

        socket.on('client:checkbox:change',async (data)=>{
            console.log(`[Socket:${socket.id}]:client:checkbox:change`,data);
            //io.emit('server:checkbox:change',data) // broadcast to all clients
            //state.checkboxes[data.index]= data.checked;
            const existingState = await redis.get(CHECKBOX_STATE_KEY);

            if(existingState){
                const remoteData = JSON.parse(existingState);
                remoteData[data.index] = data.checked;
                await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remoteData));
            }
            else{
                await redis.set(
                    CHECKBOX_STATE_KEY,
                    JSON.stringify(new Array(CHECKBOX_SIZE).fill(false)),
                );
            }

            publisher.publish(
                'internal-server:checkbox:change',
                JSON.stringify(data),
            )
        });
    })
    //express

    app.use(express.static(path.resolve('./public')));
    app.get('/health', (req,res)=>{
        res.json({ healthy: true })
    })
    app.get('/checkboxes',async (req,res)=>{
        const existingState = await redis.get(CHECKBOX_STATE_KEY)
        if(existingState){
            const remoteData = JSON.parse(existingState);
            return res.json({ checkboxes: remoteData });
        }
        return res.json({ checkboxes: new Array(CHECKBOX_SIZE).fill(false) })
    })
    // fetch('/checkboxes')
    server.listen(PORT,()=>{
        console.log(`server is running on PORT http://localhost:${PORT}`)
    }) 
}
main()