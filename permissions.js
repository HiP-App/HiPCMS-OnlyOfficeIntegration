
const request = require('request');
const config = require('config');

const apiUrl = config.get('server').get('cmsApiUrl');

function createResponseHandler (process) {
  return function responseHandler (error, response) {
    if (error) {
      process(error);
      return;
    }
    process(response.statusCode === 200);
  };
}

function canEditTopicDocument (token, topicId, process) {
  if (typeof process !== 'function') {
    throw new TypeError(`expected process to be a function, got ${typeof process} instead`);
  }
  return request.get(
    `${apiUrl}Api/Permissions/Topics/${topicId}/Permission/IsAssociatedTo`,
    createResponseHandler(process)
  ).auth(null, null, true, token);
}

function isAllowedToEdit (token, topicId, process) {
  return request.get(
    `${apiUrl}Api/Permissions/Topics/${topicId}/Permission/IsAllowedToEdit`,
    createResponseHandler(process)
  ).auth(null, null, true, token);
}

module.exports = {
  canEditTopicDocument,
  isAllowedToEdit
};
