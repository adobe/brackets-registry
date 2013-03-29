## Brackets Extension Registry [![Build Status](https://travis-ci.org/adobe/brackets-registry.png?branch=master)](https://travis-ci.org/adobe/brackets-registry)

A node.js-powered registry for Brackets extensions.

## Setup

1. `npm install`
2. Create a "config" folder at the top level. (This will be ignored by git.)
3. In the "config" folder, put your SSL cert or [create a self-signed cert][1].
   The key should be in "certificate.key" and the cert should be in "certificate.cert".
4. Register a GitHub API client app. The callback URL must match the hostname of your
   server. For testing, you could enter "https://localhost:4040/auth/github/callback".
4. Also in the "config" folder, create a config.json file that contains:
   * sessionSecret - key to use for session hashing
   * githubClientId - client id for registered GitHub app
   * githubClientSecret - client secret for register GitHub app
   * hostname - hostname of the server, defaults to localhost
   * port - port to run on, defaults to 4040
5. `npm start`

    [1]: http://www.akadia.com/services/ssh_test_certificate.html
