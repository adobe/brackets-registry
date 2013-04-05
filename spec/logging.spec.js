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
/*global jasmine, expect, describe, it, beforeEach, afterEach, createSpy */

"use strict";

var rewire        = require("rewire"),
    logging       = rewire("../lib/logging");

var AWS;
var config = {
    "aws.accesskey": "AKID",
    "aws.secretkey": "sekret",
    "sns.topic": "TOPIC!"
};

function MessageSink() {
    this.messages = [];
}

MessageSink.prototype = {
    reset: function () {
        this.messages = [];
    }
};

var fakeUtil    = new MessageSink(),
    fakeConsole = new MessageSink(),
    fakeSNS     = new MessageSink();

fakeUtil.error = function (s) {
    this.messages.push(s);
};

fakeSNS.publish = function (params, callback) {
    this.messages.push(params);
    callback(null, {
        MessageId: new Date().getTime()
    });
};

fakeConsole.log = function (message) {
    this.messages.push(message);
};

logging.__set__("util", fakeUtil);
logging.__set__("console", fakeConsole);

describe("Error Reporter", function () {
    beforeEach(function () {
        AWS = {
        };
        logging.__set__("AWS", AWS);
        fakeUtil.reset();
        fakeSNS.reset();
        fakeConsole.reset();
    });
    
    it("will log a string", function () {
        logging.error("Something went wrong");
        expect(fakeUtil.messages.length).toBe(1);
        expect(fakeUtil.messages[0]).toEqual("Something went wrong");
    });
    
    it("will log an object as JSON", function () {
        var errorObject = {
            context: "Uploading Foo.zip",
            "while": "Validating the file",
            i: "got confused"
        };
        logging.error(errorObject);
        expect(fakeUtil.messages.length).toBe(1);
        expect(fakeUtil.messages[0]).toEqual(JSON.stringify(errorObject, null, 2));
    });
    
    it("will log an error", function () {
        var err = new Error("Failure of Foo");
        logging.error("Had trouble", err);
        expect(fakeUtil.messages.length).toBe(2);
        expect(fakeUtil.messages[0]).toEqual("Had trouble");
        expect(fakeUtil.messages[1]).toEqual(err.stack);
    });
    
    it("can be called with just an error", function () {
        var err = new Error("Failure of Foo");
        logging.error(err);
        expect(fakeUtil.messages.length).toBe(1);
        expect(fakeUtil.messages[0]).toEqual(err.stack);
    });
    
    it("can be configured for SNS", function () {
        var snsOptions;
        
        AWS.SNS = {
            Client: function (options) {
                snsOptions = options;
                return fakeSNS;
            }
        };
        
        logging.configure(config);

        expect(snsOptions).toEqual({
            "accessKeyId": "AKID",
            "secretAccessKey": "sekret",
            "sslEnabled": true
        });
        var err = new Error("Failing, but to SNS");
        logging.error("More trouble", err);
        expect(fakeUtil.messages.length).toBe(2);
        expect(fakeSNS.messages.length).toBe(1);
        expect(fakeSNS.messages[0]).toEqual({
            TopicArn: "TOPIC!",
            Message: JSON.stringify({
                info: "More trouble",
                error: err.stack
            })
        });
    });
    
    it("can be configured for debugging", function () {
        logging.configure({
            "logging.debug": true
        });
        
        logging.debug("Here is a debugging message");
        expect(fakeConsole.messages.length).toBe(1);
        expect(fakeConsole.messages[0]).toEqual("Here is a debugging message");
        expect(fakeUtil.messages.length).toBe(0);
        expect(fakeSNS.messages.length).toBe(0);
    });
    
    it("defaults to no debugging", function () {
        logging.configure({});
        
        logging.debug("Here is a debugging message that is thrown away");
        expect(fakeConsole.messages.length).toBe(0);
        expect(fakeUtil.messages.length).toBe(0);
        expect(fakeSNS.messages.length).toBe(0);
    });
});