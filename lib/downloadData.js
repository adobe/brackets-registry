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

/*jslint vars: true, plusplus: true, nomen: true, node: true, indent: 4, maxerr: 50 */

"use strict";

var repository = require("./repository"),
    logging    = require("./logging"),
    fs         = require('fs');

function _collectDownloadedData(req, res) {
    logging.debug("Request IP", req.ip);
    logging.debug("Request HOST", req.host);

    if (req.ip === "127.0.0.1" && req.host === "localhost") {
        // read the uploaded JSON data
        var obj = JSON.parse(fs.readFileSync(req.files.file.path));

        Object.keys(obj).forEach(function (extensionName, num) {
            repository.addDownloadDataToPackage(extensionName,
                                                obj[extensionName].downloads.versions,
                                                obj[extensionName].downloads.recent);
        });

        res.send(202); // indicate that everything is alright
    } else {
        // uploads are only allowed from localhost to prevent DoS attacks
        res.send(403); // Forbidden
    }
}

exports.collectDownloadedData = _collectDownloadedData;