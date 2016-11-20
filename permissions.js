
const request = require('request');
const config = require('config');
const apiUrl = config.get('server').get('cmsApiUrl');

function callback(error, response, process) {
  if (!error && response.statusCode == 200) {
    process(true);
    return;
  }
  if (!error && response.statusCode == 401) {
    process(false);
    return;
  }
  process(error);
}

var permissions = {};

permissions.canEditTopicDocument = function(token, topicId, process) {
  return request.get(apiUrl + 'Api/Permissions/Topics/' + topicId + '/Permission/IsAssociatedTo',
    function(error, response, body) {
      callback(error, response, process);
    })
    .auth(null, null, true, token);
};

module.exports = permissions;