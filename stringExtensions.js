/* eslint-disable no-bitwise*/
/* eslint-disable no-extend-native */
/* eslint-disable prefer-rest-params */

'use strict';

String.prototype.hashCode = function hashCode () {
  let i;
  let len;
  let ret;
  for (ret = 0, i = 0, len = this.length; i < len; i++) {
    ret = ((31 * ret) + this.charCodeAt(i)) << 0;
  }
  return ret;
};
String.prototype.format = function format () {
  let text = this.toString();

  if (!arguments.length) return text;
  for (let i = 0; i < arguments.length; i++) {
    text = text.replace(new RegExp(`\\{${i}\\}`, 'gi'), arguments[i]);
  }
  return text;
};
