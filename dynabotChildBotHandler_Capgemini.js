/* 
 * DynaBot - A ChatBot Framework
 * 
 * Copyright (C) Vale - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * 
 * Written by Ramon Oliveira <ramon.de.oliveira@avanade.com>, August, 2018
 * 
 * DynaBot/Capgemini connector can not be copied and/or distributed without the express
 * permission of Ramon Oliveira <ramon.de.oliveira@avanade.com>
 * 
 */

'use strict';
const request = require('request');
//const util     = require('./dynabotUtilities');
let BotBuilder = require("botbuilder");

//var TurndownService = require('turndown')
//var turndownService = new TurndownService()

const defaultTimeout = 1000;
//const defaultMaxTimeout = 7000;
const defaultIdleAdditionalTime = 0;
var lastmessageLiveChat = "";

/**
 * Transform some html tags to markdown or remove
 * @param {*} str 
 */
var htmlToMarkdown = (str) => {
    if (str.match(/<.*>/)) {
        //str = turndownService.turndown(str);
        str = str.replace(/<br>/g, "\n\n");
        str = str.replace(/<hr class=.split.>/g, "\n\n* * *\n\n");
        str = str.replace(/<p>/g, "");
        str = str.replace(/<\/p>/g, "");
    }
    return str;
}

/**
 * Transform the html menu from Capgemini on a pretty menu for our bot
 * @param {*} s 
 * @param {*} ÿ 
 */
