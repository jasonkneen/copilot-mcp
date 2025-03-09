"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolResultMetadata = exports.ToolUserPrompt = void 0;
var prompt_tsx_1 = require("@vscode/prompt-tsx");
var promptElements_1 = require("@vscode/prompt-tsx/dist/base/promptElements");
var vscode = require("vscode");
var toolParticipant_1 = require("./toolParticipant");
var ToolUserPrompt = /** @class */ (function (_super) {
    __extends(ToolUserPrompt, _super);
    function ToolUserPrompt() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ToolUserPrompt.prototype.render = function (_state, _sizing) {
        return (vscpp(vscppf, null,
            vscpp(prompt_tsx_1.UserMessage, null,
                "Instructions: ",
                vscpp("br", null),
                "- The user will ask a question, or ask you to perform a task, and it may require lots of research to answer correctly. There is a selection of tools that let you perform actions or retrieve helpful context to answer the user's question. ",
                vscpp("br", null),
                "- If you aren't sure which tool is relevant, you can call multiple tools. You can call tools repeatedly to take actions or gather as much context as needed until you have completed the task fully. Don't give up unless you are sure the request cannot be fulfilled with the tools you have. ",
                vscpp("br", null),
                "- Don't make assumptions about the situation- gather context first, then perform the task or answer the question. ",
                vscpp("br", null),
                "- Don't ask the user for confirmation to use tools, just use them."),
            vscpp(History, { context: this.props.context, priority: 10 }),
            vscpp(PromptReferences, { references: this.props.request.references, priority: 20 }),
            vscpp(prompt_tsx_1.UserMessage, null, this.props.request.prompt),
            vscpp(ToolCalls, { toolCallRounds: this.props.toolCallRounds, toolInvocationToken: this.props.request.toolInvocationToken, toolCallResults: this.props.toolCallResults })));
    };
    return ToolUserPrompt;
}(prompt_tsx_1.PromptElement));
exports.ToolUserPrompt = ToolUserPrompt;
var dummyCancellationToken = new vscode.CancellationTokenSource().token;
/**
 * Render a set of tool calls, which look like an AssistantMessage with a set of tool calls followed by the associated UserMessages containing results.
 */
var ToolCalls = /** @class */ (function (_super) {
    __extends(ToolCalls, _super);
    function ToolCalls() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ToolCalls.prototype.render = function (_state, _sizing) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (!this.props.toolCallRounds.length) {
                    return [2 /*return*/, undefined];
                }
                // Note- for the copilot models, the final prompt must end with a non-tool-result UserMessage
                return [2 /*return*/, vscpp(vscppf, null,
                        this.props.toolCallRounds.map(function (round) { return _this.renderOneToolCallRound(round); }),
                        vscpp(prompt_tsx_1.UserMessage, null, "Above is the result of calling one or more tools. The user cannot see the results, so you should explain them to the user if referencing them in your answer."))];
            });
        });
    };
    ToolCalls.prototype.renderOneToolCallRound = function (round) {
        var _this = this;
        var assistantToolCalls = round.toolCalls.map(function (tc) { return ({ type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) }, id: tc.callId }); });
        return (vscpp(prompt_tsx_1.Chunk, null,
            vscpp(prompt_tsx_1.AssistantMessage, { toolCalls: assistantToolCalls }, round.response),
            round.toolCalls.map(function (toolCall) {
                return vscpp(ToolResultElement, { toolCall: toolCall, toolInvocationToken: _this.props.toolInvocationToken, toolCallResult: _this.props.toolCallResults[toolCall.callId] });
            })));
    };
    return ToolCalls;
}(prompt_tsx_1.PromptElement));
/**
 * One tool call result, which either comes from the cache or from invoking the tool.
 */
var ToolResultElement = /** @class */ (function (_super) {
    __extends(ToolResultElement, _super);
    function ToolResultElement() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ToolResultElement.prototype.render = function (state, sizing) {
        return __awaiter(this, void 0, void 0, function () {
            var tool, tokenizationOptions, toolResult, _a;
            var _this = this;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        tool = vscode.lm.tools.find(function (t) { return t.name === _this.props.toolCall.name; });
                        if (!tool) {
                            console.error("Tool not found: ".concat(this.props.toolCall.name));
                            return [2 /*return*/, vscpp(prompt_tsx_1.ToolMessage, { toolCallId: this.props.toolCall.callId }, "Tool not found")];
                        }
                        tokenizationOptions = {
                            tokenBudget: sizing.tokenBudget,
                            countTokens: function (content) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                return [2 /*return*/, sizing.countTokens(content)];
                            }); }); },
                        };
                        if (!((_b = this.props.toolCallResult) !== null && _b !== void 0)) return [3 /*break*/, 1];
                        _a = _b;
                        return [3 /*break*/, 3];
                    case 1: return [4 /*yield*/, vscode.lm.invokeTool(this.props.toolCall.name, { input: this.props.toolCall.input, toolInvocationToken: this.props.toolInvocationToken, tokenizationOptions: tokenizationOptions }, dummyCancellationToken)];
                    case 2:
                        _a = _c.sent();
                        _c.label = 3;
                    case 3:
                        toolResult = _a;
                        return [2 /*return*/, (vscpp(prompt_tsx_1.ToolMessage, { toolCallId: this.props.toolCall.callId },
                                vscpp("meta", { value: new ToolResultMetadata(this.props.toolCall.callId, toolResult) }),
                                vscpp(promptElements_1.ToolResult, { data: toolResult })))];
                }
            });
        });
    };
    return ToolResultElement;
}(prompt_tsx_1.PromptElement));
var ToolResultMetadata = /** @class */ (function (_super) {
    __extends(ToolResultMetadata, _super);
    function ToolResultMetadata(toolCallId, result) {
        var _this = _super.call(this) || this;
        _this.toolCallId = toolCallId;
        _this.result = result;
        return _this;
    }
    return ToolResultMetadata;
}(prompt_tsx_1.PromptMetadata));
exports.ToolResultMetadata = ToolResultMetadata;
/**
 * Render the chat history, including previous tool call/results.
 */
