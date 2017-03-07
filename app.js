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
"use strict";

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const bodyParser = require('body-parser');
const fs = require('fs');
const formidable = require('formidable');
const syncRequest = require('sync-request');
const config = require('config');
const docManager = require('./helpers/docManager');
const documentService = require('./helpers/documentService');
const fileUtility = require('./helpers/fileUtility');
const jwt = require('jsonwebtoken');
const jwksUtils = require('jwks-utils');
const jws = require('jws-jwk');
const request = require('request');
const morgan = require('morgan');
const mammoth = require('mammoth');
const dateformat = require('dateformat');
const mmmagic = require('mmmagic');
const magic = new mmmagic.Magic(mmmagic.MAGIC_MIME_TYPE);

const logger = require('./logger');

const configServer = config.get('server');
const fileChoiceUrl = configServer.has('fileChoiceUrl') ?
  configServer.get('fileChoiceUrl') : '';
const siteUrl = configServer.get('siteUrl');
const plugins = config.get('plugins');
const permissionService = require('./permissions');

let token;
let userEmail;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('./stringExtensions');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      'Content-Type, Authorization, Content-Length, X-Requested-With, ' +
      'access-control-allow-origin');
    res.sendStatus(200);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(favicon(`${__dirname}/public/images/favicon.ico`));

app.use(morgan('combined'));

/**
 * use auth middleware
 */
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    next(); // skip authorization if in development mode
  } else {
    // to access track, we need a key, which is delivered to the client per call.
    // so we can skip auth for that url
    if (req.originalUrl.indexOf('track') !== -1) {
      logger.info('skip auth');
      next();
      return;
    }
    try {
      logger.info('auth');
      const authToken = req.get('Authorization');
      const at = authToken.slice('Bearer '.length, authToken.length);
      const decodedToken = jwt.decode(at, { complete: true });
      const kid = decodedToken.header.kid;
      const issuer = decodedToken.payload.iss;

      const url = `${issuer}/.well-known/jwks`;

      userEmail = decodedToken.payload.unique_name;
      token = at;

      request({
        url,
        json: true
      }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          const jwk = jwksUtils.findJWK(kid, body);

          if (jws.verify(at, jwk)) {
            logger.info('client authenticated');
            next();
          } else {
            throw new Error();
          }
        }
      });
    } catch (e) {
      res.sendStatus(401);
    }
  }
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// TODO still usable for administration? if not delete
app.get('/', (req, res) => {
  try {
    docManager.init(__dirname, req, res);

    res.render('index', {
      preloaderUrl: siteUrl + configServer.get('preloaderUrl'),
      convertExts: configServer.get('convertedDocs').join(','),
      editedExts: configServer.get('editedDocs').join(','),
      storedFiles: docManager.getStoredFiles(),
      params: docManager.getCustomParams()
    });
  } catch (ex) {
    logger.error(ex);
    res.status(500);
    res.render('error', { message: 'Server error' });
  }
});

