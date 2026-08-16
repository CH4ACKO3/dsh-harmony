"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const [parentText, command, argsText] = process.argv.slice(2);
if (parentText === undefined || command === undefined || argsText === undefined) {
    throw new Error('restart requires a parent PID, command, and serialized arguments');
}
const parent = Number(parentText);
const args = JSON.parse(argsText);
const timer = setInterval(() => {
    try {
        process.kill(parent, 0);
    }
    catch {
        clearInterval(timer);
        const child = (0, node_child_process_1.spawn)(process.execPath, [command, ...args], { detached: true, env: process.env, stdio: 'inherit' });
        child.unref();
    }
}, 100);
