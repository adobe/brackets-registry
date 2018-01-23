## Brackets Extension Registry [![Build Status](https://travis-ci.org/adobe/brackets-registry.png?branch=master)](https://travis-ci.org/adobe/brackets-registry)

A node.js-powered registry for Brackets extensions.

__Note:__ If you discovered any issue with the extension registry or have an idea for improvement, please file a bug in the [brackets issue tracker](https://github.com/adobe/brackets/issues).

## Setup

1. `npm install`
2. Create a `config` folder at the top level. (This will be ignored by git.)
3. In the `config` folder, put your SSL cert or [create a self-signed cert](http://www.akadia.com/services/ssh_test_certificate.html).
   The key should be in `certificate.key` and the cert should be in `certificate.cert`.
4. Register a GitHub API [client app](https://github.com/settings/applications). The callback URL must match the hostname of your
   server. For testing, you could enter `https://localhost:4040/auth/github/callback`.
4. Also in the `config` folder, create a `config.json` file that contains:
   * `sessionSecret` - key to use for session hashing (required)
   * `githubClientId` - client id for registered GitHub app (required)
   * `githubClientSecret` - client secret for registered GitHub app (required)
   * `hostname` - hostname of the server, defaults to localhost
   * `securePort` - port to run HTTPS on, defaults to 4040
   * `redirectPort` - port to run HTTP on, just redirects to `securePort`, defaults to 4000
   * `rss.title` - Title used for RSS feed, defaults to ''
   * `rss.description` - Description used for RSS feed, defaults to ''
   * `rss.feedURL` - URL used for RSS feed, defaults to '' (this is the URL used in the feed itself, not the URL used for the feed)
   * `rss.siteURL` - URL used for main site URL in the RSS feed, defaults to '' (see note above, both URLs here are used in the metadata of the feed)
   * `admins` - a list of "github:username" strings for people that are authorized to administer the packages in the registry
   * `aws.accesskey` - AWS accesskey is required for saving to S3
   * `aws.secretkey` - also required for saving to S3
   * `s3.bucket` - S3 bucket name that is used to store the data
   * `sns.topic` - If you're using [SNS](https://aws.amazon.com/sns/) for errors, configure this setting to have the errors sent to SNS

5. `npm start`

## Developing CSS  
While the js, and html can be modified right in the repository, the sass stylesheets for brackets-registry exist in another repository - [brackets-site-sass](https://github.com/adobe/brackets-site-sass), and are included in as a submodule.

This is because the same style sheets are shared by [brackets.io](https://github.com/adobe/brackets.io) as well.

Refer to the section below for assistance on how to develop the css for brackets-registry

- Requirements 
    - Git command line tools — follow the setup instructions on [GitHub](https://help.github.com/articles/set-up-git) or download [here](http://git-scm.com/downloads)
    - [NodeJS installed](https://nodejs.org/en/download/current/)
- Steps to follow
    - Open gitbash (or any other command line shell of your choice, that supports git & node) & clone the repository  
    
        ```bash
        git clone https://github.com/adobe/brackets-registry.git
        cd brackets-registry
        ```  
        
    - Update the brackets-site-sass submodule
    
        ```bash
        git submodule update --init
        ```  
        
    - Change directory to the brackets-site-sass submodule  
    
        ```bash
        cd public/dev
        ```  
        
    - Get the development dependencies for the submodule  
    
        ```bash
        npm install
        ```  
        
      The brackets-site-sass folder contains the scss folder, which contains the sass files that were used to develop the minified css(brackets.min.css). Any modification that needs to be made to the minified css must be made by compiling these scss files.
    
    - And then run the auto-compile grunt task  
    
        ```bash
        grunt watch
        ```  
        
    The above task will watch the _scss_ folder for any changes. Post this, you can modify the files in the scss folder and _brackets.min.css_ will be automatically generated in the css folder.
      
    **Note:** You must keep the grunt task running for the automatic compilation to work, so don't close the
    shell running the task.  
    
    **Note:** Also, test the new styles with brackets.io as well, and update the minified css there as well.
    
    **Note:** Chrome generally caches resources, and so sometimes, even on reloading, code changes are not reflected. In such a case, use the [Empty Cache and Hard Reload](http://www.thewindowsclub.com/empty-cache-hard-reload-chrome) option in Chrome.

## Debugging REPL

There's an optional REPL available. To set it up:

1. Add `"repl": true` to the config.json file.
2. npm install repl-client -g
3. npm start
4. (in another terminal window) rc /tmp/repl/registry.sock

You'll have the Express "app" available as `app`, and the repository module available as `repository`.

## DropzoneJS

This project uses a slightly modified version of [DropzoneJS](https://github.com/enyo/dropzone). If you need to update it, take a look at the dropzone.js file for CHANGED comments.

## Glyphicons

This repository also includes the [Glyphicons](http://glyphicons.com/) Halflings set that ships with [Bootstrap](http://getbootstrap.com/). Thank you to all of the contributors to open source software that we use.
