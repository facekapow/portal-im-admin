#!/usr/bin/env node

'use strict';

const minimist = require('minimist');
const socketIo = require('socket.io-client');
const readline = require('readline');
const colors = require('colors');
const argv = minimist(process.argv.slice(2));
const fs = require('fs');
const os = require('os');
const home = os.homedir();
try {
  fs.accessSync(`${home}/.portalrc`);
} catch(e) {
  if (e.code !== 'ENOENT') throw e;
  fs.writeFileSync(`${home}/.portalrc`, fs.readFileSync('./defaultConfig.json'));
}
const cfg = JSON.parse(String(fs.readFileSync(`${home}/.portalrc`)));

let token = argv.t || argv.token;
let command = argv._[0];
let args = argv._.slice(1);
let v = argv.v;
let serverURL = argv.u || argv.url || cfg.serverURL;

if (!serverURL) return console.log('Nope.');
if (command === 'config') {
  cfg.serverURL = serverURL;
  fs.writeFileSync(`${home}/.portalrc`, JSON.stringify(cfg));
  process.exit(0);
}
if (!token) return console.log('Nope.');

const portal = socketIo(serverURL);
if (v) console.log('info: '.green + `connecting to ${serverURL}...`);
portal.on('disconnect', () => v && console.log('info: '.green + 'connection terminated.'));
portal.on('connect', () => {
  if (v) console.log('info: '.green + `connected to ${serverURL}.`);
  const timeoutListener = () => {
    console.log('error: '.red + 'server timed out.');
    portal.close();
    process.exit(1);
  }
  let timer;
  portal.once('ADMIN--VERIFIED', (ok) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (v) console.log('info: '.green + 'token verified.');
    if (!ok) return console.log('error: '.red + 'invalid token.'), portal.close();
    if (!command) {
      portal.on('ADMIN--INFO', (info) => {
        if (timer) {
          clearTimeout(timer);
          timer = setTimeout(timeoutListener, 7000);
        }
        console.log(info);
      });
      portal.on('ADMIN--RESPONSE', (ok, info) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (ok) {
          if (v) console.log('info: '.green + 'command ' + 'successful'.green + '.');
        } else {
          console.log('error: '.red + 'command ' + 'failed'.red + `. info: ${info}`);
        }
        rl.prompt();
      });
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      portal.on('disconnect', () => rl.close());
      const cliCmds = {
        'exit': (cb) => {
          portal.close();
          rl.close();
        },
        'help': (cb) => {
          console.log('command: '.cyan + '.cmds - Lists available server commands.');
          console.log('command: '.cyan + '.exit - Exists the CLI, closing the connection with the server if active.');
          console.log('command: '.cyan + '.help - Displays this help prompt.');
          cb();
        },
        'cmds': (cb) => {
          portal.once('ADMIN--RETURN-COMMANDS', (cmds, info) => {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            if (!cmds) return console.log('error: '.red + info);
            for (let cmd of Object.keys(cmds)) {
              console.log('server command: '.cyan + `${cmd} - ${cmds[cmd]}.`);
            }
            cb();
          });
          portal.emit('ADMIN--GET-COMMANDS', token);
          timer = setTimeout(timeoutListener, 7000);
        }
      }
      rl.setPrompt('ADMIN> ');
      rl.on('line', (cmdStr) => {
        let cmd;
        if (cmdStr.substr(0, 1) === '.') {
          cmd = cliCmds[cmdStr.substr(1)];
          if (!cmd) return console.log('error: '.red + 'unknown CLI command.'), rl.prompt();
          const continuePrompt = cmd(() => rl.prompt());
          if (!continuePrompt) return;
        }
        if (v) console.log('info: '.green + 'sending command...');
        const cmdArr = cmdStr.split(' ');
        cmd = cmdArr[0];
        const args = cmdArr.slice(1);
        if (!cmd) return console.log('error: '.red + 'can\'t send empty command!');
        portal.emit.apply(portal, ['ADMIN--COMMAND', token, cmd.toUpperCase()].concat(args));
        timer = setTimeout(timeoutListener, 7000);
      });
      console.log('info: '.green + '\'.exit\' to exit; \'.help\' for additional help.');
      rl.prompt();
    } else {
      if (v) console.log('info: '.green + 'sending command...');
      portal.once('ADMIN--INFO', (info) => {
        if (timer) {
          clearTimeout(timer);
          timer = setTimeout(timeoutListener, 7000);
        }
        if (v) console.log('info: '.green + `info received: ${info}`);
      });
      portal.once('ADMIN--RESPONSE', (ok, info) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (ok) {
          if (v) console.log('info: '.green + 'command ' + 'successful'.green + '.');
        } else {
          console.log('error:'.red + 'command ' + 'failed'.red + `. info: ${info}`);
        }
        if (v) console.log('info: '.green + 'terminating connection...');
        portal.close();
      });
      portal.emit.apply(portal, ['ADMIN--COMMAND', token, command.toUpperCase()].concat(args));
      timer = setTimeout(timeoutListener, 7000);
      if (v) console.log('info: '.green + 'command sent.');
    }
  });
  portal.emit('ADMIN--VERIFY-TOKEN', token);
  timer = setTimeout(timeoutListener, 7000);
  if (v) console.log('info: '.green + 'verifiying token...');
});
