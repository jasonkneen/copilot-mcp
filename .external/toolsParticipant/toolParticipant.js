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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTsxToolUserMetadata = isTsxToolUserMetadata;
exports.registerToolUserChatParticipant = registerToolUserChatParticipant;
var prompt_tsx_1 = require("@vscode/prompt-tsx");
var vscode = require("vscode");
var toolsPrompt_1 = require("./toolsPrompt");
function isTsxToolUserMetadata(obj) {
    // If you change the metadata format, you would have to make this stricter or handle old objects in old ChatRequest metadata
    return !!obj &&
        !!obj.toolCallsMetadata &&
        Array.isArray(obj.toolCallsMetadata.toolCallRounds);
}
function registerToolUserChatParticipant(context) {
    var _this = this;
    var handler = function (request, chatContext, stream, token) { return __awaiter(_this, void 0, void 0, function () {
        var model, models, tools, options, result, messages, toolReferences, accumulatedToolResults, toolCallRounds, runWithTools;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("request", request);
                    if (request.command === 'list') {
                        stream.markdown("Available tools: ".concat(vscode.lm.tools.map(function (tool) { return tool.name; }).join(', '), "\n\n"));
                        return [2 /*return*/];
                    }
                    model = request.model;
                    if (!(model.vendor === 'copilot' && model.family.startsWith('o1'))) return [3 /*break*/, 2];
                    return [4 /*yield*/, vscode.lm.selectChatModels({
                            vendor: 'copilot',
                            family: 'gpt-4o'
                        })];
                case 1:
                    models = _a.sent();
                    model = models[0];
                    _a.label = 2;
                case 2:
                    tools = vscode.lm.tools;
                    options = {
                        justification: 'To make a request to @toolsTSX',
                    };
                    return [4 /*yield*/, (0, prompt_tsx_1.renderPrompt)(toolsPrompt_1.ToolUserPrompt, {
                            context: chatContext,
                            request: request,
                            toolCallRounds: [],
                            toolCallResults: {}
                        }, { modelMaxPromptTokens: model.maxInputTokens }, model)];
                case 3:
                    result = _a.sent();
                    messages = result.messages;
                    result.references.forEach(function (ref) {
                        if (ref.anchor instanceof vscode.Uri || ref.anchor instanceof vscode.Location) {
                            stream.reference(ref.anchor);
                        }
                    });
                    toolReferences = __spreadArray([], request.toolReferences, true);
                    accumulatedToolResults = {};
                    toolCallRounds = [];
                    runWithTools = function () { return __awaiter(_this, void 0, void 0, function () {
                        var requestedTool, response, toolCalls, responseStr, _a, _b, _c, part, e_1_1, result_1, toolResultMetadata;
                        var _d, e_1, _e, _f;
                        return __generator(this, function (_g) {
                            switch (_g.label) {
                                case 0:
                                    requestedTool = toolReferences.shift();
                                    if (requestedTool) {
                                        options.toolMode = vscode.LanguageModelChatToolMode.Required;
                                        options.tools = vscode.lm.tools.filter(function (tool) { return tool.name === requestedTool.name; });
                                    }
                                    else {
                                        options.toolMode = undefined;
                                        options.tools = __spreadArray([], tools, true);
                                    }
                                    return [4 /*yield*/, model.sendRequest(messages, options, token)];
                                case 1:
                                    response = _g.sent();
                                    toolCalls = [];
                                    responseStr = '';
                                    _g.label = 2;
                                case 2:
                                    _g.trys.push([2, 7, 8, 13]);
                                    _a = true, _b = __asyncValues(response.stream);
                                    _g.label = 3;
                                case 3: return [4 /*yield*/, _b.next()];
                                case 4:
                                    if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 6];
                                    _f = _c.value;
                                    _a = false;
                                    part = _f;
                                    if (part instanceof vscode.LanguageModelTextPart) {
                                        stream.markdown(part.value);
                                        responseStr += part.value;
                                    }
                                    else if (part instanceof vscode.LanguageModelToolCallPart) {
                                        toolCalls.push(part);
                                    }
                                    _g.label = 5;
                                case 5:
                                    _a = true;
                                    return [3 /*break*/, 3];
                                case 6: return [3 /*break*/, 13];
                                case 7:
                                    e_1_1 = _g.sent();
                                    e_1 = { error: e_1_1 };
                                    return [3 /*break*/, 13];
                                case 8:
                                    _g.trys.push([8, , 11, 12]);
                                    if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 10];
                                    return [4 /*yield*/, _e.call(_b)];
                                case 9:
                                    _g.sent();
                                    _g.label = 10;
                                case 10: return [3 /*break*/, 12];
                                case 11:
                                    if (e_1) throw e_1.error;
                                    return [7 /*endfinally*/];
                                case 12: return [7 /*endfinally*/];
                                case 13:
                                    if (!toolCalls.length) return [3 /*break*/, 15];
                                    // If the model called any tools, then we do another round- render the prompt with those tool calls (rendering the PromptElements will invoke the tools)
                                    // and include the tool results in the prompt for the next request.
                                    toolCallRounds.push({
                                        response: responseStr,
                                        toolCalls: toolCalls
                                    });
                                    return [4 /*yield*/, (0, prompt_tsx_1.renderPrompt)(toolsPrompt_1.ToolUserPrompt, {
                                            context: chatContext,
                                            request: request,
                                            toolCallRounds: toolCallRounds,
                                            toolCallResults: accumulatedToolResults
                                        }, { modelMaxPromptTokens: model.maxInputTokens }, model)];
                                case 14:
                                    result_1 = (_g.sent());
                                    messages = result_1.messages;
                                    toolResultMetadata = result_1.metadatas.getAll(toolsPrompt_1.ToolResultMetadata);
                                    if (toolResultMetadata === null || toolResultMetadata === void 0 ? void 0 : toolResultMetadata.length) {
                                        // Cache tool results for later, so they can be incorporated into later prompts without calling the tool again
                                        toolResultMetadata.forEach(function (meta) { return accumulatedToolResults[meta.toolCallId] = meta.result; });
                                    }
                                    // This loops until the model doesn't want to call any more tools, then the request is done.
                                    return [2 /*return*/, runWithTools()];
                                case 15: return [2 /*return*/];
                            }
                        });
                    }); };
                    return [4 /*yield*/, runWithTools()];
                case 4:
                    _a.sent();
                    return [2 /*return*/, {
                            metadata: {
                                // Return tool call metadata so it can be used in prompt history on the next request
                                toolCallsMetadata: {
                                    toolCallResults: accumulatedToolResults,
                                    toolCallRounds: toolCallRounds
                                }
                            },
                        }];
            }
        });
    }); };
    var toolUser = vscode.chat.createChatParticipant('copilot-mcp.tools', handler);
    toolUser.iconPath = new vscode.ThemeIcon('tools');
    context.subscriptions.push(toolUser);
}
