/*
 *
 * (c) Copyright Ascensio System Limited 2010-2016
 *
 * This program is freeware. You can redistribute it and/or modify it under the terms of the GNU 
 * General Public License (GPL) version 3 as published by the Free Software Foundation (https://www.gnu.org/copyleft/gpl.html). 
 * In accordance with Section 7(a) of the GNU GPL its Section 15 shall be amended to the effect that 
 * Ascensio System SIA expressly excludes the warranty of non-infringement of any third-party rights.
 *
 * THIS PROGRAM IS DISTRIBUTED WITHOUT ANY WARRANTY; WITHOUT EVEN THE IMPLIED WARRANTY OF MERCHANTABILITY OR
 * FITNESS FOR A PARTICULAR PURPOSE. For more details, see GNU GPL at https://www.gnu.org/copyleft/gpl.html
 *
 * You can contact Ascensio System SIA by email at sales@onlyoffice.com
 *
 * The interactive user interfaces in modified source and object code versions of ONLYOFFICE must display 
 * Appropriate Legal Notices, as required under Section 5 of the GNU GPL version 3.
 *
 * Pursuant to Section 7 § 3(b) of the GNU GPL you must retain the original ONLYOFFICE logo which contains 
 * relevant author attributions when distributing the software. If the display of the logo in its graphic 
 * form is not reasonably feasible for technical reasons, you must include the words "Powered by ONLYOFFICE" 
 * in every copy of the program you distribute. 
 * Pursuant to Section 7 § 3(e) we decline to grant you any rights under trademark law for use of our trademarks.
 *
 */

var path = require("path");
var fileSystem = require("fs");
var fileUtility = require("./fileUtility");
var documentService = require("./documentService");
var cacheManager = require("./cacheManager");
var guidManager = require("./guidManager");
var configServer = require('config').get('server');
var storageFolder = configServer.get('storageFolder');
var os = require("os");
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var docManager = {};

docManager.dir = null;
docManager.req = null;
docManager.res = null;


docManager.fileExists = function (name, topicId) {
  var filePath = path.join(docManager.dir, "public", storageFolder, topicId, name);
  return docManager.existsSync(filePath);
};

docManager.existsSync = function (path) {
  var result = true;
  try {
    fileSystem.accessSync(path, fileSystem.F_OK);
  } catch (e) {
    result = false;
  }
  return result;
};
docManager.createDirectory = function (path) {
  if (!this.existsSync(path)) {
    fileSystem.mkdirSync(path);
  }
};

docManager.init = function (dir, req, res) {
  docManager.dir = dir;
  docManager.req = req;
  docManager.res = res;

  this.createDirectory(path.join(docManager.dir, "public", storageFolder));
};

docManager.getLang = function () {
  if (docManager.req.query.lang) {
    return docManager.req.query.lang;
  } else {
    return "en"
  }
};

docManager.getCustomParams = function () {
  var params = "";

  var userid = docManager.req.query.userid;
  params += (userid ? "&userid=" + userid : "");

  var firstname = docManager.req.query.firstname;
  params += (firstname ? "&firstname=" + firstname : "");

  var lastname = docManager.req.query.lastname;
  params += (lastname ? "&lastname=" + lastname : "");

  var lang = docManager.req.query.lang;
  params += (lang ? "&lang=" + docManager.getLang() : "");

  var fileName = docManager.req.query.fileName;
  params += (fileName ? "&fileName=" + fileName : "");

  var mode = docManager.req.query.mode;
  params += (mode ? "&mode=" + mode : "");

  var type = docManager.req.query.type;
  params += (type ? "&type=" + type : "");

  return params;
};

docManager.getCorrectName = function (fileName, topicId) {
  var baseName = fileUtility.getFileName(fileName, true);
  var ext = fileUtility.getFileExtension(fileName);
  var name = baseName + ext;
  var index = 1;

  while (this.existsSync(docManager.storagePath(name, topicId))) {
    name = baseName + " (" + index + ")" + ext;
    index++;
  }

  return name;
};