app.post('/topic/:id', (req, res) => {
  docManager.init(__dirname, req, res);
  const topicId = req.params.id;
  docManager.storagePath('', topicId); // mkdir if not exist

  const uploadDir = `./public/${configServer.get('storageFolder')}`;

  const form = new formidable.IncomingForm();
  form.uploadDir = uploadDir;
  form.keepExtensions = true;

  form.parse(req, (err, fields, files) => {
    const file = files.uploadedFile;

    magic.detectFile(file.path, function(err, result) {
      //check if file has correct extension
      if(result !== file.type) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.write('{ "error": "File type does not match file extension"}');
        res.end();
        return;
      }

      // if file already exists move to trash
      if (topicExists(topicId)) {
        const fileName = fileUtility.getFileName(`${topicId}.docx`);
        const filePath = docManager.storagePath(fileName, topicId);

        moveToTrash(topicId, path.join(filePath, '..')); // move the whole folder
      }

      file.name = docManager.getCorrectName(`${topicId}.docx`, topicId);
      logger.info(file.name);

      if (configServer.get('maxFileSize') < file.size || file.size <= 0) {
        fs.unlinkSync(file.path);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.write('{ "error": "File size is incorrect"}');
        res.end();
        return;
      }

      const exts = [].concat(
        configServer.get('viewedDocs'),
        configServer.get('editedDocs'),
        configServer.get('convertedDocs')
      );
      const curExt = fileUtility.getFileExtension(file.name);

      if (exts.indexOf(curExt) === -1) {
        fs.unlinkSync(file.path);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.write('{ "error": "File type is not supported"}');
        res.end();
        return;
      }

      fs.rename(file.path, `${uploadDir}/${topicId}/${file.name}`, (err2) => {
        if (err2) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.write(`{ "error": "${err2}"}`);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write(`{ "filename": "${file.name}"}`);

          docManager.saveFileData(file.name, topicId, userEmail);
          docManager.getFileData(file.name, topicId);
        }
        res.end();
      });
    });
  });
});

app.get('/topic/:id/html', (req, res) => {
  docManager.init(__dirname, req, res);
  const topicId = fileUtility.getFileName(`${req.params.id}`);
  const fileName = fileUtility.getFileName(`${req.params.id}.docx`);

  if (!docManager.fileExists(fileName, topicId)) {
    res.sendStatus(404);
  }

  mammoth.convertToHtml({ path: docManager.storagePath(fileName, topicId) })
    .then((result) => {
      const html = result.value;
      res.render('htmlDocument', { html });
    }).catch((error) => {
      logger.error(error.message);
      res.sendStatus(500);
    }).done();
});

const topicExists = function topicExists(id) {
  const fileName = fileUtility.getFileName(`${id}.docx`);
  return docManager.fileExists(fileName, id);
};

const createFolder = function createFolder(folderPath) {
  try {
    fs.accessSync(folderPath);
  } catch (err) {
    logger.info(`Folder ${folderPath} does not exist. Creating...`);
    fs.mkdirSync(folderPath);
  }
};

const moveToTrash = function moveToTrash(fileName, oldPath) {
  const now = new Date();
  const dirName = `${fileName}_${dateformat(now, 'yyyy-mm-dd-HH-MM-ss')}`;
  const trashPath = path.join(docManager.dir, 'trash');
  const newPath = path.join(trashPath, dirName);

  createFolder(trashPath);
  createFolder(newPath);
  try {
    fs.renameSync(oldPath, path.join(newPath, fileName));
  } catch (err) {
    logger.error(err);
  }
};

const deleteTopic = (req, res) => {
  const id = req.params.id;
  try {
    docManager.init(__dirname, req, res);

    if (!topicExists(id)) {
      res.status(405).send('File does not exist on disk'); // 405 = method not allowed (on file)
    } else {
      const fileName = fileUtility.getFileName(`${id}.docx`);
      const filePath = docManager.storagePath(fileName, id);

      moveToTrash(id, path.join(filePath, '..')); // move the whole folder

      res.sendStatus(200);
    }
  } catch (ex) {
    logger.error(ex);
    res.sendStatus(500);
  }
};

app.delete('/topic/:id', (req, res) => {
  const id = req.params.id;
  permissionService.isAllowedToEdit(token, id, (success) => {
    if (success) {
      deleteTopic(req, res);
    } else {
      res.sendStatus(403);
    }
  });
});

/**
 * POST /track
 * tracks all changes made in the editor.
 * Is called by the OnlyOffice Editor. No need to change.
 */
