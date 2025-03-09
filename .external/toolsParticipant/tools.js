"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunInTerminalTool = exports.FindFilesTool = exports.TabCountTool = void 0;
exports.registerChatTools = registerChatTools;
var vscode = require("vscode");
function registerChatTools(context) {
    context.subscriptions.push(vscode.lm.registerTool('copilot-mcp_tabCount', new TabCountTool()));
    context.subscriptions.push(vscode.lm.registerTool('copilot-mcp_findFiles', new FindFilesTool()));
    context.subscriptions.push(vscode.lm.registerTool('copilot-mcp_runInTerminal', new RunInTerminalTool()));
}
var TabCountTool = /** @class */ (function () {
    function TabCountTool() {
    }
    TabCountTool.prototype.invoke = function (options, _token) {
        return __awaiter(this, void 0, void 0, function () {
            var params, group, nth, group;
            return __generator(this, function (_a) {
                params = options.input;
                if (typeof params.tabGroup === 'number') {
                    group = vscode.window.tabGroups.all[Math.max(params.tabGroup - 1, 0)];
                    nth = params.tabGroup === 1
                        ? '1st'
                        : params.tabGroup === 2
                            ? '2nd'
                            : params.tabGroup === 3
                                ? '3rd'
                                : "".concat(params.tabGroup, "th");
                    return [2 /*return*/, new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("There are ".concat(group.tabs.length, " tabs open in the ").concat(nth, " tab group."))])];
                }
                else {
                    group = vscode.window.tabGroups.activeTabGroup;
                    return [2 /*return*/, new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("There are ".concat(group.tabs.length, " tabs open."))])];
                }
                return [2 /*return*/];
            });
        });
    };
    TabCountTool.prototype.prepareInvocation = function (options, _token) {
        return __awaiter(this, void 0, void 0, function () {
            var confirmationMessages;
            return __generator(this, function (_a) {
                confirmationMessages = {
                    title: 'Count the number of open tabs',
                    message: new vscode.MarkdownString("Count the number of open tabs?" +
                        (options.input.tabGroup !== undefined
                            ? " in tab group ".concat(options.input.tabGroup)
                            : '')),
                };
                return [2 /*return*/, {
                        invocationMessage: 'Counting the number of tabs',
                        confirmationMessages: confirmationMessages,
                    }];
            });
        });
    };
    return TabCountTool;
}());
exports.TabCountTool = TabCountTool;
var FindFilesTool = /** @class */ (function () {
    function FindFilesTool() {
    }
    FindFilesTool.prototype.invoke = function (options, token) {
        return __awaiter(this, void 0, void 0, function () {
            var params, files, strFiles;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = options.input;
                        return [4 /*yield*/, vscode.workspace.findFiles(params.pattern, '**/node_modules/**', undefined, token)];
                    case 1:
                        files = _a.sent();
                        strFiles = files.map(function (f) { return f.fsPath; }).join('\n');
                        return [2 /*return*/, new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("Found ".concat(files.length, " files matching \"").concat(params.pattern, "\":\n").concat(strFiles))])];
                }
            });
        });
    };
    FindFilesTool.prototype.prepareInvocation = function (options, _token) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        invocationMessage: "Searching workspace for \"".concat(options.input.pattern, "\""),
                    }];
            });
        });
    };
    return FindFilesTool;
}());
exports.FindFilesTool = FindFilesTool;
function waitForShellIntegration(terminal, timeout) {
    return __awaiter(this, void 0, void 0, function () {
        var resolve, reject, p, timer, listener;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    p = new Promise(function (_resolve, _reject) {
                        resolve = _resolve;
                        reject = _reject;
                    });
                    timer = setTimeout(function () { return reject(new Error('Could not run terminal command: shell integration is not enabled')); }, timeout);
                    listener = vscode.window.onDidChangeTerminalShellIntegration(function (e) {
                        if (e.terminal === terminal) {
                            clearTimeout(timer);
                            listener.dispose();
                            resolve();
                        }
                    });
                    return [4 /*yield*/, p];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
var RunInTerminalTool = /** @class */ (function () {
    function RunInTerminalTool() {
    }
    RunInTerminalTool.prototype.invoke = function (options, _token) {
        return __awaiter(this, void 0, void 0, function () {
            var params, terminal, e_1, execution, terminalStream, terminalResult, _a, terminalStream_1, terminalStream_1_1, chunk, e_2_1;
            var _b, e_2, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        params = options.input;
                        terminal = vscode.window.createTerminal('Language Model Tool User');
                        terminal.show();
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, waitForShellIntegration(terminal, 5000)];
                    case 2:
                        _e.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _e.sent();
                        return [2 /*return*/, new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(e_1.message)])];
                    case 4:
                        execution = terminal.shellIntegration.executeCommand(params.command);
                        terminalStream = execution.read();
                        terminalResult = '';
                        _e.label = 5;
                    case 5:
                        _e.trys.push([5, 10, 11, 16]);
                        _a = true, terminalStream_1 = __asyncValues(terminalStream);
                        _e.label = 6;
                    case 6: return [4 /*yield*/, terminalStream_1.next()];
                    case 7:
                        if (!(terminalStream_1_1 = _e.sent(), _b = terminalStream_1_1.done, !_b)) return [3 /*break*/, 9];
                        _d = terminalStream_1_1.value;
                        _a = false;
                        chunk = _d;
                        terminalResult += chunk;
                        _e.label = 8;
                    case 8:
                        _a = true;
                        return [3 /*break*/, 6];
                    case 9: return [3 /*break*/, 16];
                    case 10:
                        e_2_1 = _e.sent();
                        e_2 = { error: e_2_1 };
                        return [3 /*break*/, 16];
                    case 11:
                        _e.trys.push([11, , 14, 15]);
                        if (!(!_a && !_b && (_c = terminalStream_1.return))) return [3 /*break*/, 13];
                        return [4 /*yield*/, _c.call(terminalStream_1)];
                    case 12:
                        _e.sent();
                        _e.label = 13;
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        if (e_2) throw e_2.error;
                        return [7 /*endfinally*/];
                    case 15: return [7 /*endfinally*/];
                    case 16: return [2 /*return*/, new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(terminalResult)])];
                }
            });
        });
    };
    RunInTerminalTool.prototype.prepareInvocation = function (options, _token) {
        return __awaiter(this, void 0, void 0, function () {
            var confirmationMessages;
            return __generator(this, function (_a) {
                confirmationMessages = {
                    title: 'Run command in terminal',
                    message: new vscode.MarkdownString("Run this command in a terminal?" +
                        "\n\n```\n".concat(options.input.command, "\n```\n")),
                };
                return [2 /*return*/, {
                        invocationMessage: "Running command in terminal",
                        confirmationMessages: confirmationMessages,
                    }];
            });
        });
    };
    return RunInTerminalTool;
}());
exports.RunInTerminalTool = RunInTerminalTool;
