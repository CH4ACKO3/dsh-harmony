"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.apply = apply;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_module_1 = require("node:module");
const node_path_1 = require("node:path");
const SHIM_MARKER = '// dsh-harmony shim';
const BOOTSTRAP_START = '# dsh-harmony bootstrap begin';
const BOOTSTRAP_END = '# dsh-harmony bootstrap end';
const stateDir = __dirname;
const home = (0, node_path_1.dirname)((0, node_path_1.dirname)(stateDir));
const patch = (0, node_path_1.join)(home, 'cordis.patch.yml');
const installationFile = (0, node_path_1.join)(stateDir, 'installation.json');
let restartRequired = false;
function sendJson(response, value) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
}
function cleanBootstrap(installation) {
    const source = (0, node_fs_1.readFileSync)(patch, 'utf8');
    const start = source.indexOf(BOOTSTRAP_START);
    const end = source.indexOf(BOOTSTRAP_END, start);
    let cleaned;
    if (start !== -1 && end !== -1) {
        cleaned = `${source.slice(0, start)}${source.slice(end + BOOTSTRAP_END.length)}`.trim();
    }
    else {
        const { dump, load } = (0, node_module_1.createRequire)(installation.official)('js-yaml');
        const value = load(source);
        if (!Array.isArray(value))
            throw new Error(`${patch} must contain a top-level YAML array`);
        const entries = value;
        for (const entry of entries) {
            if (Array.isArray(entry?.insert)) {
                entry.insert = entry.insert.filter(item => item?.id !== 'harmony-bootstrap' && item?.name !== 'dsh-harmony-bootstrap');
            }
        }
        cleaned = dump(entries.filter(entry => !Array.isArray(entry?.insert) || entry.insert.length > 0), { lineWidth: -1 }).trim();
    }
    const content = cleaned.split('\n').some(line => line.trim() !== '' && !line.trim().startsWith('#'))
        ? `${cleaned}\n`
        : '[]\n';
    const temporary = `${patch}.${process.pid}.tmp`;
    (0, node_fs_1.writeFileSync)(temporary, content);
    (0, node_fs_1.renameSync)(temporary, patch);
    for (const file of ['bootstrap.cjs', 'client.js', 'installation.json', 'package.json', 'restart.cjs']) {
        (0, node_fs_1.unlinkSync)((0, node_path_1.join)(stateDir, file));
    }
    (0, node_fs_1.rmdirSync)(stateDir);
}
function installRestartRoute(ctx, installation) {
    ctx.inject(['webServer'], (webCtx) => webCtx.webServer.register({
        kind: 'exact',
        path: '/dsh-harmony-bootstrap/restart',
        handler(request, response) {
            if (request.method === 'GET') {
                return sendJson(response, { restart: restartRequired, bootId: process.pid });
            }
            if (request.method !== 'POST' || !restartRequired) {
                response.writeHead(request.method === 'POST' ? 409 : 405);
                response.end();
                return;
            }
            restartRequired = false;
            sendJson(response, { restarting: true });
            const helper = (0, node_child_process_1.spawn)(process.execPath, [
                (0, node_path_1.join)(stateDir, 'restart.cjs'),
                String(process.pid),
                installation.command,
                JSON.stringify(process.argv.slice(2)),
            ], { detached: true, env: process.env, stdio: 'inherit' });
            helper.unref();
            setImmediate(() => ctx.appExit(0));
        },
    }));
}
function apply(ctx) {
    const installation = JSON.parse((0, node_fs_1.readFileSync)(installationFile, 'utf8'));
    if (!(0, node_fs_1.existsSync)(installation.harmony)) {
        cleanBootstrap(installation);
        return;
    }
    const command = (0, node_fs_1.existsSync)(installation.command) ? (0, node_fs_1.readFileSync)(installation.command, 'utf8') : '';
    if (!command.includes(SHIM_MARKER)) {
        const { installShim } = require((0, node_path_1.join)((0, node_path_1.dirname)((0, node_path_1.dirname)(installation.harmony)), 'scripts/install-shim.cjs'));
        installShim(installation);
        restartRequired = true;
        ctx.logger.warn('Harmony launcher has been restored. Restart dsh to enable Harmony.');
    }
    installRestartRoute(ctx, installation);
}
const inject = ['appExit'];
exports.inject = inject;
