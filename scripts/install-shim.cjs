"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHIM_MARKER = exports.BOOTSTRAP_START = exports.BOOTSTRAP_END = void 0;
exports.ensureBootstrap = ensureBootstrap;
exports.installShim = installShim;
exports.resolveCommandPath = resolveCommandPath;
exports.resolveDshHome = resolveDshHome;
exports.resolveGlobalModules = resolveGlobalModules;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const yaml_1 = require("yaml");
const SHIM_MARKER = '// dsh-harmony shim';
exports.SHIM_MARKER = SHIM_MARKER;
const BOOTSTRAP_START = '# dsh-harmony bootstrap begin';
exports.BOOTSTRAP_START = BOOTSTRAP_START;
const BOOTSTRAP_END = '# dsh-harmony bootstrap end';
exports.BOOTSTRAP_END = BOOTSTRAP_END;
function resolveCommandPath(prefix, platform = process.platform) {
    return platform === 'win32' ? (0, node_path_1.join)(prefix, 'dsh') : (0, node_path_1.join)(prefix, 'bin/dsh');
}
function resolveGlobalModules(prefix, platform = process.platform) {
    return platform === 'win32' ? (0, node_path_1.join)(prefix, 'node_modules') : (0, node_path_1.join)(prefix, 'lib/node_modules');
}
function resolveDshHome() {
    const configured = process.env.DSH_HOME?.trim();
    if (configured === undefined || configured === '')
        return (0, node_path_1.join)((0, node_os_1.homedir)(), '.dsh');
    if (configured === '~')
        return (0, node_os_1.homedir)();
    if (configured.startsWith('~/') || configured.startsWith('~\\')) {
        return (0, node_path_1.resolve)((0, node_os_1.homedir)(), configured.slice(2));
    }
    return (0, node_path_1.resolve)(configured);
}
function shimSource({ harmony, official }) {
    return `#!/usr/bin/env node
${SHIM_MARKER}
const { existsSync } = require('node:fs')
const { pathToFileURL } = require('node:url')

const harmony = ${JSON.stringify(harmony)}
const official = ${JSON.stringify(official)}
const target = existsSync(harmony) ? harmony : official

import(pathToFileURL(target).href).catch(error => {
  console.error(error)
  process.exitCode = 1
})
`;
}
function cmdSource() {
    return `@ECHO off
SETLOCAL
SET "_prog=%~dp0node.exe"
IF NOT EXIST "%_prog%" SET "_prog=node"
"%_prog%" "%~dp0dsh" %*
EXIT /B %ERRORLEVEL%
`;
}
function powershellSource() {
    return `#!/usr/bin/env pwsh
$node = Join-Path $PSScriptRoot 'node.exe'
if (-not (Test-Path $node)) { $node = 'node' }
& $node (Join-Path $PSScriptRoot 'dsh') @args
exit $LASTEXITCODE
`;
}
function installShim(paths) {
    if (!(0, node_fs_1.existsSync)(paths.official)) {
        throw new Error('Install @deepseek-ai/dsh globally before installing dsh-harmony');
    }
    const temporary = `${paths.command}.${process.pid}.tmp`;
    (0, node_fs_1.writeFileSync)(temporary, shimSource(paths));
    if ((paths.platform ?? process.platform) !== 'win32')
        (0, node_fs_1.chmodSync)(temporary, 0o755);
    (0, node_fs_1.renameSync)(temporary, paths.command);
    if ((paths.platform ?? process.platform) === 'win32') {
        writeChanged(`${paths.command}.cmd`, cmdSource());
        writeChanged(`${paths.command}.ps1`, powershellSource());
    }
}
function removeBootstrapBlock(source) {
    const start = source.indexOf(BOOTSTRAP_START);
    if (start === -1)
        return source;
    const end = source.indexOf(BOOTSTRAP_END, start);
    if (end === -1)
        return source;
    return `${source.slice(0, start)}${source.slice(end + BOOTSTRAP_END.length)}`.trim();
}
function writeChanged(filename, content) {
    if ((0, node_fs_1.existsSync)(filename) && (0, node_fs_1.readFileSync)(filename, 'utf8') === content)
        return;
    const temporary = `${filename}.${process.pid}.tmp`;
    (0, node_fs_1.writeFileSync)(temporary, content);
    (0, node_fs_1.renameSync)(temporary, filename);
}
function ensureBootstrap({ home, ...paths }) {
    const stateDir = (0, node_path_1.join)(home, 'node_modules/dsh-harmony-bootstrap');
    const bootstrap = (0, node_path_1.join)(stateDir, 'bootstrap.cjs');
    const client = (0, node_path_1.join)(stateDir, 'client.js');
    const installation = (0, node_path_1.join)(stateDir, 'installation.json');
    const manifest = (0, node_path_1.join)(stateDir, 'package.json');
    const patch = (0, node_path_1.join)(home, 'cordis.patch.yml');
    (0, node_fs_1.mkdirSync)(stateDir, { recursive: true });
    const bootstrapSource = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, 'bootstrap.cjs'), 'utf8');
    const clientSource = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '../browser-dist/bootstrap-client.js'), 'utf8');
    const restartSource = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, 'restart.cjs'), 'utf8');
    writeChanged(bootstrap, bootstrapSource);
    writeChanged(client, clientSource);
    writeChanged((0, node_path_1.join)(stateDir, 'restart.cjs'), restartSource);
    writeChanged(installation, `${JSON.stringify(paths, null, 2)}\n`);
    writeChanged(manifest, `${JSON.stringify({
        name: 'dsh-harmony-bootstrap',
        version: '0.1.0',
        main: './bootstrap.cjs',
        exports: { '.': './bootstrap.cjs', './client': './client.js', './package.json': './package.json' },
        dsh: {
            client: {
                inject: [
                    '@deepseek-ai/dsh-client-runtime',
                    '@deepseek-ai/dsh-client-locale',
                    '@deepseek-ai/dsh-client-ui-layout',
                ],
                platform: 'web',
            },
        },
    }, null, 2)}\n`);
    const current = (0, node_fs_1.existsSync)(patch) ? (0, node_fs_1.readFileSync)(patch, 'utf8') : '[]\n';
    const cleaned = removeBootstrapBlock(current);
    const value = (0, yaml_1.parse)(cleaned || '[]');
    if (!Array.isArray(value))
        throw new Error(`${patch} must contain a top-level YAML array`);
    const entries = value;
    const firstContent = cleaned.split('\n').find(line => line.trim() !== '' && !line.trim().startsWith('#'))?.trim();
    const existing = entries.length === 0
        ? ''
        : firstContent?.startsWith('-') ? cleaned.trim() : (0, yaml_1.stringify)(entries).trim();
    const block = `${BOOTSTRAP_START}\n- insert:\n    - id: harmony-bootstrap\n      name: dsh-harmony-bootstrap\n${BOOTSTRAP_END}`;
    writeChanged(patch, `${existing === '' ? '' : `${existing}\n`}${block}\n`);
}