app.post('/track', (req, res) => {
  docManager.init(__dirname, req, res);

  const initialUserAddress = req.query.useraddress;
  const initialFileName = fileUtility.getFileName(req.query.filename);
  let version = 0;

  const processTrack = function processTrack(response, body, fileName, userAddress) {
    const processSave = function processSave(body, fileName, userAddress, newVersion) { // eslint-disable-line no-shadow
      let downloadUri = body.url;
      const curExt = fileUtility.getFileExtension(fileName);
      const downloadExt = fileUtility.getFileExtension(downloadUri);
      const topicId = fileUtility.getFileName(fileName, true);

      if (downloadExt !== curExt) {
        const key = documentService.generateRevisionId(downloadUri);

        try {
          downloadUri = documentService.getConvertedUri(
            downloadUri, downloadExt, curExt, key);
        } catch (ex) {
          logger.error(ex);
          fileName = docManager.getCorrectName( // eslint-disable-line no-param-reassign
            fileUtility.getFileName(fileName, true) + downloadExt, userAddress);
        }
      }

      try {
        const path = docManager.storagePath(fileName, topicId); // eslint-disable-line no-shadow

        if (newVersion) {
          let historyPath = docManager.historyPath(fileName, topicId);
          if (historyPath === '') {
            historyPath = docManager.historyPath(fileName, topicId, true);
            docManager.createDirectory(historyPath);
          }

          const countVersion = docManager.countVersion(historyPath);
          version = countVersion + 1;
          const versionPath = docManager.versionPath(
            fileName, topicId, version);
          docManager.createDirectory(versionPath);

          const downloadZip = body.changesurl;
          if (downloadZip) {
            const pathChanges = docManager.diffPath(
              fileName, topicId, version);
            const diffZip = syncRequest('GET', downloadZip);
            fs.writeFileSync(pathChanges, diffZip.getBody());
          }

          const changeshistory = body.changeshistory;
          if (changeshistory) {
            const pathChangesJson = docManager.changesPath(
              fileName, topicId, version);
            fs.writeFileSync(pathChangesJson, body.changeshistory);
          }

          const pathKey = docManager.keyPath(fileName, topicId, version);
          fs.writeFileSync(pathKey, body.key);

          const pathPrev = docManager.prevFilePath(
            fileName, topicId, version);
          fs.writeFileSync(pathPrev, fs.readFileSync(path));
        }

        const file = syncRequest('GET', downloadUri);
        fs.writeFileSync(path, file.getBody());
      } catch (ex) {
        logger.error(ex);
      }
    };

    if (body.status === 1) { // Editing
      if (body.actions && body.actions[0].type === 0) { // finished edit
        const user = body.actions[0].userid;
        if (body.users.indexOf(user) === -1) {
          const key = body.key;
          try {
            documentService.commandRequest('forcesave', key);
          } catch (ex) {
            logger.error(ex);
          }
        }
      }
    } else if (body.status === 2 || body.status === 3) { // MustSave, Corrupted
      processSave(body, fileName, userAddress, true);
    } else if (body.status === 6 || body.status === 7) { // MustForceSave, CorruptedForceSave
      processSave(body, fileName, userAddress);
    }

    response.write('{"error":0}');
    response.end();
  };

  const readbody = function readbody(request, response, fileName, userAddress) { // eslint-disable-line no-shadow
    let content = '';
    request.on('data', (data) => {
      content += data;
    });
    request.on('end', () => {
      const body = JSON.parse(content);
      processTrack(response, body, fileName, userAddress);
    });
  };

  if (req.body.hasOwnProperty('status')) {
    processTrack(res, req.body, initialFileName, initialUserAddress);
  } else {
    readbody(req, res, initialFileName, initialUserAddress);
  }
});

