/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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
/*global expect, describe, it, beforeEach, jasmine */

"use strict";

var routes = require("../lib/routes");

describe("routes", function () {
    var req, res;
    
    beforeEach(function () {
        req = {};
        res = {};
    });
    
    it("should redirect to home page on successful authentication", function () {
        res.redirect = jasmine.createSpy();
        routes._authCallback(req, res);
        expect(res.redirect).toHaveBeenCalledWith("/");
    });
    
    it("should render and inject correct data into the home page when user is not authenticated", function () {
        res.render = jasmine.createSpy();
        routes._index(req, res);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("index");
        expect(res.render.mostRecentCall.args[1].user).toBeUndefined();
    });
    
    it("should render and inject correct data into the home page when user is authenticated", function () {
        req.user = "github:someuser";
        res.render = jasmine.createSpy();
        routes._index(req, res);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("index");
        expect(res.render.mostRecentCall.args[1].user).toBe("github:someuser");
    });

    it("should logout and redirect to home page when logging out", function () {
        req.logout = jasmine.createSpy();
        res.redirect = jasmine.createSpy();
        routes._logout(req, res);
        expect(req.logout).toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith("/");
    });
    
    it("should render failure page if auth failed", function () {
        res.render = jasmine.createSpy();
        routes._authFailed(req, res);
        expect(res.render).toHaveBeenCalledWith("authFailed");
    });
});