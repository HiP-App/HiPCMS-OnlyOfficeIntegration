const assert = require('chai').assert;

const permissions = require('../permissions');

describe('canEditTopicDocument', () => {
  it('should invoke the callback with `false` when no valid token is given', () => 
      permissions.canEditTopicDocument('', '', success => assert.isFalse(success))
  );
  it('should throw a TypeError if no callback is given', () =>
    assert.throws(() => permissions.canEditTopicDocument('', '', null), TypeError)
  );
});