docManager.createDemo = function (demoName, userid, username) {
  var fileName = docManager.getCorrectName(demoName);

  docManager.copyFile(path.join(docManager.dir, "public", "samples", demoName), docManager.storagePath("new.docx"));

  docManager.saveFileData(fileName, userid, username);

  return fileName;
};

docManager.createTopicDocument = function (file, topicId, username) {
  //var fileName = docManager.getCorrectName(file, topicId);
  if (this.existsSync(docManager.storagePath(file, topicId))) {
    return false;
  }

  docManager.copyFile(path.join(docManager.dir, "public", "samples", "new.docx"), docManager.storagePath(file, topicId));

  docManager.saveFileData(file, topicId, username);

  return true;
};

docManager.saveFileData = function (fileName, topicId, username) {
  var date_create = fileSystem.statSync(docManager.storagePath(fileName, topicId)).mtime;
  var minutes = (date_create.getMinutes() < 10 ? '0' : '') + date_create.getMinutes().toString();
  var month = (date_create.getMonth() < 10 ? '0' : '') + (parseInt(date_create.getMonth().toString()) + 1);
  var sec = (date_create.getSeconds() < 10 ? '0' : '') + date_create.getSeconds().toString();
  var date_format = date_create.getFullYear() + "-" + month + "-" + date_create.getDate() + " " + date_create.getHours() + ":" + minutes + ":" + sec;

  var file_info = docManager.historyPath(fileName, topicId, true);
  this.createDirectory(file_info);

  fileSystem.writeFileSync(path.join(file_info, fileName + ".txt"), date_format + "," + topicId + "," + username);
};

docManager.getFileData = function (fileName, topicId) {
  var file_info = docManager.historyPath(fileName, topicId, true);
  if (!this.existsSync(file_info)) {
    return ["2016-01-01", "uid-1", "John Smith"];
  }

  return ((fileSystem.readFileSync(path.join(file_info, fileName + ".txt"))).toString()).split(",");
};

docManager.getFileUri = function (fileName) {
  return docManager.getlocalFileUri(fileName);
};

docManager.getlocalFileUri = function (fileName, version) {
  console.log("getlocalFileUri ( " + fileName + " , " + version + " )");
  var serverPath = docManager.getProtocol() + "://" + docManager.req.get("host");
  var storagePath = storageFolder.length ? storageFolder + "/" : "";
  var topicId = fileUtility.getFileName(fileName, true);
  var url = serverPath + "/" + storagePath + topicId + "/" + encodeURIComponent(fileName);
  if (!version) {
    return url;
  }
  return url + "-history/" + version;
};

docManager.getServerUrl = function () {
  return docManager.getProtocol() + "://" + docManager.req.get("host");
};

docManager.getCallback = function (fileName) {
  var server = docManager.getProtocol() + "://" + docManager.req.get("host");
  var hostAddress = docManager.curUserHostAddress();
  var handler = "/track?useraddress=" + encodeURIComponent(hostAddress) + "&filename=" + encodeURIComponent(fileName);

  return server + handler;
};

docManager.storagePath = function (fileName, topicId) {
  fileName = fileUtility.getFileName(fileName);
  var directory = path.join(docManager.dir, "public", storageFolder, topicId);
  this.createDirectory(directory);
  return path.join(directory, fileName);
};

docManager.historyPath = function (fileName, topicId, create) {
  var directory = path.join(docManager.dir, "public", storageFolder, topicId);

  if (!this.existsSync(directory)) {
    return "";
  }
  directory = path.join(directory, fileName + "-history");
  if (!create && !this.existsSync(path.join(directory, "1"))) {
    return "";
  }
  return directory;
};

docManager.versionPath = function (fileName, topicId, version) {
  var historyPath = docManager.historyPath(fileName, topicId, true);
  return path.join(historyPath, "" + version);
};

docManager.prevFilePath = function (fileName, topicId, version) {
  return path.join(docManager.versionPath(fileName, topicId, version), "prev" + fileUtility.getFileExtension(fileName));
};

