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
    LogfileProcessor = require("./logfileProcessor").LogfileProcessor;

// read the config
var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../config/config.json")));
var lastProcessedTimestamp = {};

try {
    lastProcessedTimestamp = JSON.parse(fs.readFileSync(path.resolve(__dirname, "lastProcessedLogfile.json")));

    if (! lastProcessedTimestamp.ts) {
        lastProcessedTimestamp.ts = 0;
    }
} catch (Exception) {
    lastProcessedTimestamp.ts = 0;
}

// Constants
var DOWNLOAD_STATS_FILENAME = "downloadStats.json";

// create temp folder for logfiles
var tempFolder = config.tempFolder;
if (config.tempFolder) {
    try {
        fs.mkdirSync(tempFolder);
    } catch(Exception) {
        console.log('Tempfolder already exists');
    }
} else {
    tempFolder = new temporary.Dir().path;
    console.log("Using temp directory: (%s)", tempFolder);
}

var logfileProcessor = new LogfileProcessor(config);

var promise = logfileProcessor.downloadLogfiles(tempFolder, lastProcessedTimestamp.ts);
promise.then(function (timestampLastProcessedLogfile) {
    fs.writeFileSync(path.resolve(__dirname, "lastProcessedLogfile.json"), JSON.stringify({ts: Date.parse(timestampLastProcessedLogfile)}));
    logfileProcessor.extractDownloadStats(tempFolder).then(function (downloadStats) {
        logfileProcessor.getRecentDownloads(tempFolder).then(function (json) {
            downloadStats["recentDownloads"] = json;
            fs.writeFileSync(DOWNLOAD_STATS_FILENAME, JSON.stringify(downloadStats));

            // posting works only from localhost
            var client = request.newClient("http://localhost:" + config.port);
            client.sendFile("/stats", path.resolve(__dirname, DOWNLOAD_STATS_FILENAME), null, function (err, res, body) {
                if (err) {
                    console.error(err);
                } else {
                    console.log("File uploaded");
                }
            });

            if (!config['debug.keepTempFolder']) {
                fs.rmdirSync(tempFolder);
            }
        });
    });
});
