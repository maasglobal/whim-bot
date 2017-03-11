'use strict';

const request = require('request');
//const rp = require('request-promise-lite');

//require('request').debug = true
const WHIM_API_URL = process.env.WHIM_API_URL;
const WHIM_API_KEY = process.env.WHIM_API_KEY;
const GOOGLE_API_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const YELP_API_URL = 'https://api.yelp.com/v3/businesses/search';
const YELP_APP_ID = process.env.YELP_APP_ID;
const YELP_APP_SECRET = process.env.YELP_APP_SECRET;
const YELP_ACCESS_TOKEN = process.env.YELP_ACCESS_TOKEN;

console.log('WHIM API KEY', WHIM_API_KEY)
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

module.exports.favorites = (token, callback) => {
  request({
    url: WHIM_API_URL + '/profile',
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true
  }, callback);
};

module.exports.book = (itinerary, token, callback) => {
  request({
    url: WHIM_API_URL + '/itineraries',
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true,
    method: 'POST',
    body: {
      itinerary: itinerary
    }
  }, callback);
};
module.exports.locations = (str, callback) => {
  request({
    url: `${YELP_API_URL}?location=${str}`,
    headers: {
      'Authorization': 'Bearer ' + YELP_ACCESS_TOKEN
    },
    json: true
  }, callback);
};

module.exports.places = (str, lat, lon, callback) => {
  request({
    url: `${YELP_API_URL}?latitude=${lat}&longitude=${lon}&term=${str}&limit=35`,
    headers: {
      'Authorization': 'Bearer ' + YELP_ACCESS_TOKEN
    },
    json: true
  }, callback);
};