docManager.diffPath = function (fileName, topicId, version) {
  return path.join(docManager.versionPath(fileName, topicId, version), "diff.zip");
};

docManager.changesPath = function (fileName, topicId, version) {
  return path.join(docManager.versionPath(fileName, topicId, version), "changes.txt");
};

docManager.keyPath = function (fileName, topicId, version) {
  return path.join(docManager.versionPath(fileName, topicId, version), "key.txt");
};

docManager.changesUser = function (fileName, topicId, version) {
  return path.join(docManager.versionPath(fileName, topicId, version), "user.txt");
};

docManager.getStoredFiles = function () {
  var directory = path.join(docManager.dir, "public", storageFolder, docManager.curUserHostAddress());
  this.createDirectory(directory);
  var result = [];
  var storedFiles = fileSystem.readdirSync(directory);
  for (var i = 0; i < storedFiles.length; i++) {
    var stats = fileSystem.lstatSync(path.join(directory, storedFiles[i]));

    if (!stats.isDirectory()) {

      var time = stats.mtime.getTime();
      var item = {
        time: time,
        name: storedFiles[i],
        url: docManager.getlocalFileUri(storedFiles[i]),
        documentType: fileUtility.getFileType(storedFiles[i])
      };

      if (!result.length) {
        result.push(item);
      } else {
        for (var j = 0; j < result.length; j++) {
          if (time > result[j].time) {
            break;
          }
        }
        result.splice(j, 0, item);
      }
    }
  }
  return result;
};

docManager.getProtocol = function () {
  return docManager.req.headers["x-forwarded-proto"] || docManager.req.protocol;
};

docManager.curUserHostAddress = function (userAddress) {
  if (!userAddress)
    userAddress = docManager.req.headers["x-forwarded-for"] || docManager.req.connection.remoteAddress;

  return userAddress.replace(new RegExp("[^0-9a-zA-Z.=]", "g"), "_");
};

docManager.copyFile = function (exist, target) {
  fileSystem.writeFileSync(target, fileSystem.readFileSync(exist));
};

docManager.getInternalExtension = function (fileType) {
  if (fileType == fileUtility.fileType.text)
    return ".docx";

  if (fileType == fileUtility.fileType.spreadsheet)
    return ".xlsx";

  if (fileType == fileUtility.fileType.presentation)
    return ".pptx";

  return ".docx";
};

docManager.getKey = function (fileName) {
  var topicId = fileUtility.getFileName(fileName, true);
  var key = topicId + docManager.getlocalFileUri(fileName);

  var historyPath = docManager.historyPath(fileName, topicId);
  if (historyPath != "") {
    key += docManager.countVersion(historyPath);
  }

  historyPath = docManager.historyPath(fileName, topicId, true);
  var stat = fileSystem.statSync(historyPath);
  key += stat.mtime.toString();

  return documentService.generateRevisionId(key);
};

docManager.getDate = function (date) {
  var minutes = (date.getMinutes() < 10 ? '0' : '') + date.getMinutes().toString();
  return date.getMonth() + "/" + date.getDate() + "/" + date.getFullYear() + " " + date.getHours() + ":" + minutes;
};

docManager.getChanges = function (fileName) {
  return JSON.parse(fileSystem.readFileSync(fileName));
};

docManager.countVersion = function (directory) {
  var i = 0;
  while (this.existsSync(path.join(directory, '' + (i + 1)))) {
    i++;
  }
  return i;
};

docManager.getHistory = function (fileName, content, keyVersion, version) {
  var contentJson = content ? content[0] : null;

  var topicId = fileUtility.getFileName(fileName, true);
  var username = content ? contentJson.username : (docManager.getFileData(fileName, topicId))[2];
  var userid = content ? contentJson.userid : (docManager.getFileData(fileName, topicId))[1];
  var date = content ? contentJson.date : (docManager.getFileData(fileName, topicId))[0];

  return {
    key: keyVersion,
    version: version,
    created: date,
    user: {
      id: userid,
      name: username
    },
    changes: content
  };
};

module.exports = docManager;
