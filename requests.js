var request = require('request');

var WHIM_API_URL = 'https://api.test.maas.global';
var WHIM_API_KEY = process.env.WHIM_API_KEY;

module.exports.unlink = function (psid, callback) {
  request({
    url: 'https://graph.facebook.com/v2.6/me/unlink_accounts',
    method: 'POST',
    qs: {
      access_token: process.env.FACEBOOK_PAGE_TOKEN
    },
    body: {
      psid: psid
    },
    json: true
  }, callback);
};

module.exports.requestCode = function (phone, callback) {
  request({
    url: WHIM_API_URL + '/auth/sms-request-code',
    qs: {
      phone: phone
    },
    headers: {
      'X-API-Key': WHIM_API_KEY
    },
    json: true
  }, callback);
};

module.exports.login = function (phone, code, callback) {
  request({
    url: WHIM_API_URL + '/auth/sms-login',
    qs: {
      phone: phone,
      code: code
    },
    headers: {
      'X-API-Key': WHIM_API_KEY
    },
    json: true
  }, callback);
};

module.exports.routes = function (from, to, token, callback) {
  request({
    url: WHIM_API_URL + '/routes',
    qs: {
      from: from.latitude + ',' + from.longitude,
      to: to.latitude + ',' + to.longitude,
    },
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true
  }, callback);
};