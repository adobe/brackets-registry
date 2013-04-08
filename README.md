## Brackets Extension Registry [![Build Status](https://travis-ci.org/adobe/brackets-registry.png?branch=master)](https://travis-ci.org/adobe/brackets-registry)

A node.js-powered registry for Brackets extensions.

## Setup

1. `npm install`
2. Create a `config` folder at the top level. (This will be ignored by git.)
3. In the `config` folder, put your SSL cert or [create a self-signed cert](http://www.akadia.com/services/ssh_test_certificate.html).
   The key should be in `certificate.key` and the cert should be in `certificate.cert`.
4. Register a GitHub API client app. The callback URL must match the hostname of your
   server. For testing, you could enter `https://localhost:4040/auth/github/callback`.
4. Also in the `config` folder, create a `config.json` file that contains:
   * `sessionSecret` - key to use for session hashing (required)
   * `githubClientId` - client id for registered GitHub app (required)
   * `githubClientSecret` - client secret for registered GitHub app (required)
   * `hostname` - hostname of the server, defaults to localhost
   * `securePort` - port to run HTTPS on, defaults to 4040
   * `redirectPort` - port to run HTTP on, just redirects to `securePort`, defaults to 4000
5. `npm start`

## Debugging REPL

There's an optional REPL available. To set it up:

1. Add `"repl": true` to the config.json file.
2. npm install repl-client -g
3. npm start
4. (in another terminal window) rc /tmp/repl/registry.sock

You'll have the Express "app" available as `app`, and the repository module available as `repository`.

## DropzoneJS

This project uses a slightly modified version of [DropzoneJS](https://github.com/enyo/dropzone). If you need to update it, take a look at the dropzone.js file for CHANGED comments.