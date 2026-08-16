"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = require("node:path");
const install_shim_cjs_1 = require("./install-shim.cjs");
if (process.env.npm_config_global !== 'true')
    process.exit(0);
const prefix = process.env.npm_config_prefix;
if (prefix === undefined || prefix === '')
    throw new Error('npm did not provide its global installation prefix');
const globalModules = (0, install_shim_cjs_1.resolveGlobalModules)(prefix);
const packageRoot = (0, node_path_1.join)(globalModules, 'dsh-harmony');
const paths = {
    command: (0, install_shim_cjs_1.resolveCommandPath)(prefix),
    harmony: (0, node_path_1.join)(packageRoot, 'lib/bin.js'),
    official: (0, node_path_1.join)(globalModules, '@deepseek-ai/dsh/lib/bin.js'),
};
(0, install_shim_cjs_1.installShim)(paths);
(0, install_shim_cjs_1.ensureBootstrap)({ home: (0, install_shim_cjs_1.resolveDshHome)(), ...paths });
process.stdout.write('dsh-harmony installed into the existing dsh command\n');
