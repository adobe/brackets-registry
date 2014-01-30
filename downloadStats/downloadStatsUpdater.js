/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, node: true, nomen: true,
indent: 4, maxerr: 50 */

"use strict";

var fs = require("fs"),
    path = require("path"),
    request = require("request-json"),
    temporary = require("temporary"),
    LogfileProcessor = require("./logfileProcessor").LogfileProcessor,
    program = require('commander'),
    Promise = require("bluebird"),
    writeFile = Promise.promisify(require("fs").writeFile);

program
    .version('0.0.1')
    .option('-d, --download', 'Download logfiles from S3')
    .option('-e, --extract', 'Extract Extension download data from downloaded logfiles')
    .option('-d, --downloadStats', 'Generate rolling download data')
    .option('-t, --tempFolder <path>', 'Path to temp folder (makes it easier to inspect logfiles)')
    .option('-p, --progress [true|false]', 'Print progress information')
    .option('-v, --verbose [true|false]', 'Increase the level of output')
    .parse(process.argv);

// Workaround: posting to SSL with self signed certificate fails
// https://github.com/mikeal/request/issues/418
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// read the config. This file must exists. Otherwise follow these setup instructions
// https://github.com/adobe/brackets-registry to create it.
var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../config/config.json")));
var lastProcessedTimestamp = {};
var httpPort = config.port || 4040; // default port for registry webapp
var protocol = config.insecure ? "http" : "https";

try {
    lastProcessedTimestamp = JSON.parse(fs.readFileSync(path.resolve(__dirname, "lastProcessedLogfile.json")));

    if (!lastProcessedTimestamp.ts) {
        lastProcessedTimestamp.ts = 0;
    }
} catch (Exception) {
    lastProcessedTimestamp.ts = 0;
}

/**
 * This is a helper log function that can be turned on and off by providing `-v``
 * when running this script from the command line.
 */
function log() {
    if (program.verbose) {
        console.log(Array.prototype.slice.apply(arguments).join(' '));
    }
}

// Constants
var DOWNLOAD_STATS_FILENAME = "downloadStats.json",
    RECENT_DOWNLOAD_STATS_FILENAME = "recentDownloadStats.json";

// create temp folder for logfiles
var tempFolder = config.tempFolder || program.tempFolder;
if (tempFolder) {
    try {
        fs.mkdirSync(tempFolder);
    } catch (e) {
        if (e.code !== "EEXIST") {
            // tell us what went wrong
            console.error(e.toString());
        }
    }
} else {
    tempFolder = new temporary.Dir().path;
    log("Using temp directory:", tempFolder);
}

function downloadLogFiles(progress) {
    var deferred = Promise.defer();

    log("Downloading logfiles from S3");

    var logfileProcessor = new LogfileProcessor(config);
    var promise = logfileProcessor.downloadLogfiles(tempFolder, lastProcessedTimestamp.ts);
    promise.then(function (timestampLastProcessedLogfile) {
        writeFile(path.resolve(__dirname, "lastProcessedLogfile.json"), JSON.stringify({ts: Date.parse(timestampLastProcessedLogfile)})).then(function () {
            deferred.resolve();
        });
    });

    if (progress) {
        promise.progressed(function (value) {
            process.stdout.write(value);
        });
    }

    return deferred.promise;
}

function extractExtensionDownloadData(progress) {
    var deferred = Promise.defer();

    log("Extract extension download data from logfiles in", tempFolder);

    var logfileProcessor = new LogfileProcessor(config);
    var promise = logfileProcessor.extractDownloadStats(tempFolder);
    promise.then(function (downloadStats) {
        writeFile(DOWNLOAD_STATS_FILENAME, JSON.stringify(downloadStats)).then(function () {
            deferred.resolve(downloadStats);
        });
    });

    if (progress) {
        promise.progressed(function (value) {
            process.stdout.write(value);
        });
    }

    return deferred.promise;
}

function generateRecentDownloadStats(progress) {
    var deferred = Promise.defer();

    // create temp folder only for this operation
    var tempFolder = new temporary.Dir().path;

    log("Generate recent extension download data from logfiles in", tempFolder);

    var logfileProcessor = new LogfileProcessor(config);
    var promise = logfileProcessor.getRecentDownloads(tempFolder);

    promise.then(function (json) {
        writeFile(RECENT_DOWNLOAD_STATS_FILENAME, JSON.stringify(json)).then(function () {
            deferred.resolve(json);
        });
    });

    if (progress) {
        promise.progressed(function (value) {
            process.stdout.write(value);
        });
    }

    return deferred.promise;
}

function doItAll(progress) {
    downloadLogFiles(progress).then(function () {
        extractExtensionDownloadData(progress).then(function (downloadStats) {
            generateRecentDownloadStats(progress).then(function (recentDownloads) {
                downloadStats.recentDownloads = recentDownloads;

                writeFile(DOWNLOAD_STATS_FILENAME, JSON.stringify(downloadStats)).then(function () {
                    // posting works only from localhost
                    var client = request.newClient(protocol + "://localhost:" + httpPort);
                    client.sendFile("/stats", path.resolve(__dirname, DOWNLOAD_STATS_FILENAME), null, function (err, res, body) {
                        if (err) {
                            console.error(err);
                        } else {
                            log("File uploaded");
                        }
                    });

                    if (!config["debug.keepTempFolder"]) {
                        fs.rmdirSync(tempFolder);
                    }
                });
            });
        });
    });
}

// Let's get to work
if (program.download) {
    downloadLogFiles(program.progress);
} else if (program.extract) {
    extractExtensionDownloadData(program.progress);
} else if (program.downloadStats) {
    generateRecentDownloadStats(program.progress);
} else {
    doItAll(program.progress);
}
