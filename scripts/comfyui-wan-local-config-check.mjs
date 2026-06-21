#!/usr/bin/env node

import {
  buildConfigCheckReport,
  parseCliArgs,
  printJson
} from "./comfyui-wan-local-utils.mjs";

const args = parseCliArgs(process.argv.slice(2));

printJson(buildConfigCheckReport({ envFile: args.envFile }));