var History = /** @class */ (function (_super) {
    __extends(History, _super);
    function History() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    History.prototype.render = function (_state, _sizing) {
        return (vscpp(prompt_tsx_1.PrioritizedList, { priority: this.props.priority, descending: false }, this.props.context.history.map(function (message) {
            if (message instanceof vscode.ChatRequestTurn) {
                return (vscpp(vscppf, null,
                    vscpp(PromptReferences, { references: message.references, excludeReferences: true }),
                    vscpp(prompt_tsx_1.UserMessage, null, message.prompt)));
            }
            else if (message instanceof vscode.ChatResponseTurn) {
                var metadata = message.result.metadata;
                if ((0, toolParticipant_1.isTsxToolUserMetadata)(metadata) && metadata.toolCallsMetadata.toolCallRounds.length > 0) {
                    return vscpp(ToolCalls, { toolCallResults: metadata.toolCallsMetadata.toolCallResults, toolCallRounds: metadata.toolCallsMetadata.toolCallRounds, toolInvocationToken: undefined });
                }
                return vscpp(prompt_tsx_1.AssistantMessage, null, chatResponseToString(message));
            }
        })));
    };
    return History;
}(prompt_tsx_1.PromptElement));
/**
 * Convert the stream of chat response parts into something that can be rendered in the prompt.
 */
function chatResponseToString(response) {
    return response.response
        .map(function (r) {
        if (r instanceof vscode.ChatResponseMarkdownPart) {
            return r.value.value;
        }
        else if (r instanceof vscode.ChatResponseAnchorPart) {
            if (r.value instanceof vscode.Uri) {
                return r.value.fsPath;
            }
            else {
                return r.value.uri.fsPath;
            }
        }
        return '';
    })
        .join('');
}
/**
 * Render references that were included in the user's request, eg files and selections.
 */
var PromptReferences = /** @class */ (function (_super) {
    __extends(PromptReferences, _super);
    function PromptReferences() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    PromptReferences.prototype.render = function (_state, _sizing) {
        var _this = this;
        return (vscpp(prompt_tsx_1.UserMessage, null, this.props.references.map(function (ref) { return (vscpp(PromptReferenceElement, { ref: ref, excludeReferences: _this.props.excludeReferences })); })));
    };
    return PromptReferences;
}(prompt_tsx_1.PromptElement));
var PromptReferenceElement = /** @class */ (function (_super) {
    __extends(PromptReferenceElement, _super);
    function PromptReferenceElement() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    PromptReferenceElement.prototype.render = function (_state, _sizing) {
        return __awaiter(this, void 0, void 0, function () {
            var value, fileContents, rangeText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        value = this.props.ref.value;
                        if (!(value instanceof vscode.Uri)) return [3 /*break*/, 2];
                        return [4 /*yield*/, vscode.workspace.fs.readFile(value)];
                    case 1:
                        fileContents = (_a.sent()).toString();
                        return [2 /*return*/, (vscpp(Tag, { name: "context" },
                                !this.props.excludeReferences && vscpp("references", { value: [new prompt_tsx_1.PromptReference(value)] }),
                                value.fsPath,
                                ":",
                                vscpp("br", null),
                                "``` ",
                                vscpp("br", null),
                                fileContents,
                                vscpp("br", null),
                                "```",
                                vscpp("br", null)))];
                    case 2:
                        if (!(value instanceof vscode.Location)) return [3 /*break*/, 4];
                        return [4 /*yield*/, vscode.workspace.openTextDocument(value.uri)];
                    case 3:
                        rangeText = (_a.sent()).getText(value.range);
                        return [2 /*return*/, (vscpp(Tag, { name: "context" },
                                !this.props.excludeReferences && vscpp("references", { value: [new prompt_tsx_1.PromptReference(value)] }),
                                value.uri.fsPath,
                                ":",
                                value.range.start.line + 1,
                                "-$",
                                vscpp("br", null),
                                value.range.end.line + 1,
                                ": ",
                                vscpp("br", null),
                                "```",
                                vscpp("br", null),
                                rangeText,
                                vscpp("br", null),
                                "```"))];
                    case 4:
                        if (typeof value === 'string') {
                            return [2 /*return*/, vscpp(Tag, { name: "context" }, value)];
                        }
                        _a.label = 5;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return PromptReferenceElement;
}(prompt_tsx_1.PromptElement));
var Tag = /** @class */ (function (_super) {
    __extends(Tag, _super);
    function Tag() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Tag.prototype.render = function () {
        var name = this.props.name;
        if (!Tag._regex.test(name)) {
            throw new Error("Invalid tag name: ".concat(this.props.name));
        }
        return (vscpp(vscppf, null,
            '<' + name + '>',
            vscpp("br", null),
            vscpp(vscppf, null,
                this.props.children,
                vscpp("br", null)),
            '</' + name + '>',
            vscpp("br", null)));
    };
    Tag._regex = /^[a-zA-Z_][\w.-]*$/;
    return Tag;
}(prompt_tsx_1.PromptElement));
