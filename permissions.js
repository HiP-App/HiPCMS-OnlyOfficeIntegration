
const request = require('request');
const config = require('config');

const apiUrl = config.get('server').get('cmsApiUrl');

function createResponseHandler(process) {
  return function responseHandler(error, response) {
    if (!error && response.statusCode === 200) {
      process(true);
      return;
    }
    if (!error && response.statusCode === 401) {
      process(false);
      return;
    }
    process(error);
  };
}

const permissions = {};

permissions.canEditTopicDocument = function (token, topicId, process) {
  return request.get(
    `${apiUrl}Api/Permissions/Topics/${topicId}/Permission/IsAssociatedTo`,
    createResponseHandler(process)
  ).auth(null, null, true, token);
};

permissions.isAllowedToEdit = function (token, topicId, process) {
  return request.get(
    `${apiUrl}Api/Permissions/Topics/${topicId}/Permission/IsAllowedToEdit`,
    createResponseHandler(process)
  ).auth(null, null, true, token);
};

module.exports = permissions;
