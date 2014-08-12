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

var registryUtils = require("../lib/registry_utils");

describe("Registry Utils", function () {
    describe("Format Download URL", function () {
        it("should return the formatted url", function () {
            var formattedURL = registryUtils.formatDownloadURL("http://localhost:1234", "test-extension", "0.0.1");

            expect(formattedURL).toBe("http://localhost:1234/test-extension/test-extension-0.0.1.zip");
        });

        it("should return the formatted url with proper url encoding", function () {
            var formattedURL = registryUtils.formatDownloadURL("http://localhost:1234", "jasonsanjose.brackets-sass", "0.4.1+sha.fc425b5");
            expect(formattedURL).toBe("http://localhost:1234/jasonsanjose.brackets-sass/jasonsanjose.brackets-sass-0.4.1%2Bsha.fc425b5.zip");

            formattedURL = registryUtils.formatDownloadURL("http://localhost:1234", "test-extension", "0.0.1&<>abcdef");
            expect(formattedURL).toBe("http://localhost:1234/test-extension/test-extension-0.0.1%26%3C%3Eabcdef.zip");
        });
    });
});