app.get('/topic/:id/exists', (req, res) => {
  docManager.init(__dirname, req, res);

  if (topicExists(req.params.id)) {
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

/**
 * POST /topic
 * creates a new document with the topic id as name
 */
app.post('/topic', (req, res) => {
  docManager.init(__dirname, req, res);

  const topicId = req.body.topicId ? req.body.topicId : -1;

  if (topicId === -1) {
    res.status(400, 'No Topic id given');
    res.render('error',
      { message: `No Topic id given\n${JSON.stringify(req.body)}${JSON.stringify(req.query)}` }
    );
  } else {
    // user has permission to edit a topic?
    permissionService.canEditTopicDocument(token, topicId, (allowed) => {
      if (allowed) {
        const success = docManager.createTopicDocument(
          `${topicId}.docx`, topicId, userEmail);
        if (success) {
          res.sendStatus(200);
        } else {
          res.sendStatus(409);
        }
      } else {
        res.sendStatus(401);
      }
    });
  }
});

/**
 * GET /topic/:id
 * returns a config for creating an editor on client side
 * @param id the Id of the topic you want to edit
 */
app.get('/topic/:id', (req, res) => {
  try {
    docManager.init(__dirname, req, res);

    const fileName = fileUtility.getFileName(`${req.params.id}.docx`);
    const topicId = req.params.id;
    if (!docManager.fileExists(fileName, topicId)) {
      res.send(404);
      return;
    }

    const history = [];
    const prevUrl = [];
    const diff = [];
    const lang = docManager.getLang();
    const userid = userEmail;
    const email = userEmail;
    const firstName = email;
    const lastName = '';

    const key = docManager.getKey(fileName);
    const url = docManager.getFileUri(fileName);
    const mode = req.query.mode || 'edit'; // mode: view/edit
    const type = req.query.type || 'desktop'; // type: embedded/mobile/desktop
    const canEdit = configServer.get('editedDocs').indexOf(
        fileUtility.getFileExtension(fileName)) !== -1;

    let countVersion = 1;

    const historyPath = docManager.historyPath(fileName, topicId);
    let changes;

    if (historyPath !== '') {
      countVersion = docManager.countVersion(historyPath) + 1;
      const localFileUri = docManager.getlocalFileUri(fileName, 1);
      const fileExt = fileUtility.getFileExtension(fileName);
      let prevPath = `${localFileUri}/prev${fileExt}`;
      let diffPath = null;
      for (let i = 1; i < countVersion; i++) {
        const keyPath = docManager.keyPath(fileName, topicId, i);
        const keyVersion = `${fs.readFileSync(keyPath)}`;
        history.push(docManager.getHistory(fileName, changes, keyVersion, i));

        prevUrl.push(prevPath);
        prevPath = `${docManager.getlocalFileUri(fileName, i)}/prev${fileUtility.getFileExtension(fileName)}`;

        diff.push(diffPath);
        diffPath = `${docManager.getlocalFileUri(fileName, i)}/diff.zip`;

        const changesFile = docManager.changesPath(fileName, topicId, i);
        changes = docManager.getChanges(changesFile);
      }
      prevUrl.push(prevPath);
      diff.push(diffPath);
    } else {
      prevUrl.push(url);
    }
    history.push(docManager.getHistory(fileName, changes, key, countVersion));

    const argss = {
      apiUrl: siteUrl + configServer.get('apiUrl'),
      file: {
        name: fileName,
        ext: fileUtility.getFileExtension(fileName, true),
        uri: url,
        version: countVersion
      },
      editor: {
        type,
        documentType: fileUtility.getFileType(fileName),
        key,
        callbackUrl: docManager.getCallback(fileName),
        isEdit: canEdit,
        mode: canEdit && mode !== 'view' ? 'edit' : 'view',
        canBackToFolder: false,
        getServerUrl: docManager.getServerUrl(),
        curUserHostAddress: docManager.curUserHostAddress(),
        lang,
        userid,
        firstName,
        lastName,
        fileChoiceUrl,
        plugins
      },
      history,
      setHistoryData: {
        url: prevUrl,
        urlDiff: diff
      }
    };

    // res.render('editor', argss);
    res.status(200).send(argss);
  } catch (ex) {
    logger.error(ex);
    res.status(500);
    res.render('error', { message: 'Server error' });
  }
});

app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use((err, req, res) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message
  });
});

module.exports = app;
