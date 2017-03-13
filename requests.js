'use strict';

//const request = require('request');
const request = require('request-promise-lite');

//require('request').debug = true
const WHIM_API_URL = process.env.WHIM_API_URL;
const WHIM_API_KEY = process.env.WHIM_API_KEY;
const GOOGLE_API_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const YELP_API_URL = 'https://api.yelp.com/v3/businesses/search';
const YELP_APP_ID = process.env.YELP_APP_ID;
const YELP_APP_SECRET = process.env.YELP_APP_SECRET;
const YELP_ACCESS_TOKEN = process.env.YELP_ACCESS_TOKEN;

module.exports.unlink = function (psid, callback) {
  return request.post(`https://graph.facebook.com/v2.6/me/unlink_accounts?access_token=${process.env.FB_PAGE_TOKEN}`, {
    method: 'POST',
    form: {
      psid: psid
    },
    json: true
  });
};

module.exports.requestCode = function (phone, callback) {
  return request.get(WHIM_API_URL + '/auth/sms-request-code', {
    qs: {
      phone: phone
    },
    headers: {
      'X-API-Key': WHIM_API_KEY
    },
    json: true
  });
};

module.exports.login = function (phone, code, callback) {
  return request.get(WHIM_API_URL + '/auth/sms-login', {
    qs: {
      phone: phone,
      code: code
    },
    headers: {
      'X-API-Key': WHIM_API_KEY
    },
    json: true
  });
};

module.exports.routes = function (from, to, token, callback) {
  return request.get(WHIM_API_URL + '/routes', {
    qs: {
      from: from.latitude + ',' + from.longitude,
      to: to.latitude + ',' + to.longitude,
    },
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true
  });
};

module.exports.favorites = (token, callback) => {
  return request.get( WHIM_API_URL + '/profile', {
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true
  });
};

module.exports.reverse = (lat, lon, token, callback) => {
  return request.get(`${WHIM_API_URL}/geocoding/reverse`, {
    qs: {
      lat: lat,
      lon: lon,
    },
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true
  });
};

module.exports.geocode = (text, lat, lon, token, callback) => {
  return request.get(`${WHIM_API_URL}/geocoding`, {
    qs: {
      name: text,
      lat: lat,
      lon: lon,
    },
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true
  });
};

module.exports.book = (itinerary, token, callback) => {
  return request.post(WHIM_API_URL + '/itineraries', {
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token
    },
    json: true,
    method: 'POST',
    body: {
      itinerary: itinerary
    }
  });
};
module.exports.locations = (str, callback) => {
  if (callback) {
    throw new Error('Should not sepcify a callback for primisified requests');
  }
  return request.get(YELP_API_URL, {
    qs: {
      location: str,
    },
    headers: {
      'Authorization': 'Bearer ' + YELP_ACCESS_TOKEN
    },
    json: true
  });
};

module.exports.places = (str, lat, lon, callback) => {
  if (callback) {
    throw new Error('Should not sepcify a callback for primisified requests');
  }
  return request.get(YELP_API_URL,{
    qs: {
      latitude: lat,
      longitude: lon,
      term: str,
      limit: 15,
      open_now: true,
    },
    headers: {
      'Authorization': 'Bearer ' + YELP_ACCESS_TOKEN
    },
    json: true
  });
};

module.exports.localTime = (lat, lon, utcTime, callback) => {
  const url = `https://maps.googleapis.com/maps/api/timezone/json`;
  return request.get(url, {
    qs: {
      lat: lat,
      lon: lon,
      timestamp: utcTime,
    },
    json: true
  });
}

module.exports.whimCarAvailability = (lat, lon, utcTime, callback) => {
  if (callback) {
    throw new Error('Should not sepcify a callback for primisified requests');
  }
  const url = `https://maps.googleapis.com/maps/api/timezone/json`;
  return request.get(url, {
    qs: {
      lat: lat,
      lon: lon,
      timestamp: utcTime,
    },
    json: true
  });
}