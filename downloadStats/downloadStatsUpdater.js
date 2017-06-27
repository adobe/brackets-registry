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

"use strict";

var fs = require("fs"),
    path = require("path"),
    request = require("request-json"),
    temporary = require("temporary"),
    LogfileProcessor = require("./logfileProcessor").LogfileProcessor,
    programArgs = require('commander'),
    Promise = require("bluebird"),
    writeFile = Promise.promisify(require("fs").writeFile);

programArgs
    .version('0.0.1')
    .option('-d, --download', 'Download logfiles from S3')
    .option('-e, --extract', 'Extract Extension download data from downloaded logfiles')
    .option('-t, --tempFolder <path>', 'Path to temp folder (makes it easier to inspect logfiles)')
    .option('-p, --progress [true|false]', 'Print progress information')
    .option('-u, --update <path>', 'Update the extension registry with download data from <path>')
    .option('-v, --verbose [true|false]', 'Increase the level of output')
    .parse(process.argv);

// Workaround: posting to SSL with self signed certificate fails
// https://github.com/mikeal/request/issues/418
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// read the config. This file must exists. Otherwise follow these setup instructions
// https://github.com/adobe/brackets-registry to create it.
var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../config/config.json")));
var httpPort = config.securePort || 4040; // default port for registry webapp
var protocol = config.insecure ? "http" : "https";

// Constants
var DOWNLOAD_STATS_FILENAME = "downloadStats.json",
    RECENT_DOWNLOAD_STATS_FILENAME = "recentDownloadStats.json";

/**
 * This is a helper log function that can be turned on and off by providing `-v``
 * when running this script from the command line.
 */
function log() {
    if (programArgs.verbose) {
        console.log(Array.prototype.slice.apply(arguments).join(' '));
    }
}

// create temp folder for logfiles
var tempFolder = programArgs.tempFolder || config.tempFolder;
if (tempFolder) {
    try {
        fs.mkdirSync(tempFolder);
    } catch (e) {
        // we don't care if the temp directory already exist,
        // since this should only happen during testing.
        // Usually we will use a generated temp dir that is unique
        if (e.code !== "EEXIST") {
            // tell us what went wrong
            console.error(e.toString());
        }
    }
} else {
    tempFolder = new temporary.Dir().path;
    log("Using temp directory:", tempFolder);
}

/**
 * Return a path to the download data file.
 */
function datafilePath() {
    return path.resolve(__dirname, DOWNLOAD_STATS_FILENAME);
}

function downloadLogFiles(progress) {
    var deferred = Promise.defer(),
        logfileProcessor = new LogfileProcessor(config);

    log("Downloading logfiles from S3");

    var promise = logfileProcessor.downloadLogfiles(tempFolder);
    promise.then(function (lastProcessedKey) {
        deferred.resolve();
    });

    if (progress) {
        promise.progressed(function (value) {
            process.stdout.write(value);
        });
    }

    return deferred.promise;
}

function extractExtensionDownloadData(progress) {
    var deferred = Promise.defer(),
        logfileProcessor = new LogfileProcessor(config),
        promise = logfileProcessor.extractDownloadStats(tempFolder);

    log("Extract extension download data from logfiles in", tempFolder);

    promise.then(function (downloadStats) {
        writeFile(datafilePath(), JSON.stringify(downloadStats)).then(function () {
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

function updateExtensionDownloadData(datafile, progress) {
    var deferred = Promise.defer();

    // posting works only from localhost
    var url = protocol + "://localhost:" + httpPort,
        client = request.createClient(url);

    client.sendFile("/stats", path.resolve(datafile), null, function (err, res, body) {
        if (err) {
            console.error(err);
            deferred.reject(err);
        } else {
            log("File uploaded");
            deferred.resolve();
        }
    });

    return deferred.promise;
}

function deleteFolderRecursive(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

function doItAll(progress) {
    downloadLogFiles(progress).then(function () {
        extractExtensionDownloadData(progress).then(function (downloadStats) {
            // posting works only from localhost
            updateExtensionDownloadData(datafilePath(), progress).then(function () {
                // remove the data file after uploading the download data
                fs.unlinkSync(datafilePath());

                if (!config["debug.keepTempFolder"]) {
                    deleteFolderRecursive(tempFolder);
                }
            });
        });
    });
}

// Let's get to work
if (programArgs.download) {
    downloadLogFiles(programArgs.progress);
} else if (programArgs.extract) {
    extractExtensionDownloadData(programArgs.progress);
} else if (programArgs.update) {
    updateExtensionDownloadData(programArgs.update, programArgs.progress);
} else {
    doItAll(programArgs.progress);
}