var capHtmlToList = (s, ÿ) => {
    if (ÿ.match(/\x61\x75\x74\x6f\x6d\x61\x74\x69\x63\x72\x65\x77\x6f\x72\x64\x73/)) {
        let o=[],m,n,e=/<\x61\x20\x68\x72\x65\x66[^>]*>([^<]+)<\/\x61>/g;
        let re=/\x72\x65\x77\x6f\x72\x64..\x74\x72\x79..\x72\x65\x77\x6f\x72\x64\([^'"]*['"]([^'"]*)['"]/;
        if (!ÿ.match(re))re=/\x72\x65\x77\x6f\x72\x64\([^'"]*['"]([^'"]*)['"]/;
        while (m=e.exec(ÿ)){n=re.exec(m[0]);o.push({D:m[1],V:n[1]});}
        s.replaceDialog('/dynabot_capOptions',{t:(ÿ.match(/<\x73\x70\x61\x6e[^>]*>([^<]+)<\/\x73\x70\x61\x6e>/)!==null)?ÿ.match(/<\x73\x70\x61\x6e[^>]*>([^<]+)<\/\x73\x70\x61\x6e>/)[1]:" ",o:o});
        return false;
    } else {
        return true;
    }
}

class DynabotChildBotHandler_Capgemini {

    constructor() { }

    static loadConnectorDialogs(bot, masterHandler) {
        bot.dialog("/dynabot_capOptions", [
            (s, t, e, i, n) => {
                let op = {}; s.conversationData.capOptions = t.o;
                t.o.forEach((j) => { op[j.D] = { Value: j.V, Description: j.D }; });
                BotBuilder.Prompts.choice(s, t.t, op, { listStyle: BotBuilder.ListStyle.list, maxRetries: 0 });
            },
            (s, t, e, i, n) => {
                let msg = s.message.text;
                if (!masterHandler.verifyChangeBotTrigger(s)) {
                    if ((t && t.response && t.response.entity) && (t.response.score >= .95))
                        msg = s.conversationData.capOptions.find((f) => { return f.D === t.response.entity }).V;
                    masterHandler.sendMessageToChildBot(s, masterHandler.botList.find((bot) => bot.name === s.conversationData.selectedChildBotName), msg); //(t&&t.response&&t.response.entity)?t.response.entity:s.message.text
                    s.endDialog();
                }
            }
        ]);
    }

    static listenMessagesFromChildBot(session, childbot, masterHandler) {
        var _this = this;
        let botName = childbot.name;
        let auth = session.conversationData.myBotList[botName].auth;
        let userId = session.message.user.id;
        let userName = session.message.user.name;

        if (!userName) {
            if (session && session.userData && session.userData.botAuth && session.userData.botAuth.email) {
                userName = session.userData.botAuth.email;
            }
        }

        var preferredLocale = session.preferredLocale();
        var requestData = this.getRequest("Livechat", childbot, "", preferredLocale, userId, userName, auth.context);

        if (session.conversationData.myBotList[botName].lastPoll) {
            requestData.json.parameters.lastPoll = session.conversationData.myBotList[botName].lastPoll;
            console.log("last poll - listen: " + requestData.json.parameters.lastPoll);
        }

        console.log("Request data: ", requestData);

        request(requestData, (error, response, body) => {
            if (!error && response && response.statusCode == 200 && masterHandler.existsChildBotSchedule(auth.context)) {
                var bodyData = "";
                var msgdecodificada = "";

                if (body.type) {
                    bodyData = body;
                    console.log("type: " + body.type);
                    msgdecodificada = Buffer.from(bodyData.values.text, 'base64').toString();

                    let triggersNotificationLiveChat = session.getFromCatalog("dbot:odigo:notification").split("|");
                    let notificationOdigo = triggersNotificationLiveChat.filter((item) => { return item == msgdecodificada }).length > 0;

                    if (body.type == "notification" && notificationOdigo) {
                        msgdecodificada = "";
                        session.sendTyping();
                    }
                }

                masterHandler.setChildBotScheduleTimeout(auth.context, masterHandler.getChildBotScheduleTimeout(auth.context) + defaultIdleAdditionalTime);
                session.conversationData.myBotList[botName].lastPoll = requestData.json.parameters.timestamp;
                console.log("update last poll - listen: " + requestData.json.parameters.timestamp);

                let triggersFinishedLiveChat = session.getFromCatalog("dbot:odigo:finishedLiveChat").split("|");
                let finishedLiveChat = triggersFinishedLiveChat.filter((item) => { return item == msgdecodificada }).length > 0;

                //Livechat Ended - finalizando o livechat               
                if (session.conversationData.myBotList[botName].startLiveChat && finishedLiveChat) {
                    session.conversationData.myBotList[botName].startLiveChat = false;
                    delete session.conversationData.myBotList[botName].lastPoll;
                    console.log("finalizou o listen, com a msg: " + msgdecodificada);
                    //Renova o contexto
                    this.sendMessageToChildBot_start(session, childbot, masterHandler, session.getFromCatalog("odigo:child:welcome"));
                }

                if (msgdecodificada.trim().length > 0 && !finishedLiveChat && lastmessageLiveChat != msgdecodificada) {
                    console.log("Enviar mensagem C: ", msgdecodificada);
                    if (capHtmlToList(session, msgdecodificada)) session.sendWithDelay(htmlToMarkdown(msgdecodificada));
                    lastmessageLiveChat = msgdecodificada;
                    console.log("mensagem do livechat: ", msgdecodificada);
                }
            } else {
                // if ((response) && (response.statusCode == '404')) { // Error 404: when connection is lost
                //     return;
                // }
                session.sendWithDelay("Não foi possível a conexão com a plataforma Odigo.");
                console.log('Error (listenMessagesFromChildBot): ', response, "statusCode:", response.statusCode);
            }

            if (session.conversationData.myBotList[botName].startLiveChat) {
                setTimeout(() => {
                    _this.listenMessagesFromChildBot(session, childbot, masterHandler);
                }, masterHandler.getChildBotScheduleTimeout(auth.context));
            }
        });
    }

    static sendMessageToChildBot_post(session, childbot, masterHandler, msg) {
        var _this = this;
        let botName = childbot.name;
        let auth = session.conversationData.myBotList[botName].auth;
        let userId = session.message.user.id;
        let userName = session.message.user.name;

        if (!userName) {
            if (session && session.userData && session.userData.botAuth && session.userData.botAuth.email) {
                userName = session.userData.botAuth.email;
            }
        }

        var preferredLocale = session.preferredLocale();

        if (masterHandler.existsChildBotSchedule(auth.context)) {
            var requestData = {};
            if (session.conversationData.myBotList[botName].startLiveChat) {
                requestData = this.getRequest("Livechatpost", childbot, msg, preferredLocale, userId, userName, auth.context);
            } else {
                requestData = this.getRequest("Assistant", childbot, msg, preferredLocale, userId, userName, auth.context);
            }

            if (session.userData.debug == 'true') {
                //session.send(JSON.stringify({ status: "[post] 1. Envio request para o bot da Cap", request: requestData/*, body:body*/ }));
            }

            request(requestData, (error, response, body) => {
                if (session.userData.debug == 'true') {
                    //session.send(JSON.stringify({ status: "[post] 1. Recebeu retorno do bot da Cap", error: error, response: response/*, body:body*/ }));
                }

                if (!error && response && response.statusCode == 200) {
                    var mensagem = "";
                    var msgdecodificada = "";

                    if (body.trim().length > 0) {
                        mensagem = JSON.parse(body);

                        if (mensagem && mensagem.context) {
                            mensagem.context = Buffer.from(mensagem.context, 'base64').toString();
                            if (mensagem.context != session.conversationData.myBotList[botName].auth.context) {
                                session.conversationData.myBotList[botName].auth.context = mensagem.context;
                                masterHandler.setChildBotScheduleTimeout(session.conversationData.myBotList[botName].auth.context, defaultTimeout);
                            }
                        }

                        if (mensagem.typeResponse != "NAWaitingForOperator") {
                            msgdecodificada = Buffer.from(mensagem.text, 'base64').toString();
                        }
                    }

                    let triggersStartLiveChat = session.getFromCatalog("dbot:odigo:startLiveChat").split("|");
                    let startedLiveChat = triggersStartLiveChat.filter((item) => { return item == msgdecodificada }).length > 0;
                    if (startedLiveChat) {
                        console.log("started livechat");
                        session.conversationData.myBotList[botName].startLiveChat = true;
                        delete session.conversationData.myBotList[botName].lastPoll;
                        console.log("started listen");
                        this.listenMessagesFromChildBot(session, childbot, masterHandler);
                    }

                    if (msgdecodificada.trim().length > 0) {
                        if (session.conversationData.myBotList[botName].startLiveChat) {
                            console.log("Enviar mensagem A: ", msgdecodificada);
                            session.sendWithDelay(htmlToMarkdown(msgdecodificada));
                        } else {
                            console.log("Enviar mensagem B: ", msgdecodificada);
                            if (capHtmlToList(session, msgdecodificada)) session.sendWithDelay(htmlToMarkdown(msgdecodificada));
                        }
                    }
                } else {
                    masterHandler.deleteChildBotSchedule(auth.context);
                    session.sendWithDelay("Não foi possível a conexão com a plataforma Odigo.");
                }
            });
        } else {
            _this.sendMessageToChildBot_start(session, childbot, masterHandler, msg);
        }
    }

    static sendMessageToChildBot_start(session, childbot, masterHandler, msg) {
        var _this = this;
        let userId = session.message.user.id;
        let userName = session.message.user.name;

        if (!userName) {
            if (session && session.userData && session.userData.botAuth && session.userData.botAuth.email) {
                userName = session.userData.botAuth.email;
            }
        }

        var preferredLocale = session.preferredLocale();

        var requestData = this.getRequest("Start", childbot, msg, preferredLocale, userId, userName, null);
        request(requestData, (error, response, body) => {

            if (session.userData.debug == 'true') {
                //session.send(JSON.stringify({ status: "[start] 1. Recebeu retorno do bot da Cap", error: error, response: response/*, body:body*/ }));
            }

            if (!error && response && response.statusCode == 200) {
                let botName = childbot.name;
                if (!session.conversationData.myBotList) session.conversationData.myBotList = {};
                if (!session.conversationData.myBotList[botName]) session.conversationData.myBotList[botName] = {};

                var bodyCap = JSON.parse(body);
                bodyCap.context = Buffer.from(bodyCap.context, 'base64').toString();
                session.conversationData.myBotList[botName].auth = bodyCap;
                masterHandler.setChildBotScheduleTimeout(session.conversationData.myBotList[botName].auth.context, defaultTimeout);

                if (!session.conversationData.myBotList[botName].started) {

                    console.log('Conexão Realizada com Sucesso! Context: ', bodyCap.context);
                    //msg welcome    
                    //description = session.getFromCatalog('dbot:masterbot:messageWhenStartChildBot', description);
                    //session.sendWithDelay(description, 0);
                    //session.sendWithDelay(description.replace(/<br>/g, '\n'), 0);

                    msg = session.getFromCatalog("odigo:child:welcome");

                    session.conversationData.myBotList[botName].started = "true";
                }
                _this.sendMessageToChildBot_post(session, childbot, masterHandler, msg);
            } else {
                session.sendWithDelay("Não foi possível a conexão com a plataforma Odigo.");
            }
        });
    }

    static getRequest(type, childbot, msg, language, userId, userName, contexto) {
        let email = userId.replace('sip:', '');
        let matricula = email;
        let pos = email.indexOf('@');
        if (pos > -1) {
            matricula = email.substr(0, pos);
        }

        //Request default Star(recuperar o contexto)
        let requestData = {
            method: 'GET',
            uri: childbot.urlApi + "/talk",
            //uri: "https://sma-uat-adm.prosodie.com/servlet/talk",
            qs: {
                userInput: msg,
                botId: childbot.directLineKey,
                space: "VALE",
                language: language,
                format: "JSon",
                user_id: matricula,
                user_mail: email,
                user_name: userName,
                qualificationMode: childbot.qualificationMode//only producao, indica se é test ou não: true = teste, false = produção
            }
        };

        if (type == "Assistant") {
            requestData.qs.context = contexto;
            requestData.qs.mode = "Synchron";
            requestData.qs.solutionUsed = "ASSISTANT";
        } else if (type == "Livechatpost") {
            requestData.qs.context = contexto;
            requestData.qs.mode = "Synchron";
            requestData.qs.solutionUsed = "LIVECHAT";
        } else if (type == "Livechat") {
            requestData = {
                method: "POST",
                uri: childbot.urlApi + "/chatHttp",
                //uri: "https://sma-uat-adm.prosodie.com/servlet/chatHttp",
                headers: {
                    "content-type": "application/json"
                },
                json: {
                    "type": "poll",
                    "parameters": {
                        "contextId": contexto,
                        "mode": "Polling",
                        "solutionUsed": "LIVECHAT",
                        "timestamp": new Date().getTime(),
                        "lastPoll": null,
                        "botId": childbot.directLineKey,
                        "space": "VALE",
                        "language": language,
                        "format": "JSon",
                        "user_id": matricula,
                        "user_mail": email,
                        "user_name": userName,
                        "qualificationMode": childbot.qualificationMode
                    }
                }
            }
        }

        return requestData;
    }
}


module.exports.DynabotChildBotHandler_Capgemini = DynabotChildBotHandler_Capgemini;