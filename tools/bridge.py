#!/usr/bin/env python3
"""EspaceWeb local serial/WebSocket bridge. GPL-3.0-or-later.
Pairs with Bluetooth Classic's OS-provided serial port; no arbitrary shell commands.
Run: python bridge.py --port COM5
Only loopback, explicit Origin allowlist and one client; no LAN exposure.
"""
import argparse
import asyncio
import contextlib
import serial
from websockets.asyncio.server import serve

async def run(args):
    lock = asyncio.Lock()
    async def handler(ws):
        if lock.locked():
            await ws.close(1013, 'Adapter already in use')
            return
        async with lock:
            ser = await asyncio.to_thread(serial.Serial, args.port, args.baud, timeout=0.15, write_timeout=3)
            async def serial_to_web():
                while True:
                    data = await asyncio.to_thread(ser.read, 4096)
                    if data:
                        await ws.send(data.decode('ascii', errors='replace'))
            async def web_to_serial():
                async for data in ws:
                    if isinstance(data, str):
                        data = data.encode('ascii')
                    if len(data) > 4096:
                        raise ValueError('Oversized command')
                    await asyncio.to_thread(ser.write, data)
            tasks = [asyncio.create_task(serial_to_web()), asyncio.create_task(web_to_serial())]
            try:
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                for task in tasks:
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await task
                await asyncio.to_thread(ser.close)
    async with serve(handler, '127.0.0.1', args.listen, origins=args.origin, max_size=4096, compression=None):
        print(f'EspaceWeb bridge on ws://127.0.0.1:{args.listen}; serial {args.port}')
        print('Keep this process open; choose local bridge in the web application.')
        await asyncio.Future()

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port', required=True, help='COM5 on Windows, /dev/cu.OBDII on macOS')
    p.add_argument('--baud', type=int, default=38400)
    p.add_argument('--listen', type=int, default=8472)
    p.add_argument('--origin', action='append', default=['https://espace-diagnostika.hazy-trout-2778.chatgpt.site', 'http://localhost:8080', 'http://127.0.0.1:8080'])
    try:
        asyncio.run(run(p.parse_args()))
    except KeyboardInterrupt:
        pass
