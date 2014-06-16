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
/*global expect, describe, it, beforeEach, afterEach, createSpy, waitsFor, spyOn */

"use strict";

var rewire         = require("rewire"),
    downloadData   = rewire("../lib/downloadData"),
    fs             = require("fs"),
    path           = require("path");

// Pull out private functions we want to test
var _collectDownloadedData = downloadData.__get__("_collectDownloadedData");

describe("Download Data", function () {
    var req, res;

    beforeEach(function () {
        res = {
            redirect: createSpy("res.redirect"),
            render: createSpy("res.render"),
            send: createSpy("res.send"),
            status: createSpy("res.status"),
            set: createSpy("res.set")
        };

        req = {};
    });

    describe("Upload", function () {
        var repo = rewire("../lib/repository");

        beforeEach(function () {
            // configure repository with filestorage
            var loaded = false;
            repo.configure({"storage": "../lib/ramstorage.js"});
            spyOn(repo, "addDownloadDataToPackage").andCallThrough();
            var registry = JSON.parse(fs.readFileSync(path.join(path.dirname(module.filename), "testRegistry", "registry.json")));
            repo.__set__("registry", registry);
            setTimeout(function () {
                downloadData.__set__("repository", repo);
                loaded = true;
            }, 100);

            waitsFor(function () {
                return loaded;
            }, "All loaded", 500);
        });

        it("should not accept post request to update the download stats other than localhost/127.0.0.1", function () {
            req.ip = '10.32.1.2';
            req.host = 'www.adobe.com';

            _collectDownloadedData(req, res);
            expect(res.send).toHaveBeenCalledWith(403);
        });

        it("should accept post request to update the download stats from localhost/127.0.0.1", function () {
            req.ip = '127.0.0.1';
            req.host = 'localhost';
            req.files = {file: {path: path.join(path.dirname(module.filename), "stats/downloadStats.json")}};

            _collectDownloadedData(req, res);

            var registry = repo.getRegistry();
            expect(res.send).toHaveBeenCalledWith(202);
            expect(registry["snippets-extension"].versions[0].downloads).toBe(6);
            expect(registry["snippets-extension"].totalDownloads).toBe(29);
        });

        it("should call update addDownloadDataToPackage only once per extension", function () {
            req.ip = '127.0.0.1';
            req.host = 'localhost';
            req.files = {file: {path: path.join(path.dirname(module.filename), "stats/downloadStatsOneExtension.json")}};

            _collectDownloadedData(req, res);

            var registry = repo.getRegistry();
            expect(res.send).toHaveBeenCalledWith(202);
            expect(repo.addDownloadDataToPackage.callCount).toEqual(1);
            expect(registry["snippets-extension"].versions[0].downloads).toBe(6);
            expect(registry["snippets-extension"].totalDownloads).toBe(15265);
        });
    });
});
